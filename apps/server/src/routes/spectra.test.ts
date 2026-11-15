/**
 * Тесты маршрута спектров и загрузчика файла (задача 28).
 *
 * Сети нет: `fetchImpl` полностью подменён, приложение собирается через
 * `buildServer` с подставленным состоянием конвейера.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import type { ExoMastProps, PlanetRecord } from '@exo/shared';

import type { BackupReadResult, BackupStore, BackupWriteOptions } from '../backup/store';
import { buildServer } from '../index';
import type { PipelineState } from '../pipeline/state';
import { EXOMAST_SOURCE } from '../sources/exomast';
import {
  fetchSpectrumMeta,
  SpectrumMetaCache,
  SPECTRUM_CACHE_LIMIT,
  SPECTRUM_MAX_BYTES,
  spectrumMetaCache,
} from '../sources/exomastSpectra';
import type { FetchLike, TapResponse } from '../sources/tap';

const PLANET: PlanetRecord = {
  id: 'wasp-12-b',
  name: 'WASP-12 b',
  aliases: [],
  hostname: 'WASP-12',
  letter: 'b',
  hostAliases: [],
  sources: ['nasa'],
  warnings: [],
  params: {} as PlanetRecord['params'],
};

const PROPS: ExoMastProps = {
  planetId: PLANET.id,
  fetchedAt: '2026-11-15T10:00:00.000Z',
  fromBackup: false,
  catalog: 'nexsci',
  raw: {},
  extracted: {},
  canonicalName: 'WASP-12 b',
  atmosphere: { molecules: [], keys: [] },
  spectraFiles: ['WASP-12b_transmission_Kreidberg2015.txt'],
};

/** Ответ `fetch` с текстом. */
function response(status: number, body: string, contentLength?: number): TapResponse {
  return {
    status,
    headers: {
      get: (name: string) =>
        name.toLowerCase() === 'content-length' && contentLength !== undefined
          ? String(contentLength)
          : null,
    },
    text: async () => body,
  };
}

/** Хранилище копий с одной записью. */
function createBackup(payload: unknown | null): BackupStore {
  return {
    async write(_source, _payload, _options: BackupWriteOptions) {
      throw new Error('Маршрут спектра копии не пишет');
    },
    async read(source, key): Promise<BackupReadResult | null> {
      if (payload === null || source !== EXOMAST_SOURCE || key !== PLANET.id) return null;

      return {
        payload,
        meta: {
          source: EXOMAST_SOURCE,
          endpoint: 'https://exo.mast.stsci.edu/',
          fetched_at: '2026-11-15T09:00:00.000Z',
          record_count: 1,
          checksum: 'x',
          schema_version: 1,
        },
        recoveredFrom: null,
      };
    },
    async listVersions() {
      return [];
    },
    async rollback() {
      throw new Error('не используется');
    },
  };
}

/** Минимальное состояние конвейера для маршрутов. */
function createState(
  props: ExoMastProps | null,
  fetchImpl: FetchLike,
  backup: BackupStore = createBackup(null),
): PipelineState {
  return {
    getPlanet: (id: string) => (id === PLANET.id ? PLANET : null),
    getExoMastProps: (id: string) => (props !== null && id === PLANET.id ? props : null),
    setExoMastProps: () => undefined,
    getBackup: () => backup,
    getFetchImpl: () => fetchImpl,
    getTimeoutMs: () => 1000,
  } as unknown as PipelineState;
}

/** Собирает приложение с подменённым состоянием. */
function createApp(props: ExoMastProps | null, fetchImpl: FetchLike, backup?: BackupStore) {
  return buildServer({
    pipeline: createState(props, fetchImpl, backup),
    webRoot: null,
  });
}

