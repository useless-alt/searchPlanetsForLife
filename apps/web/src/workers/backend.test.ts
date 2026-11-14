import {
  DEFAULT_FILTERS,
  DEFAULT_SETTINGS,
  makeParam,
  nullParam,
  type ParamValue,
  type PlanetRecord,
  type Provenance,
  type RawParamKey,
} from '@exo/shared';
import { describe, expect, it } from 'vitest';

import {
  StaleComputeError,
  createComputeBackend,
  createInlineBackend,
  type BackendChannel,
} from './computeBackend';
import { DEFAULT_SORT_SPEC, type WorkerRequest, type WorkerResponse } from './protocol';

/**
 * Тесты бэкенда расчёта (задача 12).
 *
 * Проверяются: протокол воркера, отбрасывание устаревших ответов,
 * объединение пересчётов и скорость запасной реализации в основном потоке.
 */

const SOURCE_DATE = '2026-11-01T00:00:00.000Z';

/** Значение параметра с заданным происхождением. */
function param(value: number | null, provenance: Provenance = 'measured'): ParamValue {
  return value === null ? nullParam() : makeParam(value, provenance, 'nasa', SOURCE_DATE);
}

/** Планета, похожая на Землю; значения меняются от индекса для разнообразия. */
function planet(
  index: number,
  overrides: Partial<Record<RawParamKey, ParamValue>> = {},
): PlanetRecord {
  const radius = 0.8 + (index % 40) * 0.03;
  const params: Record<RawParamKey, ParamValue> = {
    pl_rade: param(radius),
    pl_bmasse: param(radius ** 3),
    pl_orbsmax: param(0.8 + (index % 20) * 0.05),
    pl_orbper: param(200 + (index % 50) * 7.5),
    pl_orbeccen: param((index % 10) * 0.01),
    pl_insol: param(1),
    pl_eqt: param(255),
    st_teff: param(5778),
    st_rad: param(1),
    st_mass: param(1),
    st_lum: param(0),
    sy_dist: param(10 + (index % 100)),
    ra: param((index % 360) * 1),
    dec: param((index % 180) - 90),
    ...overrides,
  };

  return {
    id: `planet-${index}`,
    name: `Планета ${index}`,
    aliases: [],
    hostname: `Звезда ${index}`,
    letter: 'b',
    hostAliases: [],
    sources: ['nasa'],
    warnings: [],
    params,
  };
}

/** Счётчики-маркер: по ним видно, какой ответ применился. */
function counters(total: number) {
  return { total, computed: total, strictMeasured: total, matching: total };
}

/** Ручной транспорт: тест сам управляет ответами. */
function createManualChannel(): {
  channel: BackendChannel;
  sent: WorkerRequest[];
  emit: (message: WorkerResponse) => void;
} {
  const sent: WorkerRequest[] = [];
  let handler: ((message: WorkerResponse) => void) | null = null;

  return {
    channel: {
      send(message) {
        sent.push(message);
      },
      subscribe(next) {
        handler = next;
      },
      close() {
        handler = null;
      },
    },
    sent,
    emit(message) {
      handler?.(message);
    },
  };
}

describe('бэкенд основного потока', () => {
  it('инициализируется один раз и отвечает на все запросы протокола', async () => {
    const backend = createInlineBackend();
    const count = await backend.init([planet(1), planet(2)]);

    expect(count).toBe(2);

    const result = await backend.compute(DEFAULT_SETTINGS, DEFAULT_FILTERS, DEFAULT_SORT_SPEC);

    expect(result.rows).toHaveLength(2);
    expect(result.counters.total).toBe(2);
    expect(result.rows[0]?.name).toMatch(/^Планета /);
    expect(result.rows[0]?.sourcesCount).toBe(1);
    expect(result.rows[0]?.qBadge).toBe('high');

    const resolved = await backend.getResolved(['planet-1']);
    expect(resolved.map((item) => item.id)).toEqual(['planet-1']);

    const positions = await backend.getPositions();
    expect(positions).toHaveLength(2);
    expect(positions[0]).toEqual({
      id: 'planet-1',
      ra: 1,
      dec: -89,
      dist_pc: 11,
    });
  });

  it('возвращает ошибку, если каталог ещё не передан', async () => {
    const backend = createInlineBackend();

    await expect(
      backend.compute(DEFAULT_SETTINGS, DEFAULT_FILTERS, DEFAULT_SORT_SPEC),
    ).rejects.toThrow('сначала init');
  });
});

describe('объединение пересчётов', () => {
  it('три compute подряд: выполняется только последний, устаревшие ответы отброшены', async () => {
    const manual = createManualChannel();
    const backend = createComputeBackend(manual.channel);

    const first = backend.compute(DEFAULT_SETTINGS, DEFAULT_FILTERS, DEFAULT_SORT_SPEC);
    const second = backend.compute(DEFAULT_SETTINGS, DEFAULT_FILTERS, DEFAULT_SORT_SPEC);
    const third = backend.compute(DEFAULT_SETTINGS, DEFAULT_FILTERS, DEFAULT_SORT_SPEC);

    // Вытесненный запрос отменяется сразу, в очередь не попадает.
    await expect(second).rejects.toBeInstanceOf(StaleComputeError);

    // Выполняется только первый (он уже ушёл) — остальные ждут.
    expect(manual.sent).toHaveLength(1);

    const sent = manual.sent[0];
    if (sent === undefined) throw new Error('запрос не отправлен');

    // Ответ с чужим requestId игнорируется.
    manual.emit({
      type: 'result',
      requestId: sent.requestId + 100,
      rows: [],
      counters: counters(999),
    });

    expect(manual.sent).toHaveLength(1);

    manual.emit({
      type: 'result',
      requestId: sent.requestId,
      rows: [],
      counters: counters(1),
    });

    await expect(first).resolves.toEqual({ rows: [], counters: counters(1) });

    // После завершения активного запускается последний ожидающий.
    expect(manual.sent).toHaveLength(2);

    const last = manual.sent[1];
    if (last === undefined) throw new Error('последний запрос не отправлен');

    manual.emit({
      type: 'result',
      requestId: last.requestId,
      rows: [],
      counters: counters(3),
    });

    await expect(third).resolves.toEqual({ rows: [], counters: counters(3) });
  });
});

describe('производительность', () => {
  it('пересчёт 10 000 планет в основном потоке занимает меньше 200 мс', async () => {
    const records = Array.from({ length: 10_000 }, (_, index) => planet(index));
    const backend = createInlineBackend();

    await backend.init(records);

    const startedAt = performance.now();
    const result = await backend.compute(DEFAULT_SETTINGS, DEFAULT_FILTERS, DEFAULT_SORT_SPEC);
    const elapsed = performance.now() - startedAt;

    expect(result.counters.total).toBe(10_000);
    expect(result.rows).toHaveLength(50);
    expect(elapsed).toBeLessThan(200);
  });
});
