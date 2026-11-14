/**
 * Тесты конвейера загрузки (задача 11, п. 10.1, 10.10).
 *
 * Адаптеры, звёздные загрузчики и хранилище копий подменяются:
 * сетевые запросы в тестах не участвуют. Файловая система используется
 * только для проверки журнала ошибок (U31).
 */

import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { BackupMeta, ErrorLogEntry, SourceId, SourceRecord, StarRecord } from '@exo/shared';

import type { BackupReadResult, BackupStore, BackupWriteOptions } from './backup/store';
import { createInitialStatuses, runStages } from './pipeline/stages';
import { createPipelineState, type PipelineState } from './pipeline/state';
import { createErrorLog, type ErrorLog } from './pipeline/errorLog';
import type { CatalogAdapter } from './sources/adapter';
import { SourceFetchError } from './sources/errors';
import type { CatalogSourceId, GaiaFetcher, SimbadFetcher } from './pipeline/loadSource';

const NOW = '2026-11-14T12:00:00.000Z';
const BACKUP_AT = '2026-11-02T03:04:05.000Z';

const DEFAULT_NASA_ROWS = [
  { pl_name: 'Kepler-1 b', hostname: 'Kepler-1', gaia: '1234567890123456789' },
];
const DEFAULT_EU_ROWS = [{ pl_name: 'Kepler-2 b', hostname: 'Kepler-2' }];
const DEFAULT_EXOMERCAT_ROWS = [{ pl_name: 'Kepler-3 b', hostname: 'Kepler-3' }];

/** Поддельное хранилище копий в памяти. */
interface FakeBackup extends BackupStore {
  writes: Array<{ source: SourceId; payload: unknown; options: BackupWriteOptions }>;
  stored: Map<string, BackupReadResult>;
  put(
    source: SourceId,
    payload: unknown,
    fetchedAt?: string,
    recoveredFrom?: string | null,
    key?: string,
  ): void;
}

function createFakeBackup(): FakeBackup {
  const writes: FakeBackup['writes'] = [];
  const stored = new Map<string, BackupReadResult>();

  const scope = (source: SourceId, key?: string): string =>
    key === undefined ? source : `${source}:${key}`;

  const backup: FakeBackup = {
    writes,
    stored,
    put(source, payload, fetchedAt = BACKUP_AT, recoveredFrom = null, key) {
      const meta: BackupMeta = {
        source,
        endpoint: `https://${source}.test`,
        fetched_at: fetchedAt,
        record_count: 1,
        checksum: 'checksum',
        schema_version: 1,
      };
      stored.set(scope(source, key), { payload, meta, recoveredFrom });
    },
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
      stored.set(scope(source, options.key), { payload, meta, recoveredFrom: null });
      return meta;
    },
    async read(source, key) {
      return stored.get(scope(source, key)) ?? null;
    },
    async listVersions() {
      return [];
    },
    async rollback() {
      throw new Error('rollback в тестах не используется');
    },
  };

  return backup;
}

/** Журнал ошибок в памяти. */
interface MemoryErrorLog extends ErrorLog {
  entries: ErrorLogEntry[];
}

function createMemoryErrorLog(): MemoryErrorLog {
  const entries: ErrorLogEntry[] = [];
  return {
    entries,
    async load() {
      // В памяти загружать нечего.
    },
    async append(entry) {
      entries.push(entry);
    },
    recent(limit = 200) {
      return entries.slice(-limit).reverse();
    },
  };
}

/** Сырая запись источника (минимальный набор полей). */
function sourceRecord(
  source: SourceId,
  planetName: string,
  fetchedAt: string,
  overrides: Partial<SourceRecord> = {},
): SourceRecord {
  return {
    source,
    fetchedAt,
    fromBackup: false,
    planetName,
    aliases: [],
    hostname: null,
    letter: null,
    hostAliases: [],
    ra: null,
    dec: null,
    params: {},
    extra: {},
    ...overrides,
  };
}

/** Запись звезды (минимальный набор полей). */
function starRecord(source: 'gaia' | 'simbad', overrides: Partial<StarRecord> = {}): StarRecord {
  return {
    source,
    fetchedAt: NOW,
    fromBackup: false,
    key: {},
    mainId: null,
    aliases: [],
    ra: null,
    dec: null,
    params: {},
    extra: {},
    ...overrides,
  };
}

