/**
 * Тесты адаптера Exo.MAST (задача 9).
 *
 * Сети в тестах нет: все запросы выполняет мок `fetchImpl`.
 * Фикстура `fixtures/exomast-wasp-12b.json` — реальный ответ Exo.MAST,
 * снят вручную 14.11.2026 (единственный сетевой вызов вне тестов).
 */

import { describe, expect, it } from 'vitest';

import { MJUP_IN_MEARTH, RJUP_IN_REARTH, type BackupMeta, type SourceId } from '@exo/shared';

import type { BackupStore, BackupWriteOptions } from '../backup/store';

import {
  EXOMAST_BASE_URL,
  EXOMAST_SOURCE,
  extractExoMastParams,
  fetchExoMastProps,
  isAbortError,
  selectExoMastCatalog,
} from './exomast';

import type { FetchLike, TapResponse } from './tap';

import fixture from './fixtures/exomast-wasp-12b.json';

const FIXTURE = fixture as unknown as Array<Record<string, unknown>>;

/** Словарь каталога `nexsci` из фикстуры. */
const NEXSCI = FIXTURE.find((dict) => dict['catalog_name'] === 'nexsci') as Record<string, unknown>;

/** Словарь каталога `exoplanets.org` из фикстуры. */
const EXOPLANETS_ORG = FIXTURE.find((dict) => dict['catalog_name'] === 'exoplanets.org') as Record<
  string,
  unknown
>;

/**
 * Мок REST-запросов Exo.MAST: переадресация по адресу.
 */
function createRestFetch(handler: (url: string) => { status: number; body: string }): {
  fetchImpl: FetchLike;
  urls: string[];
} {
  const urls: string[] = [];
  const fetchImpl: FetchLike = async (url) => {
    urls.push(url);
    const result = handler(url);
    const response: TapResponse = {
      status: result.status,
      headers: null,
      text: async () => result.body,
    };
    return response;
  };
  return { fetchImpl, urls };
}

/** Описание записи в фальшивом хранилище резервных копий. */
interface FakeBackup {
  /** Хранилище для адаптера. */
  backup: BackupStore;
  /** Что записывали. */
  writes: Array<{ source: SourceId; payload: unknown; opts: BackupWriteOptions }>;
  /** Что читали. */
  reads: Array<{ source: SourceId; key?: string }>;
}

/**
 * Фальшивое хранилище резервных копий.
 *
 * @param payload - содержимое копии; `null` — копии нет.
 */
function createFakeBackup(payload: unknown | null): FakeBackup {
  const writes: FakeBackup['writes'] = [];
  const reads: FakeBackup['reads'] = [];

  const meta: BackupMeta = {
    source: EXOMAST_SOURCE,
    endpoint: `${EXOMAST_BASE_URL}exoplanets/WASP-12%20b/properties/`,
    fetched_at: '2026-11-13T09:00:00.000Z',
    record_count: 1,
    checksum: 'test-checksum',
    schema_version: 1,
  };

  const backup: BackupStore = {
    async write(source, written, opts) {
      writes.push({ source, payload: written, opts });
      return meta;
    },
    async read(source, key) {
      reads.push({ source, key });
      if (payload === null) return null;
      return { payload, meta, recoveredFrom: null };
    },
    async listVersions() {
      return [];
    },
    async rollback() {
      throw new Error('Мок: откат не используется');
    },
  };

  return { backup, writes, reads };
}

describe('Exo.MAST: выбор каталога', () => {
  it('из двух каталогов выбирается nexsci независимо от порядка', async () => {
    const { fetchImpl } = createRestFetch(() => ({
      status: 200,
      body: JSON.stringify([EXOPLANETS_ORG, NEXSCI]),
    }));

    const props = await fetchExoMastProps('wasp-12-b', 'WASP-12 b', { fetchImpl });

    expect(props.catalog).toBe('nexsci');
    expect(props.raw['canonical_name']).toBe('WASP-12 b');
    expect(props.fromBackup).toBe(false);
    expect(props.planetId).toBe('wasp-12-b');
  });

  it('порядок элементов ответа не влияет на выбор', () => {
    const selected = selectExoMastCatalog([EXOPLANETS_ORG, NEXSCI]);
    const reversed = selectExoMastCatalog([NEXSCI, EXOPLANETS_ORG]);

    expect(selected?.['catalog_name']).toBe('nexsci');
    expect(reversed?.['catalog_name']).toBe('nexsci');
  });

  it('если подходящего каталога нет — берётся первый элемент', () => {
    const other = { catalog_name: 'toi', Teff: 6154 };
    const selected = selectExoMastCatalog([other, { catalog_name: 'TESS-DV' }]);

    expect(selected?.['catalog_name']).toBe('toi');
  });
});

