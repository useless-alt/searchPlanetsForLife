/**
 * Тесты REST-маршрутов (задача 11, п. 10.10, 10.1.4).
 *
 * Приложение собирается через `buildServer` с подменённым состоянием
 * конвейера; запросы идут через `app.inject()` без реального сокета.
 */

import { gunzipSync } from 'node:zlib';

import { describe, expect, it, vi } from 'vitest';

import type {
  BackupMeta,
  CatalogResponse,
  ErrorLogEntry,
  MergeStats,
  PlanetRecord,
  SourceId,
  SourceStatus,
  StatusResponse,
} from '@exo/shared';

import type { BackupReadResult, BackupStore, BackupWriteOptions } from './backup/store';
import { buildServer } from './index';
import type { CatalogAdapter } from './sources/adapter';
import { SourceFetchError } from './sources/errors';
import type { FetchLike as SourceFetchLike } from './sources/tap';
import type { ErrorLog } from './pipeline/errorLog';
import { createPipelineState } from './pipeline/state';
import type { PipelineState } from './pipeline/state';
import type { CatalogSourceId, GaiaFetcher, SimbadFetcher } from './pipeline/loadSource';

const NOW = '2026-11-14T12:00:00.000Z';
const BACKUP_AT = '2026-11-01T01:02:03.000Z';

const SOURCE_ORDER: SourceId[] = ['gaia', 'exomast', 'nasa', 'exoplanet_eu', 'simbad', 'exomercat'];

function statuses(state: SourceStatus['state'] = 'updated'): SourceStatus[] {
  return SOURCE_ORDER.map((source) => ({
    source,
    state: source === 'exomast' ? 'pending' : state,
    backupAt: null,
    message: null,
  }));
}

function statusResponse(overrides: Partial<StatusResponse> = {}): StatusResponse {
  return {
    phase: 'ready',
    refreshing: false,
    startedAt: NOW,
    finishedAt: NOW,
    sources: statuses(),
    hasSnapshot: true,
    ...overrides,
  };
}

function mergeStats(): MergeStats {
  return {
    recordsBySource: Object.fromEntries(SOURCE_ORDER.map((source) => [source, 0])) as Record<
      SourceId,
      number
    >,
    uniquePlanets: 1,
    mergedClusters: 0,
    rejectedUnions: 0,
    sameSourceDuplicates: 0,
    ruleCounts: { R1: 0, R2: 0, R3: 0, R4: 0 },
    vetoed: 0,
  };
}

function planet(id: string): PlanetRecord {
  return {
    id,
    name: id,
    aliases: [],
    hostname: 'Host',
    letter: null,
    hostAliases: [],
    sources: ['nasa'],
    warnings: [],
    params: {} as PlanetRecord['params'],
  };
}

function catalogResponse(planets: PlanetRecord[]): CatalogResponse {
  return {
    snapshot: {
      id: 'snapshot-etag-1',
      builtAt: NOW,
      planetCount: planets.length,
      schemaVersion: 1,
    },
    planets,
    sources: statuses(),
    stats: mergeStats(),
  };
}

/** Хранилище копий для маршрута Exo.MAST. */
interface RouteBackup extends BackupStore {
  writes: Array<{ source: SourceId; payload: unknown; options: BackupWriteOptions }>;
  payloads: Map<string, BackupReadResult>;
}

function createRouteBackup(): RouteBackup {
  const writes: RouteBackup['writes'] = [];
  const payloads = new Map<string, BackupReadResult>();
  return {
    writes,
    payloads,
    async write(source, payload, options, now = new Date()) {
      writes.push({ source, payload, options });
      const meta: BackupMeta = {
        source,
        endpoint: options.endpoint,
        fetched_at: now.toISOString(),
        record_count: options.recordCount,
        checksum: 'checksum',
        schema_version: 1,
      };
      payloads.set(options.key ?? source, { payload, meta, recoveredFrom: null });
      return meta;
    },
    async read(source, key) {
      return payloads.get(key ?? source) ?? null;
    },
    async listVersions() {
      return [];
    },
    async rollback() {
      throw new Error('rollback в тестах не используется');
    },
  };
}