/** Нормализует тестовые строки каталога. */
function normalizeRows(
  source: CatalogSourceId,
  rows: readonly Record<string, unknown>[],
  ctx: { fetchedAt: string; fromBackup: boolean },
): SourceRecord[] {
  return rows.map((row) => {
    const extra: SourceRecord['extra'] = {};
    if (typeof row['gaia'] === 'string') extra.gaiaDr3Id = row['gaia'];
    return sourceRecord(source, String(row['pl_name']), ctx.fetchedAt, {
      fromBackup: ctx.fromBackup,
      hostname: typeof row['hostname'] === 'string' ? row['hostname'] : null,
      extra,
    });
  });
}

/** Адаптер каталога с заданным поведением. */
function makeAdapter(
  id: CatalogSourceId,
  rows: readonly Record<string, unknown>[],
  fail?: () => Error | null,
): CatalogAdapter {
  return {
    id,
    requiredFields: ['pl_name'],
    async fetchRaw() {
      const error = fail?.() ?? null;
      if (error !== null) throw error;
      return {
        rows: rows.map((row) => ({ ...row })),
        endpoint: `https://${id}.test`,
        query: 'SELECT *',
        warnings: [],
      };
    },
    normalize(rawRows, ctx) {
      return {
        records: normalizeRows(id, rawRows, ctx),
        skippedRows: 0,
      };
    },
  };
}

function makeGaiaFetcher(): GaiaFetcher & { mock: { calls: unknown[][] } } {
  const fetcher = vi.fn(async (ids: readonly string[], options: { fetchedAt?: string }) => ({
    stars: ids.map((id) =>
      starRecord('gaia', {
        key: { gaiaDr3Id: id },
        mainId: id,
        fetchedAt: options.fetchedAt ?? NOW,
      }),
    ),
    unresolved: [],
  }));
  return fetcher as unknown as GaiaFetcher & { mock: { calls: unknown[][] } };
}

function makeSimbadFetcher(): SimbadFetcher & { mock: { calls: unknown[][] } } {
  const fetcher = vi.fn(async (names: readonly string[], options: { fetchedAt?: string }) => ({
    stars: names.map((name) =>
      starRecord('simbad', {
        key: { hostQuery: name },
        mainId: name,
        fetchedAt: options.fetchedAt ?? NOW,
      }),
    ),
    unresolved: [],
  }));
  return fetcher as unknown as SimbadFetcher & { mock: { calls: unknown[][] } };
}

interface Harness {
  state: PipelineState;
  backup: FakeBackup;
  errorLog: MemoryErrorLog;
  adapters: Record<CatalogSourceId, CatalogAdapter>;
  failures: Record<CatalogSourceId, boolean>;
  fetchGaia: GaiaFetcher & { mock: { calls: unknown[][] } };
  fetchSimbad: SimbadFetcher & { mock: { calls: unknown[][] } };
}

interface HarnessConfig {
  nasaRows?: readonly Record<string, unknown>[];
  euRows?: readonly Record<string, unknown>[];
  exomercatRows?: readonly Record<string, unknown>[];
}

function createHarness(config: HarnessConfig = {}): Harness {
  const backup = createFakeBackup();
  const errorLog = createMemoryErrorLog();
  const failures: Record<CatalogSourceId, boolean> = {
    nasa: false,
    exoplanet_eu: false,
    exomercat: false,
  };

  const adapters: Record<CatalogSourceId, CatalogAdapter> = {
    nasa: makeAdapter('nasa', config.nasaRows ?? DEFAULT_NASA_ROWS, () =>
      failures.nasa ? new SourceFetchError('http_5xx', 'NASA недоступен') : null,
    ),
    exoplanet_eu: makeAdapter('exoplanet_eu', config.euRows ?? DEFAULT_EU_ROWS, () =>
      failures.exoplanet_eu ? new SourceFetchError('http_4xx', 'Exoplanet.eu недоступен') : null,
    ),
    exomercat: makeAdapter('exomercat', config.exomercatRows ?? DEFAULT_EXOMERCAT_ROWS, () =>
      failures.exomercat ? new SourceFetchError('timeout', 'Exo-MerCat не ответил') : null,
    ),
  };

  const fetchGaia = makeGaiaFetcher();
  const fetchSimbad = makeSimbadFetcher();

  const state = createPipelineState({
    backup,
    errorLog,
    adapters,
    fetchGaia,
    fetchSimbad,
    now: () => new Date(NOW),
  });

  return { state, backup, errorLog, adapters, failures, fetchGaia, fetchSimbad };
}