describe('Exo.MAST: каноническое имя', () => {
  it('ответ 404 приводит к запросу identifiers и повтору с canonicalName', async () => {
    const { fetchImpl, urls } = createRestFetch((url) => {
      if (url.includes('/identifiers/')) {
        return { status: 200, body: JSON.stringify({ canonicalName: 'WASP-12 b' }) };
      }
      if (url.includes('wasp-12b')) {
        return { status: 404, body: '' };
      }
      return { status: 200, body: JSON.stringify([NEXSCI]) };
    });

    const props = await fetchExoMastProps('wasp-12-b', 'wasp-12b', { fetchImpl });

    expect(urls).toHaveLength(3);
    expect(urls[0]).toContain('wasp-12b');
    expect(urls[1]).toContain('identifiers/?name=wasp-12b');
    expect(urls[2]).toContain('WASP-12%20b');
    expect(props.catalog).toBe('nexsci');
  });

  it('пустой ответ тоже приводит к запросу identifiers', async () => {
    const { fetchImpl, urls } = createRestFetch((url) => {
      if (url.includes('/identifiers/')) {
        return { status: 200, body: JSON.stringify({ canonicalName: 'WASP-12 b' }) };
      }
      if (url.includes('unknown-planet')) {
        return { status: 200, body: '[]' };
      }
      return { status: 200, body: JSON.stringify([NEXSCI]) };
    });

    const props = await fetchExoMastProps('unknown-planet', 'unknown-planet', { fetchImpl });

    expect(urls).toHaveLength(3);
    expect(urls[1]).toContain('identifiers/?name=unknown-planet');
    expect(urls[2]).toContain('WASP-12%20b');
    expect(props.catalog).toBe('nexsci');
  });
});

describe('Exo.MAST: ленивый кэш', () => {
  it('два параллельных вызова одной планеты делают один HTTP-запрос', async () => {
    const { fetchImpl, urls } = createRestFetch(() => ({
      status: 200,
      body: JSON.stringify([NEXSCI]),
    }));

    const [first, second] = await Promise.all([
      fetchExoMastProps('wasp-12-b-double', 'WASP-12 b', { fetchImpl }),
      fetchExoMastProps('wasp-12-b-double', 'WASP-12 b', { fetchImpl }),
    ]);

    expect(urls).toHaveLength(1);
    expect(first.raw).toEqual(second.raw);
  });

  it('после успеха пишется резервная копия по ключу планеты', async () => {
    const { fetchImpl } = createRestFetch(() => ({
      status: 200,
      body: JSON.stringify([NEXSCI]),
    }));
    const { backup, writes } = createFakeBackup(null);

    await fetchExoMastProps('wasp-12-b', 'WASP-12 b', { fetchImpl, backup });

    expect(writes).toHaveLength(1);
    expect(writes[0]?.source).toBe(EXOMAST_SOURCE);
    expect(writes[0]?.opts.key).toBe('wasp-12-b');
    expect(writes[0]?.opts.recordCount).toBe(1);
    expect(writes[0]?.opts.endpoint).toContain('/properties/');
  });

  it('сетевая ошибка с копией в кэше даёт fromBackup = true', async () => {
    const { fetchImpl } = createRestFetch(() => {
      throw new Error('Сеть недоступна');
    });
    const { backup, reads } = createFakeBackup([NEXSCI]);

    const props = await fetchExoMastProps('wasp-12-b', 'WASP-12 b', { fetchImpl, backup });

    expect(reads).toHaveLength(1);
    expect(reads[0]?.key).toBe('wasp-12-b');
    expect(props.fromBackup).toBe(true);
    expect(props.catalog).toBe('nexsci');
    expect(props.fetchedAt).toBe('2026-11-13T09:00:00.000Z');
  });

  it('сетевая ошибка без копии даёт ошибку наружу', async () => {
    const { fetchImpl } = createRestFetch(() => {
      throw new Error('Сеть недоступна');
    });
    const { backup } = createFakeBackup(null);

    const error = await fetchExoMastProps('wasp-12-b', 'WASP-12 b', {
      fetchImpl,
      backup,
    }).catch((reason: unknown) => reason);

    expect((error as { reason?: string }).reason).toBe('dns_error');
  });
});

