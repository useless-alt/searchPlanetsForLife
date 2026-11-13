/** Прогрессивный пайплайн: LIVE -> IndexedDB -> встроенный снимок -> пропуск. */

import { DYNAMIC_LIMITS, SOURCE_CONFIG } from '@/config';
import type {
  DataTier,
  LogEntry,
  PipelineResult,
  SourceId,
  SourceStatus,
} from '@/types';
import { getBackup, saveBackup } from '../cache/backups';
import { loadSnapshot } from '../cache/snapshots';
import { fetchExomercat } from '../sources/exomercat';
import { fetchExoplanetEu } from '../sources/exoplanetEu';
import { fetchGaia, extractGaiaIds, gaiaMap } from '../sources/gaia';
import { fetchNasa } from '../sources/nasa';
import { parseTapResponse, type Row } from '../sources/parser';
import { fetchSimbad, simbadMap } from '../sources/simbad';
import { gazetteer, mergeSources } from './merge';
import { isStrictEligible } from '../calc/solver';

export interface ProgressInfo {
  completed: number;
  total: number;
  phase: string;
}

export type ProgressReporter = (
  result: PipelineResult,
  progress: ProgressInfo,
  done: boolean,
) => void;

const ORDER: SourceId[] = ['nasa', 'exomercat', 'exoplanet_eu', 'gaia', 'simbad', 'exomast'];
const CATALOGS: SourceId[] = ['nasa', 'exomercat', 'exoplanet_eu'];
const ENRICHERS: SourceId[] = ['gaia', 'simbad'];

function emptyRaw(): Record<SourceId, Row[]> {
  return { nasa: [], exomercat: [], exoplanet_eu: [], gaia: [], simbad: [], exomast: [] };
}

function initialStatus(source: SourceId): SourceStatus {
  return {
    source,
    label: SOURCE_CONFIG[source].label,
    state: source === 'exomast' ? 'pending' : 'pending',
    records: 0,
    fetchedAt: null,
    tier: null,
    error: null,
    schemaMissing: [],
  };
}

