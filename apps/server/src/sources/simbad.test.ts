/**
 * Тесты адаптера SIMBAD (задача 9).
 *
 * Сети в тестах нет: все запросы выполняет мок `fetchImpl`,
 * интервал между запросами проверяется на фиктивных часах.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { clearColumnSchemaCache } from './columnResolver';

import {
  DEFAULT_SIMBAD_MIN_INTERVAL_MS,
  SIMBAD_ALIAS_BATCH_SIZE,
  SIMBAD_BASIC_CANDIDATES,
  SIMBAD_ENDPOINT,
  SIMBAD_IDENT_CANDIDATES,
  SIMBAD_MAX_BATCH_SIZE,
  buildSimbadAliasQuery,
  buildSimbadQuery,
  escapeSimbadLiteral,
  fetchSimbadStars,
  getSimbadMinIntervalMs,
  resetSimbadThrottle,
  resolveSimbadSchema,
  simbadNameVariants,
} from './simbad';

import type { FetchLike, TapResponse } from './tap';

import { schemaResponse } from './fixtures/helpers';

const FETCHED_AT = '2026-11-14T10:00:00.000Z';

/** Строка ответа SIMBAD для WASP-12 (реальный ответ, снят 14.11.2026). */
const WASP12_ROW = {
  query_id: 'WASP-12',
  oid: 4700112,
  main_id: 'WASP-12',
  ra: 97.63665253848,
  dec: 29.67229541735001,
  plx_value: 2.4213,
  sp_type: 'G0V',
};

/** Ответ `TAP_SCHEMA.columns` для таблиц `ident` и `basic`. */
const SIMBAD_SCHEMA = schemaResponse(
  [
    ...Object.values(SIMBAD_IDENT_CANDIDATES).flat(),
    ...Object.values(SIMBAD_BASIC_CANDIDATES).flat(),
  ].map((name) => ({ name, unit: null })),
);

/**
 * Фиктивные часы: время двигается только во время ожидания.
 */
class FakeClock {
  /** Текущее время [мс]. */
  time = 1_000;

  /** Функция текущего времени. */
  now = (): number => this.time;

  /** Ожидание: время сдвигается на указанное число миллисекунд. */
  sleep = async (ms: number): Promise<void> => {
    this.time += ms;
  };
}

/**
 * Мок ответов SIMBAD с записью моментов запросов и их текста.
 *
 * Запросы схемы (`TAP_SCHEMA.columns`) получают общий ответ и не тратят
 * ответы из очереди данных.
 */
function createRecordingFetch(
  responses: ReadonlyArray<Record<string, unknown>[]>,
  clock: FakeClock,
): { fetchImpl: FetchLike; times: number[]; queries: string[]; urls: string[] } {
  const times: number[] = [];
  const queries: string[] = [];
  const urls: string[] = [];
  let index = 0;

  const fetchImpl: FetchLike = async (url, init) => {
    times.push(clock.now());
    urls.push(url);
    const query = new URLSearchParams(init?.body ?? '').get('QUERY') ?? '';
    queries.push(query);

    const isSchema = query.includes('TAP_SCHEMA.columns');
    const body = isSchema
      ? (SIMBAD_SCHEMA.body ?? '')
      : JSON.stringify(responses[Math.min(index, responses.length - 1)] ?? []);
    if (!isSchema) index += 1;

    const response: TapResponse = {
      status: 200,
      headers: null,
      text: async () => body,
    };
    return response;
  };

  return { fetchImpl, times, queries, urls };
}

/**
 * Оставляет только запросы данных (без запросов схемы).
 */
function dataQueries(queries: readonly string[]): string[] {
  return queries.filter((query) => !query.includes('TAP_SCHEMA.columns'));
}