describe('Exo.MAST: отмена запроса', () => {
  it('AbortSignal отменяет запрос: это не сбой источника и резервы нет', async () => {
    const controller = new AbortController();
    const fetchImpl: FetchLike = async (_url, init) =>
      new Promise<TapResponse>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          const error = new Error('Операция прервана');
          error.name = 'AbortError';
          reject(error);
        });
      });
    const { backup, reads } = createFakeBackup([NEXSCI]);

    const promise = fetchExoMastProps('wasp-12-b-abort', 'WASP-12 b', {
      fetchImpl,
      backup,
      signal: controller.signal,
    });
    controller.abort();

    const error = await promise.catch((reason: unknown) => reason);

    expect(isAbortError(error)).toBe(true);
    expect((error as { name?: string }).name).toBe('AbortError');
    // Отмена не пишется в журнал ошибок и не читает резерв.
    expect(reads).toHaveLength(0);
  });

  it('уже отменённый сигнал отменяет запрос до обращения к сети', async () => {
    const controller = new AbortController();
    controller.abort();
    let called = false;
    const fetchImpl: FetchLike = async () => {
      called = true;
      return { status: 200, headers: null, text: async () => '[]' };
    };

    const error = await fetchExoMastProps('wasp-12-b-aborted', 'WASP-12 b', {
      fetchImpl,
      signal: controller.signal,
    }).catch((reason: unknown) => reason);

    expect(called).toBe(false);
    expect(isAbortError(error)).toBe(true);
  });
});

describe('Exo.MAST: извлечение параметров', () => {
  it('значения приводятся к единицам проекта по таблице EXOMAST_FIELD_MAP', () => {
    const extracted = extractExoMastParams(NEXSCI);

    expect(extracted.st_teff).toBeCloseTo(6265, 6);
    expect(extracted.st_rad).toBeCloseTo(1.69, 6);
    expect(extracted.st_mass).toBeCloseTo(1.325, 6);
    expect(extracted.sy_dist).toBeCloseTo(427.246, 6);
    expect(extracted.pl_rade).toBeCloseTo(1.965 * RJUP_IN_REARTH, 6);
    expect(extracted.pl_bmasse).toBeCloseTo(1.47 * MJUP_IN_MEARTH, 6);
    expect(extracted.pl_eqt).toBeCloseTo(2567.38, 6);
    expect(extracted.pl_orbper).toBeCloseTo(1.091418901, 9);
    expect(extracted.pl_orbsmax).toBeCloseTo(0.0234, 9);
    expect(extracted.pl_orbeccen).toBeCloseTo(0.0447, 9);
  });

  it('значение с неверной единицей не извлекается', () => {
    const wrong = { ...NEXSCI, distance_unit: 'AU' };
    const extracted = extractExoMastParams(wrong);

    expect(extracted.sy_dist).toBeUndefined();
    expect(extracted.st_teff).toBeCloseTo(6265, 6);
  });

  it('значение без поля единицы не извлекается', () => {
    const { Rs_unit, ...withoutUnit } = NEXSCI;
    const extracted = extractExoMastParams(withoutUnit);

    expect(Rs_unit).toBe('R_sun');
    expect(extracted.st_rad).toBeUndefined();
  });

  it('каталог exoplanets.org без расстояния не даёт sy_dist', () => {
    const extracted = extractExoMastParams(EXOPLANETS_ORG);

    expect(extracted.sy_dist).toBeUndefined();
    expect(extracted.st_teff).toBeCloseTo(6300, 6);
  });
});