function isRow(value: unknown): value is Row {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Достаёт массив строк из payload резерва/снимка (включая старый TAP-формат). */
export function rowsFromPayload(payload: unknown): Row[] | null {
  if (Array.isArray(payload)) {
    const rows = payload.filter(isRow);
    return rows.length > 0 ? rows : null;
  }
  if (isRow(payload)) {
    if (Array.isArray(payload.rows)) {
      const rows = payload.rows.filter(isRow);
      if (rows.length > 0) return rows;
    }
    try {
      const rows = parseTapResponse(payload);
      return rows.length > 0 ? rows : null;
    } catch {
      return null;
    }
  }
  return null;
}

interface SourceLoad {
  rows: Row[];
  status: SourceStatus;
  logs: LogEntry[];
}

interface LiveFetch {
  rows: Row[];
  schemaMissing: string[];
}

function nowIso(): string {
  return new Date().toISOString();
}

function log(
  source: SourceId | 'pipeline',
  endpoint: string,
  reason: string,
  level: 'info' | 'warn' | 'error',
): LogEntry {
  return { time: nowIso(), source, endpoint, reason, level };
}

async function loadCached(source: SourceId): Promise<{ rows: Row[]; fetchedAt: string } | null> {
  const record = await getBackup(source);
  if (!record) return null;
  const rows = rowsFromPayload(record.payload);
  if (!rows || rows.length === 0) return null;
  return { rows, fetchedAt: record.meta.fetchedAt };
}

async function loadSource(
  source: SourceId,
  live: () => Promise<LiveFetch>,
  logs: LogEntry[],
  options: { forceLive?: boolean } = {},
): Promise<SourceLoad> {
  const cfg = SOURCE_CONFIG[source];
  const endpoint = cfg.endpoint;
  const status = initialStatus(source);

  if (!options.forceLive) {
    const cached = await loadCached(source);
    if (cached) {
      logs.push(log(source, endpoint, 'IDB-копия использована как быстрый старт', 'info'));
      return {
        rows: cached.rows,
        logs,
        status: {
          ...status,
          state: 'cache',
          records: cached.rows.length,
          fetchedAt: cached.fetchedAt,
          tier: 'cache',
        },
      };
    }
  }

  try {
    const result = await live();
    if (result.rows.length === 0) throw new Error('источник вернул 0 записей');
    const saved = await saveBackup(source, endpoint, result.rows, result.rows.length);
    if (!saved.accepted) {
      logs.push(log(source, endpoint, `резерв не обновлён: ${saved.reason ?? 'причина неизвестна'}`, 'warn'));
    }
    return {
      rows: result.rows,
      status: {
        ...status,
        state: 'live',
        records: result.rows.length,
        fetchedAt: nowIso(),
        tier: 'live',
        schemaMissing: result.schemaMissing,
      },
      logs,
    };
  } catch (err) {
    const message = (err as Error).message || 'неизвестная ошибка';
    logs.push(log(source, endpoint, `LIVE: ${message}`, 'error'));

    const cached = await loadCached(source);
    if (cached) {
      logs.push(log(source, endpoint, 'используется резервная копия IDB', 'warn'));
      return {
        rows: cached.rows,
        status: {
          ...status,
          state: 'cache',
          records: cached.rows.length,
          fetchedAt: cached.fetchedAt,
          tier: 'cache',
          error: message,
        },
        logs,
      };
    }

    const snapshot = await loadSnapshot(source);
    if (snapshot) {
      logs.push(log(source, endpoint, 'используется встроенный снимок', 'warn'));
      return {
        rows: snapshot.rows,
        status: {
          ...status,
          state: 'snapshot',
          records: snapshot.rows.length,
          fetchedAt: snapshot.meta.fetchedAt,
          tier: 'snapshot',
          error: message,
          schemaMissing: snapshot.meta.missingColumns ?? [],
        },
        logs,
      };
    }

    logs.push(log(source, endpoint, 'данных нет — источник пропущен', 'error'));
    return {
      rows: [],
      status: {
        ...status,
        state: 'error',
        error: message,
      },
      logs,
    };
  }
}

export class PipelineController {
  private raw = emptyRaw();
  private statuses: Record<SourceId, SourceStatus>;
  private logs: LogEntry[] = [];
  private diagnostics: string[] = [];
  private running = false;
  private pendingRefresh = false;
  private readonly emit: ProgressReporter;

  constructor(emit: ProgressReporter) {
    this.emit = emit;
    this.statuses = Object.fromEntries(ORDER.map((s) => [s, initialStatus(s)])) as Record<
      SourceId,
      SourceStatus
    >;
  }

  private progress(phase: string): ProgressInfo {
    const attempted = [...CATALOGS, ...ENRICHERS].filter(
      (s) => this.statuses[s].state !== 'pending',
    ).length;
    return { completed: attempted, total: 6, phase };
  }

  private pushLogs(entries: LogEntry[]): void {
    this.logs.push(...entries);
    if (this.logs.length > DYNAMIC_LIMITS.errorLogSize) {
      this.logs = this.logs.slice(-DYNAMIC_LIMITS.errorLogSize);
    }
  }

  private build(done: boolean, phase: string): void {
    const now = nowIso();
    const gaiaRows = this.raw.gaia;
    const simbadRows = this.raw.simbad;
    const { entities, warnings } = mergeSources({
      nasa: this.raw.nasa,
      exomercat: this.raw.exomercat,
      exoplanetEu: this.raw.exoplanet_eu,
      gaia: gaiaMap(gaiaRows),
      simbad: simbadMap(simbadRows),
      now,
    });

    const diagnostics = [...this.diagnostics, ...warnings];
    for (const source of ORDER) {
      const missing = this.statuses[source].schemaMissing;
      if (missing.length > 0) {
        diagnostics.push(`${source}: отсутствуют колонки ${missing.join(', ')}`);
      }
    }
    const withoutCoords = entities.filter((e) => {
      const ra = e.fields.ra.value;
      const dec = e.fields.dec.value;
      const dist = e.fields.dist.value;
      return typeof ra !== 'number' || typeof dec !== 'number' || typeof dist !== 'number' || dist <= 0;
    }).length;
    if (withoutCoords > 0) diagnostics.push(`Без координат/расстояния: ${withoutCoords}`);
    if (diagnostics.length === 0) diagnostics.push('Схемы источников соответствуют ожидаемым колонкам.');

    const result: PipelineResult = {
      entities,
      statuses: ORDER.map((s) => ({ ...this.statuses[s] })),
      logs: [...this.logs],
      diagnostics,
      counts: {
        total: entities.length,
        ranked: entities.filter((e) => !e.computed.insufficientData).length,
        strict: entities.filter((e) => isStrictEligible(e.fields, e.computed)).length,
        candidates: entities.filter((e) => e.status === 'candidate').length,
        noCoords: withoutCoords,
        conflicts: entities.filter((e) =>
          (Object.keys(e.fields) as (keyof typeof e.fields)[]).some((k) => e.fields[k].conflict),
        ).length,
        insufficient: entities.filter((e) => e.computed.insufficientData).length,
      },
      generatedAt: now,
    };
    this.emit(result, this.progress(phase), done);
  }

  /** Локальный предпросмотр: что уже есть в IDB. */
  private async previewFromCache(): Promise<boolean> {
    const ids: SourceId[] = [...CATALOGS, ...ENRICHERS];
    const cached = await Promise.all(ids.map(async (source) => [source, await loadCached(source)] as const));
    let any = false;
    for (const [source, entry] of cached) {
      if (!entry) continue;
      any = true;
      this.raw[source] = entry.rows;
      this.statuses[source] = {
        ...this.statuses[source],
        state: 'cache',
        records: entry.rows.length,
        fetchedAt: entry.fetchedAt,
        tier: 'cache' as DataTier,
      };
    }
    if (any) {
      this.pushLogs([log('pipeline', '-', 'показан расчёт по локальным резервам, идёт обновление', 'info')]);
      this.build(false, 'Локальные резервы');
    }
    return this.raw.nasa.length > 0;
  }

  async start(forceLive = false): Promise<void> {
    if (this.running) {
      this.pendingRefresh = true;
      return;
    }
    this.running = true;
    try {
      if (!forceLive) await this.previewFromCache();

      // Этап A: NASA
      this.statuses.nasa = initialStatus('nasa');
      this.build(false, 'NASA pscomppars');
      const nasa = await loadSource('nasa', async () => {
        const r = await fetchNasa();
        return { rows: r.rows, schemaMissing: r.schemaMissing };
      }, [], { forceLive: true });
      this.raw.nasa = nasa.rows;
      this.statuses.nasa = nasa.status;
      this.pushLogs(nasa.logs);
      this.build(false, 'NASA pscomppars');

      // Этап B: Exo-MerCat и Exoplanet.eu параллельно
      this.statuses.exomercat = initialStatus('exomercat');
      this.statuses.exoplanet_eu = initialStatus('exoplanet_eu');
      this.build(false, 'Exo-MerCat и Exoplanet.eu');
      const [exomercat, eu] = await Promise.all([
        loadSource('exomercat', async () => {
          const r = await fetchExomercat();
          return { rows: r.rows, schemaMissing: r.schemaMissing };
        }, [], { forceLive: true }),
        loadSource('exoplanet_eu', async () => {
          const r = await fetchExoplanetEu();
          return { rows: r.rows, schemaMissing: r.schemaMissing };
        }, [], { forceLive: true }),
      ]);
      this.raw.exomercat = exomercat.rows;
      this.raw.exoplanet_eu = eu.rows;
      this.statuses.exomercat = exomercat.status;
      this.statuses.exoplanet_eu = eu.status;
      this.pushLogs([...exomercat.logs, ...eu.logs]);
      this.build(false, 'Слияние каталогов');

      // Этап C: Gaia + SIMBAD по идентификаторам NASA
      const gaiaIds = extractGaiaIds(this.raw.nasa);
      const { simbadIds } = gazetteer(this.raw.nasa);

      this.statuses.gaia = initialStatus('gaia');
      this.statuses.simbad = initialStatus('simbad');
      this.build(false, 'Gaia и SIMBAD');

      const [gaia, simbad] = await Promise.all([
        gaiaIds.length === 0
          ? Promise.resolve<SourceLoad>({
              rows: [],
              status: { ...initialStatus('gaia'), state: 'skipped', error: 'нет Gaia DR3 id в NASA' },
              logs: [log('gaia', SOURCE_CONFIG.gaia.endpoint, 'нет Gaia DR3 id в NASA — источник пропущен', 'info')],
            })
          : loadSource('gaia', async () => {
              const r = await fetchGaia(gaiaIds);
              return { rows: r.rows, schemaMissing: r.schemaMissing };
            }, [], { forceLive: true }),
        simbadIds.length === 0
          ? Promise.resolve<SourceLoad>({
              rows: [],
              status: { ...initialStatus('simbad'), state: 'skipped', error: 'нет Gaia/TIC id в NASA' },
              logs: [log('simbad', SOURCE_CONFIG.simbad.endpoint, 'нет Gaia/TIC id в NASA — источник пропущен', 'info')],
            })
          : loadSource('simbad', async () => {
              const r = await fetchSimbad(simbadIds);
              return { rows: r.rows, schemaMissing: r.schemaMissing };
            }, [], { forceLive: true }),
      ]);
      this.raw.gaia = gaia.rows;
      this.raw.simbad = simbad.rows;
      this.statuses.gaia = gaia.status;
      this.statuses.simbad = simbad.status;
      this.pushLogs([...gaia.logs, ...simbad.logs]);

      this.build(true, 'Готово');
    } finally {
      this.running = false;
      if (this.pendingRefresh) {
        this.pendingRefresh = false;
        void this.start(true);
      }
    }
  }

  async useBackup(source: SourceId, key: string): Promise<boolean> {
    const record = await getBackup(source, key);
    if (!record) return false;
    const rows = rowsFromPayload(record.payload);
    if (!rows) return false;
    this.raw[source] = rows;
    this.statuses[source] = {
      ...this.statuses[source],
      state: 'cache',
      records: rows.length,
      fetchedAt: record.meta.fetchedAt,
      tier: 'cache',
      error: null,
    };
    this.pushLogs([
      log(source, record.meta.endpoint, `ручной откат к версии ${key}`, 'info'),
    ]);
    this.build(true, `Откат: ${SOURCE_CONFIG[source].short}`);
    return true;
  }
}