describe('SIMBAD: запрос', () => {
  beforeEach(() => {
    clearColumnSchemaCache();
    resetSimbadThrottle();
  });

  it('апостроф в имени экранируется удвоением', () => {
    expect(escapeSimbadLiteral("O'Brien")).toBe("O''Brien");
    expect(buildSimbadQuery(["O'Brien"])).toContain("'O''Brien'");
  });

  it('в списке IN есть оба варианта имени', async () => {
    const clock = new FakeClock();
    const { fetchImpl, times, queries, urls } = createRecordingFetch([[]], clock);

    await fetchSimbadStars(['WASP-12'], {
      fetchImpl,
      fetchAliases: false,
      minIntervalMs: 0,
      now: clock.now,
      sleep: clock.sleep,
    });

    const data = dataQueries(queries);
    expect(data).toHaveLength(1);
    expect(times).toHaveLength(3); // две сверки схемы + запрос данных
    expect(urls.every((url) => url === SIMBAD_ENDPOINT)).toBe(true);
    expect(data[0]).toContain("'WASP-12'");
    expect(data[0]).toContain("'* WASP-12'");
  });

  it('запрос использует ident JOIN basic и нужные колонки', () => {
    const query = buildSimbadQuery(simbadNameVariants('WASP-12'));

    expect(query).toContain('FROM ident AS i JOIN basic AS b ON b.oid = i.oidref');
    expect(query).toContain('i.id AS query_id');
    expect(query).toContain('b.main_id');
    expect(query).toContain('b.plx_value');
    expect(query).toContain('b.sp_type');
  });

  it('запрос альтернативных идентификаторов идёт по oid', () => {
    const query = buildSimbadAliasQuery(['4700112']);

    expect(query).toBe("SELECT oidref, id FROM ident WHERE oidref IN ('4700112')");
    expect(SIMBAD_MAX_BATCH_SIZE).toBe(200);
    expect(SIMBAD_ALIAS_BATCH_SIZE).toBe(100);
  });

  it('интервал между запросами не меньше заданного', async () => {
    const clock = new FakeClock();
    const { fetchImpl, times } = createRecordingFetch([[WASP12_ROW], []], clock);

    await fetchSimbadStars(['WASP-12'], {
      fetchImpl,
      minIntervalMs: 250,
      now: clock.now,
      sleep: clock.sleep,
    });

    expect(times.length).toBeGreaterThanOrEqual(2);
    for (let index = 1; index < times.length; index += 1) {
      expect((times[index] as number) - (times[index - 1] as number)).toBeGreaterThanOrEqual(250);
    }
  });

  it('интервал по умолчанию — 250 мс, значение читается из окружения', () => {
    expect(DEFAULT_SIMBAD_MIN_INTERVAL_MS).toBe(250);
    expect(getSimbadMinIntervalMs({})).toBe(250);
    expect(getSimbadMinIntervalMs({ SIMBAD_MIN_INTERVAL_MS: '1000' })).toBe(1000);
    expect(getSimbadMinIntervalMs({ SIMBAD_MIN_INTERVAL_MS: 'мусор' })).toBe(250);
  });

  it('сверка схемы даёт колонки запроса', async () => {
    const clock = new FakeClock();
    const { fetchImpl } = createRecordingFetch([[]], clock);

    const schema = await resolveSimbadSchema({ fetchImpl });

    expect(schema.idColumn).toBe('id');
    expect(schema.oidrefColumn).toBe('oidref');
    expect(schema.basicColumns).toEqual(['oid', 'main_id', 'ra', 'dec', 'plx_value', 'sp_type']);
  });
});

describe('SIMBAD: нормализация', () => {
  beforeEach(() => {
    clearColumnSchemaCache();
    resetSimbadThrottle();
  });

  it('данные звезды приводятся к записи источника', async () => {
    const clock = new FakeClock();
    const { fetchImpl } = createRecordingFetch([[WASP12_ROW], []], clock);

    const result = await fetchSimbadStars(['WASP-12'], {
      fetchImpl,
      fetchedAt: FETCHED_AT,
      minIntervalMs: 0,
      now: clock.now,
      sleep: clock.sleep,
    });

    const star = result.stars[0];
    expect(star?.source).toBe('simbad');
    expect(star?.fetchedAt).toBe(FETCHED_AT);
    expect(star?.key.hostQuery).toBe('WASP-12');
    expect(star?.mainId).toBe('WASP-12');
    expect(star?.ra).toBeCloseTo(97.63665253848, 8);
    expect(star?.dec).toBeCloseTo(29.67229541735001, 8);
    expect(star?.extra.spType).toBe('G0V');
    expect(star?.params.sy_dist).toBeCloseTo(1000 / 2.4213, 6);
  });

  it('альтернативные идентификаторы собираются по oid', async () => {
    const clock = new FakeClock();
    const { fetchImpl } = createRecordingFetch(
      [
        [WASP12_ROW],
        [
          { oidref: '4700112', id: 'WASP-12' },
          { oidref: '4700112', id: 'Gaia DR3 3435282862461427072' },
        ],
      ],
      clock,
    );

    const result = await fetchSimbadStars(['WASP-12'], {
      fetchImpl,
      minIntervalMs: 0,
      now: clock.now,
      sleep: clock.sleep,
    });

    expect(result.stars[0]?.aliases).toEqual(['WASP-12', 'Gaia DR3 3435282862461427072']);
  });

  it('без запроса альтернативных идентификаторов aliases пуст', async () => {
    const clock = new FakeClock();
    const { fetchImpl, queries } = createRecordingFetch([[WASP12_ROW]], clock);

    const result = await fetchSimbadStars(['WASP-12'], {
      fetchImpl,
      fetchAliases: false,
      minIntervalMs: 0,
      now: clock.now,
      sleep: clock.sleep,
    });

    expect(dataQueries(queries)).toHaveLength(1);
    expect(result.stars[0]?.aliases).toEqual([]);
  });

  it('нерешённые имена попадают в unresolved и ошибкой не считаются', async () => {
    const clock = new FakeClock();
    const { fetchImpl } = createRecordingFetch([[WASP12_ROW]], clock);

    const result = await fetchSimbadStars(['WASP-12', 'Нет такой звезды'], {
      fetchImpl,
      fetchAliases: false,
      minIntervalMs: 0,
      now: clock.now,
      sleep: clock.sleep,
    });

    expect(result.stars).toHaveLength(1);
    expect(result.unresolved).toEqual(['Нет такой звезды']);
  });

  it('параллакс ≤ 0 не даёт расстояние', async () => {
    const clock = new FakeClock();
    const { fetchImpl } = createRecordingFetch([[{ ...WASP12_ROW, plx_value: -1.2 }]], clock);

    const result = await fetchSimbadStars(['WASP-12'], {
      fetchImpl,
      fetchAliases: false,
      minIntervalMs: 0,
      now: clock.now,
      sleep: clock.sleep,
    });

    expect(result.stars[0]?.params.sy_dist).toBeUndefined();
  });
});