describe('GET /api/planets/:id/exomast/spectra', () => {
  beforeEach(() => {
    spectrumMetaCache.clear();
  });

  it('планета не найдена — 404 planet_not_found', async () => {
    const app = createApp(PROPS, async () => response(200, 'x'));

    const result = await app.inject({ url: '/api/planets/nope/exomast/spectra?file=a.txt' });

    expect(result.statusCode).toBe(404);
    expect(result.json()).toEqual({ error: 'planet_not_found' });
    await app.close();
  });

  it('имя вне списка — 404 spectrum_not_listed, сеть не вызывается', async () => {
    let called = false;
    const app = createApp(PROPS, async () => {
      called = true;
      return response(200, 'x');
    });

    const result = await app.inject({
      url: `/api/planets/${PLANET.id}/exomast/spectra?file=secret.txt`,
    });

    expect(result.statusCode).toBe(404);
    expect(result.json()).toEqual({ error: 'spectrum_not_listed' });
    expect(called).toBe(false);
    await app.close();
  });

  it('список не получен (null) — имя отклоняется', async () => {
    const app = createApp({ ...PROPS, spectraFiles: null }, async () => response(200, 'x'));

    const result = await app.inject({
      url: `/api/planets/${PLANET.id}/exomast/spectra?file=${PROPS.spectraFiles?.[0] ?? ''}`,
    });

    expect(result.statusCode).toBe(404);
    expect(result.json()).toEqual({ error: 'spectrum_not_listed' });
    await app.close();
  });

  it('имя из списка возвращает сведения о спектре', async () => {
    const body = '# заголовок\n0.5 1\n0.7 2\n';
    const app = createApp(PROPS, async () => response(200, body));

    const result = await app.inject({
      url: `/api/planets/${PLANET.id}/exomast/spectra?file=WASP-12b_transmission_Kreidberg2015.txt`,
    });

    expect(result.statusCode).toBe(200);
    const json = result.json() as { meta: { dataLines: number; kind: string } };
    expect(json.meta.dataLines).toBe(2);
    expect(json.meta.kind).toBe('transmission');
    await app.close();
  });

  it('список берётся из резервной копии, если в памяти его нет', async () => {
    const backup = createBackup({
      properties: [{}],
      canonicalName: 'WASP-12 b',
      spectraFiles: ['a.txt'],
    });
    const app = createApp(null, async () => response(200, '1 2\n'), backup);

    const result = await app.inject({
      url: `/api/planets/${PLANET.id}/exomast/spectra?file=a.txt`,
    });

    expect(result.statusCode).toBe(200);
    await app.close();
  });

  it('ошибка загрузки — 502 с причиной', async () => {
    const app = createApp(PROPS, async () => {
      throw new Error('Сеть недоступна');
    });

    const result = await app.inject({
      url: `/api/planets/${PLANET.id}/exomast/spectra?file=${PROPS.spectraFiles?.[0] ?? ''}`,
    });

    expect(result.statusCode).toBe(502);
    expect(result.json()).toMatchObject({ error: 'spectrum_unavailable', reason: 'dns_error' });
    await app.close();
  });
});

describe('fetchSpectrumMeta', () => {
  it('повторяет запрос без завершающей / после 404', async () => {
    spectrumMetaCache.clear();
    const urls: string[] = [];
    const fetchImpl: FetchLike = async (url) => {
      urls.push(url);
      return url.endsWith('/') ? response(404, '') : response(200, '0.5 1\n');
    };

    const meta = await fetchSpectrumMeta('p-retry', 'WASP-12 b', 'a.txt', { fetchImpl });

    expect(urls).toHaveLength(2);
    expect(urls[0]?.endsWith('/')).toBe(true);
    expect(urls[1]?.endsWith('/')).toBe(false);
    expect(meta.dataLines).toBe(1);
  });

  it('превышение 2 МБ по Content-Length прерывает загрузку', async () => {
    spectrumMetaCache.clear();
    let read = false;
    const fetchImpl: FetchLike = async () =>
      ({
        status: 200,
        headers: { get: () => String(SPECTRUM_MAX_BYTES + 1) },
        text: async () => {
          read = true;
          return 'x';
        },
      }) as TapResponse;

    const error = await fetchSpectrumMeta('p-big', 'WASP-12 b', 'big.txt', { fetchImpl }).catch(
      (reason: unknown) => reason,
    );

    expect(read).toBe(false);
    expect((error as { reason?: string }).reason).toBe('http_4xx');
  });

  it('превышение 2 МБ по принятым байтам тоже отклоняется', async () => {
    spectrumMetaCache.clear();
    const body = 'x'.repeat(SPECTRUM_MAX_BYTES + 10);
    const fetchImpl: FetchLike = async () => response(200, body);

    const error = await fetchSpectrumMeta('p-big-2', 'WASP-12 b', 'big.dat', { fetchImpl }).catch(
      (reason: unknown) => reason,
    );

    expect((error as { reason?: string }).reason).toBe('http_4xx');
  });

  it('бинарный файл — invalid_json', async () => {
    spectrumMetaCache.clear();
    const fetchImpl: FetchLike = async () => response(200, 'a\u0000b');

    const error = await fetchSpectrumMeta('p-bin', 'WASP-12 b', 'a.txt', { fetchImpl }).catch(
      (reason: unknown) => reason,
    );

    expect((error as { reason?: string }).reason).toBe('invalid_json');
  });
});

describe('SpectrumMetaCache', () => {
  it('не превышает 100 записей и вытесняет давно неиспользуемые', () => {
    const cache = new SpectrumMetaCache();

    for (let index = 0; index < SPECTRUM_CACHE_LIMIT + 5; index += 1) {
      cache.set('p', `f${String(index)}.txt`, { file: 'f', kind: 'other' } as never, index);
    }

    expect(cache.size).toBe(SPECTRUM_CACHE_LIMIT);
    expect(cache.get('p', 'f0.txt', 1000)).toBeNull();
    expect(cache.get('p', `f${String(SPECTRUM_CACHE_LIMIT + 4)}.txt`, 1000)).not.toBeNull();
  });

  it('обращение обновляет время использования', () => {
    const cache = new SpectrumMetaCache();
    const meta = { file: 'a.txt', kind: 'other' } as never;

    cache.set('p', 'a.txt', meta, 0);
    cache.get('p', 'a.txt', 1000);

    for (let index = 1; index < SPECTRUM_CACHE_LIMIT; index += 1) {
      cache.set('p', `x${String(index)}.txt`, meta, index);
    }

    // a.txt трогали позже остальных старых записей — он остаётся.
    expect(cache.size).toBe(SPECTRUM_CACHE_LIMIT);
    expect(cache.get('p', 'a.txt', 2000)).not.toBeNull();
  });
});