async function build(state: PipelineState): Promise<void> {
  expect(state.startRefresh()).toBe(true);
  await state.waitForIdle();
}

describe('конвейер загрузки', () => {
  it('все источники успешны: статусы updated, журнал пуст, phase = ready', async () => {
    const { state, errorLog } = createHarness();

    await build(state);

    const status = state.getStatus();
    expect(status.phase).toBe('ready');
    expect(status.hasSnapshot).toBe(true);
    expect(status.refreshing).toBe(false);
    expect(status.sources.map((source) => source.source)).toEqual([
      'gaia',
      'exomast',
      'nasa',
      'exoplanet_eu',
      'simbad',
      'exomercat',
    ]);
    for (const source of status.sources) {
      if (source.source === 'exomast') {
        // Ленивый источник не трогается при сборке (10.1.4).
        expect(source.state).toBe('pending');
      } else {
        expect(source.state).toBe('updated');
      }
    }
    expect(errorLog.entries).toEqual([]);
    expect(state.getCatalog()?.snapshot.planetCount).toBe(3);
  });

  it('NASA падает при наличии копии: backup, время копии и запись в журнале', async () => {
    const harness = createHarness();
    harness.backup.put(
      'nasa',
      [{ pl_name: 'Backup-1 b', hostname: 'Backup-1', gaia: '9999999999999999999' }],
      BACKUP_AT,
      '20261102_030405.json',
    );
    harness.failures.nasa = true;

    await build(harness.state);

    const status = harness.state.getStatus();
    const nasa = status.sources.find((source) => source.source === 'nasa');
    expect(nasa).toMatchObject({
      state: 'backup',
      backupAt: BACKUP_AT,
    });
    expect(nasa?.message).toContain('NASA недоступен');
    expect(status.phase).toBe('ready');

    const entry = harness.errorLog.recent().find((item) => item.source === 'nasa');
    expect(entry).toMatchObject({
      source: 'nasa',
      reason: 'http_5xx',
      backupUsed: '20261102_030405.json',
    });
    expect(entry?.time).toBe(NOW);
  });

  it('NASA на копии: Gaia получает идентификаторы из записей копии', async () => {
    const harness = createHarness();
    harness.backup.put('nasa', [
      { pl_name: 'Backup-1 b', hostname: 'Backup-1', gaia: '9999999999999999999' },
    ]);
    harness.failures.nasa = true;

    await build(harness.state);

    expect(harness.fetchGaia.mock.calls[0]?.[0]).toEqual(['9999999999999999999']);
  });

  it('источник без копии: error_no_backup, остальные продолжают работу', async () => {
    const harness = createHarness();
    harness.failures.exoplanet_eu = true;

    await build(harness.state);

    const status = harness.state.getStatus();
    const eu = status.sources.find((source) => source.source === 'exoplanet_eu');
    expect(eu).toMatchObject({ state: 'error_no_backup', backupAt: null });
    expect(status.phase).toBe('ready');
    expect(status.hasSnapshot).toBe(true);
    expect(status.sources.find((source) => source.source === 'nasa')?.state).toBe('updated');
    expect(status.sources.find((source) => source.source === 'exomercat')?.state).toBe('updated');

    const entry = harness.errorLog.recent().find((item) => item.source === 'exoplanet_eu');
    expect(entry).toMatchObject({
      source: 'exoplanet_eu',
      reason: 'http_4xx',
      backupUsed: null,
    });
  });

  it('нет идентификаторов Gaia и копии: error_no_backup с message = no_input_ids', async () => {
    const harness = createHarness({
      nasaRows: [{ pl_name: 'Kepler-1 b', hostname: 'Kepler-1' }],
    });

    await build(harness.state);

    const gaia = harness.state.getStatus().sources.find((source) => source.source === 'gaia');
    expect(gaia).toMatchObject({
      state: 'error_no_backup',
      backupAt: null,
      message: 'no_input_ids',
    });
    expect(harness.fetchGaia.mock.calls).toHaveLength(0);
  });

  it('все источники падают без копий и снимка нет: phase = error', async () => {
    const harness = createHarness();
    for (const key of Object.keys(harness.failures) as CatalogSourceId[]) {
      harness.failures[key] = true;
    }

    await build(harness.state);

    const status = harness.state.getStatus();
    expect(status.phase).toBe('error');
    expect(status.hasSnapshot).toBe(false);
    expect(harness.state.getCatalog()).toBeNull();
    for (const source of status.sources) {
      if (source.source === 'exomast') {
        expect(source.state).toBe('pending');
      } else {
        expect(source.state).toBe('error_no_backup');
      }
    }
    expect(harness.errorLog.entries.length).toBeGreaterThan(0);
  });

  it('второе обновление при падении всех источников сохраняет прежний снимок', async () => {
    const harness = createHarness();
    await build(harness.state);
    const previous = harness.state.getSnapshot();
    expect(previous).not.toBeNull();

    for (const key of Object.keys(harness.failures) as CatalogSourceId[]) {
      harness.failures[key] = true;
    }
    harness.backup.stored.clear();

    await build(harness.state);

    expect(harness.state.getStatus().phase).toBe('ready');
    expect(harness.state.getSnapshot()?.id).toBe(previous?.id);
    expect(harness.state.getCatalog()?.snapshot.id).toBe(previous?.id);
  });

  it('во время обновления GET /api/catalog отдаёт прежний снимок', async () => {
    const harness = createHarness();
    await build(harness.state);
    const previous = harness.state.getSnapshot();
    expect(previous).not.toBeNull();

    let release: () => void = () => undefined;
    let started: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const called = new Promise<void>((resolve) => {
      started = resolve;
    });

    harness.adapters.nasa = {
      id: 'nasa',
      requiredFields: ['pl_name'],
      async fetchRaw() {
        started();
        await gate;
        return {
          rows: DEFAULT_NASA_ROWS,
          endpoint: 'https://nasa.test',
          query: 'SELECT *',
          warnings: [],
        };
      },
      normalize(rows, ctx) {
        return { records: normalizeRows('nasa', rows, ctx), skippedRows: 0 };
      },
    };

    expect(harness.state.startRefresh()).toBe(true);
    await called;

    const status = harness.state.getStatus();
    expect(status.refreshing).toBe(true);
    expect(status.phase).toBe('ready');
    expect(harness.state.getCatalog()?.snapshot.id).toBe(previous?.id);

    release();
    await harness.state.waitForIdle();
    expect(harness.state.getStatus().refreshing).toBe(false);
  });
});