function createEmptyErrorLog(): ErrorLog & { entries: ErrorLogEntry[] } {
  const entries: ErrorLogEntry[] = [];
  return {
    entries,
    async load() {},
    async append(entry) {
      entries.push(entry);
    },
    recent(limit = 200) {
      return entries.slice(-limit).reverse();
    },
  };
}

function createFakePipeline(overrides: Partial<PipelineState> = {}): PipelineState {
  const backup = createRouteBackup();
  const errorLog = createEmptyErrorLog();
  const base: PipelineState = {
    getStatus: () => statusResponse(),
    getCatalog: () => null,
    getSnapshot: () => null,
    getPlanet: () => null,
    startRefresh: () => false,
    waitForIdle: async () => undefined,
    updateSourceStatus: () => undefined,
    recordError: async () => undefined,
    getBackup: () => backup,
    getErrorLog: () => errorLog,
    getFetchImpl: () => undefined,
    getTimeoutMs: () => undefined,
  };
  return { ...base, ...overrides };
}

function createSourceRecord(source: SourceId, name: string) {
  const fetchedAt = NOW;
  return {
    source,
    fetchedAt,
    fromBackup: false,
    planetName: name,
    aliases: [],
    hostname: null,
    letter: null,
    hostAliases: [],
    ra: null,
    dec: null,
    params: {},
    extra: {},
  };
}

function makeAdapter(
  id: CatalogSourceId,
  rows: readonly Record<string, unknown>[],
  gate?: { wait: Promise<void>; started: () => void },
): CatalogAdapter {
  return {
    id,
    requiredFields: ['pl_name'],
    async fetchRaw() {
      gate?.started();
      if (gate) await gate.wait;
      return {
        rows: rows.map((row) => ({ ...row })),
        endpoint: `https://${id}.test`,
        query: 'SELECT *',
        warnings: [],
      };
    },
    normalize(rawRows, _ctx) {
      return {
        records: rawRows.map((row) => createSourceRecord(id as SourceId, String(row['pl_name']))),
        skippedRows: 0,
      };
    },
  };
}

function makeGaiaFetcher(): GaiaFetcher {
  return async () => ({ stars: [], unresolved: [] });
}

function makeSimbadFetcher(): SimbadFetcher {
  return async () => ({ stars: [], unresolved: [] });
}

/** Создаёт реальное состояние с блокирующимся адаптером NASA. */
function createBlockingPipeline() {
  const backup = createRouteBackup();
  const errorLog = createEmptyErrorLog();
  const rows = [{ pl_name: 'Blocked-1 b' }];

  let release: () => void = () => undefined;
  let markStarted: () => void = () => undefined;
  const wait = new Promise<void>((resolve) => {
    release = resolve;
  });
  const started = new Promise<void>((resolve) => {
    markStarted = resolve;
  });

  const state = createPipelineState({
    backup,
    errorLog,
    adapters: {
      nasa: makeAdapter('nasa', rows, { wait, started: markStarted }),
      exoplanet_eu: makeAdapter('exoplanet_eu', []),
      exomercat: makeAdapter('exomercat', []),
    },
    fetchGaia: makeGaiaFetcher(),
    fetchSimbad: makeSimbadFetcher(),
    now: () => new Date(NOW),
  });

  return { state, release, started };
}

describe('GET /api/status', () => {
  it('возвращает StatusResponse с шестью источниками', async () => {
    const app = buildServer({ pipeline: createFakePipeline() });
    const response = await app.inject({ method: 'GET', url: '/api/status' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      phase: 'ready',
      refreshing: false,
      hasSnapshot: true,
    });
    expect(response.json().sources).toHaveLength(6);

    await app.close();
  });
});