describe('runStages', () => {
  it('возвращает статусы в порядке рангов и не бросает при сбоях', async () => {
    const harness = createHarness();
    harness.failures.exomercat = true;

    const result = await runStages({
      backup: harness.backup,
      logError: (entry) => harness.errorLog.append(entry),
      adapters: harness.adapters,
      fetchGaia: harness.fetchGaia,
      fetchSimbad: harness.fetchSimbad,
      now: () => new Date(NOW),
    });

    expect(result.statuses.map((status) => status.source)).toEqual(
      createInitialStatuses().map((status) => status.source),
    );
    expect(result.planets.length).toBe(2);
  });
});

describe('журнал ошибок', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'exo-errors-'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('дописывает JSONL-строки и при загрузке читает последние 200 в память', async () => {
    const filePath = path.join(root, 'data', 'error-log.jsonl');
    const log = createErrorLog({ filePath });

    for (let index = 0; index < 205; index += 1) {
      await log.append({
        source: 'nasa',
        time: new Date(Date.UTC(2026, 10, 14, 12, 0, index)).toISOString(),
        reason: 'timeout',
        backupUsed: null,
      });
    }

    const raw = await readFile(filePath, 'utf8');
    expect(raw.trim().split(/\r?\n/)).toHaveLength(205);

    const reloaded = createErrorLog({ filePath });
    await reloaded.load();

    const recent = reloaded.recent(1000);
    expect(recent).toHaveLength(200);
    expect(recent[0]?.time).toBe(new Date(Date.UTC(2026, 10, 14, 12, 0, 204)).toISOString());
    expect(recent.at(-1)?.time).toBe(new Date(Date.UTC(2026, 10, 14, 12, 0, 5)).toISOString());
  });

  it('пропускает повреждённые строки', async () => {
    const filePath = path.join(root, 'error-log.jsonl');
    const valid = {
      source: 'gaia',
      time: NOW,
      reason: 'empty',
      backupUsed: null,
    };
    await mkdir(root, { recursive: true });
    await writeFile(filePath, `${JSON.stringify(valid)}\n{broken\n`, 'utf8');

    const log = createErrorLog({ filePath });
    await log.load();

    expect(log.recent()).toEqual([valid]);
  });
});