describe('GET /api/catalog', () => {
  it('нет снимка и phase = error → 503 no_data', async () => {
    const app = buildServer({
      pipeline: createFakePipeline({
        getStatus: () => statusResponse({ phase: 'error', hasSnapshot: false }),
      }),
    });

    const response = await app.inject({ method: 'GET', url: '/api/catalog' });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ error: 'no_data' });

    await app.close();
  });

  it('нет снимка и phase = loading → 503 loading', async () => {
    const app = buildServer({
      pipeline: createFakePipeline({
        getStatus: () => statusResponse({ phase: 'loading', hasSnapshot: false }),
      }),
    });

    const response = await app.inject({ method: 'GET', url: '/api/catalog' });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ error: 'loading' });

    await app.close();
  });

  it('возвращает ETag и 304 при совпадении If-None-Match', async () => {
    const catalog = catalogResponse([planet('kepler-1-b')]);
    const app = buildServer({
      pipeline: createFakePipeline({ getCatalog: () => catalog }),
    });

    const first = await app.inject({ method: 'GET', url: '/api/catalog' });
    expect(first.statusCode).toBe(200);
    expect(first.headers.etag).toBe(catalog.snapshot.id);

    const second = await app.inject({
      method: 'GET',
      url: '/api/catalog',
      headers: { 'if-none-match': catalog.snapshot.id },
    });
    expect(second.statusCode).toBe(304);
    expect(second.body).toBe('');

    await app.close();
  });

  it('сжимает ответ (gzip) через @fastify/compress', async () => {
    const planets = Array.from({ length: 200 }, (_, index) => planet(`kepler-${index + 1}-b`));
    const catalog = catalogResponse(planets);
    const app = buildServer({
      pipeline: createFakePipeline({ getCatalog: () => catalog }),
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/catalog',
      headers: { 'accept-encoding': 'gzip' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-encoding']).toBe('gzip');
    const body = JSON.parse(gunzipSync(response.rawPayload).toString('utf8')) as CatalogResponse;
    expect(body.planets).toHaveLength(200);

    await app.close();
  });
});

describe('POST /api/refresh', () => {
  it('два быстрых запроса: 202, затем 409', async () => {
    const { state, release, started } = createBlockingPipeline();
    const app = buildServer({ pipeline: state });

    const first = await app.inject({ method: 'POST', url: '/api/refresh' });
    expect(first.statusCode).toBe(202);
    expect(first.json()).toEqual({ started: true });

    await started;

    const second = await app.inject({ method: 'POST', url: '/api/refresh' });
    expect(second.statusCode).toBe(409);
    expect(second.json()).toEqual({ error: 'refresh_in_progress' });

    release();
    await state.waitForIdle();
    await app.close();
  });
});

describe('GET /api/errors', () => {
  it('отдаёт новые записи первыми и учитывает limit', async () => {
    const errorLog = createEmptyErrorLog();
    await errorLog.append({
      source: 'nasa',
      time: '2026-11-14T10:00:00.000Z',
      reason: 'timeout',
      backupUsed: null,
    });
    await errorLog.append({
      source: 'gaia',
      time: '2026-11-14T11:00:00.000Z',
      reason: 'http_5xx',
      backupUsed: 'latest.json',
    });

    const app = buildServer({
      pipeline: createFakePipeline({ getErrorLog: () => errorLog }),
    });

    const response = await app.inject({ method: 'GET', url: '/api/errors?limit=1' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([
      {
        source: 'gaia',
        time: '2026-11-14T11:00:00.000Z',
        reason: 'http_5xx',
        backupUsed: 'latest.json',
      },
    ]);

    await app.close();
  });
});

describe('GET /api/planets/:id/exomast', () => {
  it('нет планеты в снимке → 404 planet_not_found', async () => {
    const app = buildServer({ pipeline: createFakePipeline() });

    const response = await app.inject({
      method: 'GET',
      url: '/api/planets/unknown/exomast',
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: 'planet_not_found' });

    await app.close();
  });

  it('свежий ответ → 200, status = updated, статус источника обновляется', async () => {
    const target = planet('wasp-12-b');
    const backup = createRouteBackup();
    const updateSourceStatus = vi.fn();
    const fetchImpl: SourceFetchLike = async () => ({
      status: 200,
      text: async () =>
        JSON.stringify([
          {
            catalog_name: 'nexsci',
            distance: 10,
            distance_unit: 'pc',
          },
        ]),
    });

    const app = buildServer({
      pipeline: createFakePipeline({
        getPlanet: (id) => (id === target.id ? target : null),
        getBackup: () => backup,
        getFetchImpl: () => fetchImpl,
        updateSourceStatus,
      }),
    });

    const response = await app.inject({
      method: 'GET',
      url: `/api/planets/${target.id}/exomast`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: 'updated',
      props: {
        planetId: target.id,
        fromBackup: false,
      },
    });
    expect(updateSourceStatus).toHaveBeenCalledWith('exomast', {
      state: 'updated',
      backupAt: null,
      message: null,
    });

    await app.close();
  });

  it('сбой сети и есть копия → 200, status = backup, дата копии', async () => {
    const target = planet('wasp-12-c');
    const backup = createRouteBackup();
    backup.payloads.set(target.id, {
      payload: [{ catalog_name: 'nexsci', distance: 5, distance_unit: 'pc' }],
      meta: {
        source: 'exomast',
        endpoint: 'https://exo.mast.test',
        fetched_at: BACKUP_AT,
        record_count: 1,
        checksum: 'checksum',
        schema_version: 1,
      },
      recoveredFrom: null,
    });
    const updateSourceStatus = vi.fn();
    const fetchImpl: SourceFetchLike = async () => {
      throw new SourceFetchError('timeout', 'Exo.MAST не ответил');
    };

    const app = buildServer({
      pipeline: createFakePipeline({
        getPlanet: (id) => (id === target.id ? target : null),
        getBackup: () => backup,
        getFetchImpl: () => fetchImpl,
        updateSourceStatus,
      }),
    });

    const response = await app.inject({
      method: 'GET',
      url: `/api/planets/${target.id}/exomast`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: 'backup',
      props: {
        planetId: target.id,
        fromBackup: true,
        fetchedAt: BACKUP_AT,
      },
    });
    expect(updateSourceStatus).toHaveBeenCalledWith('exomast', {
      state: 'backup',
      backupAt: BACKUP_AT,
      message: null,
    });

    await app.close();
  });

  it('сбой сети и нет копии → 502 exomast_unavailable с причиной', async () => {
    const target = planet('wasp-12-d');
    const backup = createRouteBackup();
    const updateSourceStatus = vi.fn();
    const recordError = vi.fn(async () => undefined);
    const fetchImpl: SourceFetchLike = async () => {
      throw new SourceFetchError('http_5xx', 'Exo.MAST: HTTP 503');
    };

    const app = buildServer({
      pipeline: createFakePipeline({
        getPlanet: (id) => (id === target.id ? target : null),
        getBackup: () => backup,
        getFetchImpl: () => fetchImpl,
        updateSourceStatus,
        recordError,
      }),
    });

    const response = await app.inject({
      method: 'GET',
      url: `/api/planets/${target.id}/exomast`,
    });

    expect(response.statusCode).toBe(502);
    expect(response.json()).toEqual({
      error: 'exomast_unavailable',
      reason: 'http_5xx',
    });
    expect(updateSourceStatus).toHaveBeenCalledWith(
      'exomast',
      expect.objectContaining({ state: 'error_no_backup', backupAt: null }),
    );
    expect(recordError).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'exomast',
        reason: 'http_5xx',
        backupUsed: null,
      }),
    );

    await app.close();
  });
});
