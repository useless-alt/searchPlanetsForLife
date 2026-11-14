/**
 * Загрузка одного источника (задача 11, п. 10.1, 10.1.3).
 *
 * Функции этого модуля никогда не бросают исключений наружу: любой сбой
 * превращается в `SourceStatus` и запись журнала ошибок. Если живой запрос
 * не удался, используется резервная копия; при её отсутствии источник
 * пропускается, а конвейер продолжает работу.
 *
 * Формат резервных копий:
 * - каталоги (NASA, Exoplanet.eu, Exo-MerCat) — массив сырых строк;
 * - Gaia и SIMBAD — `{ records: StarRecord[], unresolved: string[] }` (U32).
 */

import {
  BACKUP_LATEST_FILENAME,
  type ErrorLogEntry,
  type FetchErrorReason,
  type SourceId,
  type SourceRecord,
  type SourceStatus,
  type StarRecord,
} from '@exo/shared';

import type { BackupReadResult, BackupStore } from '../backup/store';
import { pickColumnName, type AdapterFetchContext, type CatalogAdapter } from '../sources/adapter';
import { isSourceFetchError, SourceFetchError } from '../sources/errors';
import {
  GAIA_ENDPOINT,
  fetchGaiaStars,
  normalizeGaiaIds,
  normalizeGaiaRow,
  type GaiaFetchOptions,
  type GaiaStarsResult,
} from '../sources/gaia';
import {
  SIMBAD_ENDPOINT,
  fetchSimbadStars,
  normalizeHostNames,
  type SimbadFetchOptions,
  type SimbadStarsResult,
} from '../sources/simbad';
import type { FetchLike } from '../sources/tap';

/** Каталоги, загружаемые на этапе 1 (задача 8). */
export type CatalogSourceId = 'nasa' | 'exoplanet_eu' | 'exomercat';

/** Звёздные источники, загружаемые на этапе 2 (задача 9). */
export type StarSourceId = 'gaia' | 'simbad';

/** Источники, участвующие в статической сборке каталога. */
export type LoadedSourceId = CatalogSourceId | StarSourceId;

/** Функция записи ошибки в журнал. */
export type ErrorLogger = (entry: ErrorLogEntry) => void | Promise<void>;

/** Функция загрузки Gaia; в тестах подменяется. */
export type GaiaFetcher = (
  ids: readonly string[],
  options: GaiaFetchOptions,
) => Promise<GaiaStarsResult>;

/** Функция загрузки SIMBAD; в тестах подменяется. */
export type SimbadFetcher = (
  names: readonly string[],
  options: SimbadFetchOptions,
) => Promise<SimbadStarsResult>;

/** Зависимости загрузки источников. */
export interface LoadSourceDeps {
  /** Хранилище резервных копий; без него копии не читаются и не пишутся. */
  backup?: BackupStore;
  /** Журнал ошибок (append-only). */
  logError?: ErrorLogger;
  /** Функция HTTP-запроса (в тестах — мок). */
  fetchImpl?: FetchLike;
  /** Таймаут запроса [мс]. */
  timeoutMs?: number;
  /** Текущее время (в тестах — фиксированное). */
  now?: () => Date;
  /** Подмена загрузчика Gaia. */
  fetchGaia?: GaiaFetcher;
  /** Подмена загрузчика SIMBAD. */
  fetchSimbad?: SimbadFetcher;
}

/** Унифицированный результат загрузки источника. */
export interface LoadedSourceResult {
  /** Статус источника для панели диагностики. */
  status: SourceStatus;
  /** Записи каталога (для источников этапа 1). */
  records: SourceRecord[];
  /** Записи звёзд (для Gaia/SIMBAD). */
  stars: StarRecord[];
  /** Входные значения, для которых не нашлось данных. */
  unresolved: string[];
}

/** Причина ошибки в терминах журнала (неизвестный сбой — сетевой). */
export function toFetchErrorReason(error: unknown): FetchErrorReason {
  if (isSourceFetchError(error)) return error.reason;
  return 'dns_error';
}

/** Текст ошибки для поля `message` статуса. */
function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim() !== '') return error.message;
  return String(error);
}

/** Текущее время в ISO 8601. */
function timestamp(deps: LoadSourceDeps): string {
  return (deps.now?.() ?? new Date()).toISOString();
}

/** Дописывает запись журнала, не прерывая загрузку при сбое журнала. */
async function logError(deps: LoadSourceDeps, entry: ErrorLogEntry): Promise<void> {
  if (!deps.logError) return;
  try {
    await deps.logError(entry);
  } catch (error: unknown) {
    console.warn('[pipeline] не удалось записать ошибку источника:', error);
  }
}

/** Имя использованной копии: конкретная версия либо `latest.json`. */
function backupFileName(result: BackupReadResult): string {
  return result.recoveredFrom ?? BACKUP_LATEST_FILENAME;
}

/** Достаёт массив сырых строк из копии каталога (массив или `{ rows }`). */
export function extractBackupRows(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) {
    return payload.filter(
      (row): row is Record<string, unknown> =>
        row !== null && typeof row === 'object' && !Array.isArray(row),
    );
  }
  if (payload !== null && typeof payload === 'object') {
    const rows = (payload as { rows?: unknown }).rows;
    if (Array.isArray(rows)) {
      return rows.filter(
        (row): row is Record<string, unknown> =>
          row !== null && typeof row === 'object' && !Array.isArray(row),
      );
    }
  }
  return [];
}

/** Проверяет, что первая строка содержит все обязательные колонки. */
function assertLiveRows(adapter: CatalogAdapter, rows: readonly Record<string, unknown>[]): void {
  if (rows.length === 0) {
    throw new SourceFetchError('empty', `${adapter.id}: ответ источника пуст`);
  }
  const first = rows[0];
  if (first === undefined) {
    throw new SourceFetchError('empty', `${adapter.id}: ответ источника пуст`);
  }
  const missing = adapter.requiredFields.filter((field) => pickColumnName(first, [field]) === null);
  if (missing.length > 0) {
    throw new SourceFetchError(
      'schema_mismatch',
      `${adapter.id}: в ответе нет обязательных колонок: ${missing.join(', ')}`,
    );
  }
}

/** Записывает копию; сбой записи не отменяет успеха живых данных. */
async function writeBackup(
  deps: LoadSourceDeps,
  source: SourceId,
  payload: unknown,
  options: { endpoint: string; recordCount: number; requiredFields?: string[] },
  time: string,
): Promise<void> {
  if (!deps.backup) return;
  try {
    await deps.backup.write(source, payload, options);
  } catch (error: unknown) {
    console.warn(`[${source}] не удалось записать резервную копию:`, error);
    await logError(deps, {
      source,
      time,
      reason: 'backup_write_failed',
      backupUsed: null,
    });
  }
}

/** Статус успешного источника. */
function updatedStatus(source: SourceId): SourceStatus {
  return { source, state: 'updated', backupAt: null, message: null };
}

/** Статус источника, восстановленного из копии. */
function backupStatus(source: SourceId, fetchedAt: string, message: string): SourceStatus {
  return { source, state: 'backup', backupAt: fetchedAt, message };
}

/** Статус источника без копии. */
function failedStatus(source: SourceId, message: string): SourceStatus {
  return { source, state: 'error_no_backup', backupAt: null, message };
}

/** Пустой результат для источника без данных. */
function emptyResult(status: SourceStatus): LoadedSourceResult {
  return { status, records: [], stars: [], unresolved: [] };
}

/**
 * Загружает каталог этапа 1.
 *
 * Порядок (п. 10.1.3): живой запрос → проверка ответа → запись копии.
 * При любой ошибке — чтение копии и нормализация с `fromBackup = true`.
 */
export async function loadCatalogSource(
  adapter: CatalogAdapter,
  deps: LoadSourceDeps,
): Promise<LoadedSourceResult> {
  const time = timestamp(deps);
  const ctx: AdapterFetchContext = {
    fetchImpl: deps.fetchImpl,
    timeoutMs: deps.timeoutMs,
  };

  try {
    const raw = await adapter.fetchRaw(ctx);
    assertLiveRows(adapter, raw.rows);

    const normalized = adapter.normalize(raw.rows, {
      fetchedAt: time,
      fromBackup: false,
    });

    await writeBackup(
      deps,
      adapter.id,
      raw.rows,
      {
        endpoint: raw.endpoint,
        recordCount: raw.rows.length,
        requiredFields: adapter.requiredFields,
      },
      time,
    );

    return {
      status: updatedStatus(adapter.id),
      records: normalized.records,
      stars: [],
      unresolved: [],
    };
  } catch (error: unknown) {
    return restoreCatalog(adapter, deps, error, time);
  }
}

/** Восстанавливает каталог из резервной копии. */
async function restoreCatalog(
  adapter: CatalogAdapter,
  deps: LoadSourceDeps,
  error: unknown,
  time: string,
): Promise<LoadedSourceResult> {
  const reason = toFetchErrorReason(error);
  const message = errorMessage(error);

  const stored = deps.backup ? await deps.backup.read(adapter.id) : null;
  if (stored !== null) {
    const rows = extractBackupRows(stored.payload);
    if (rows.length > 0) {
      try {
        const normalized = adapter.normalize(rows, {
          fetchedAt: stored.meta.fetched_at,
          fromBackup: true,
        });
        await logError(deps, {
          source: adapter.id,
          time,
          reason,
          backupUsed: backupFileName(stored),
        });
        return {
          status: backupStatus(adapter.id, stored.meta.fetched_at, message),
          records: normalized.records,
          stars: [],
          unresolved: [],
        };
      } catch {
        // Повреждённую копию считаем отсутствующей (п. 8.2).
      }
    }
  }

  await logError(deps, {
    source: adapter.id,
    time,
    reason,
    backupUsed: null,
  });
  return emptyResult(failedStatus(adapter.id, message));
}

/** Проверяет, что значение похоже на запись звезды. */
function isStarRecord(value: unknown): value is StarRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Достаёт записи звёзд из копии U32 `{ records, unresolved }`.
 *
 * Поддерживается и старый формат Gaia `{ rows }`: строки нормализуются
 * повторно, как и у каталогов.
 */
function extractBackupStars(
  payload: unknown,
  source: StarSourceId,
  inputValues: readonly string[],
): { records: StarRecord[]; unresolved: string[] } | null {
  if (payload !== null && typeof payload === 'object' && !Array.isArray(payload)) {
    const envelope = payload as { records?: unknown; unresolved?: unknown; rows?: unknown };
    if (Array.isArray(envelope.records)) {
      const records = envelope.records.filter(isStarRecord);
      const unresolved = Array.isArray(envelope.unresolved)
        ? envelope.unresolved.filter((value): value is string => typeof value === 'string')
        : [];
      return { records, unresolved };
    }
    if (source === 'gaia' && Array.isArray(envelope.rows)) {
      const records: StarRecord[] = [];
      for (const row of envelope.rows) {
        if (row === null || typeof row !== 'object' || Array.isArray(row)) continue;
        const star = normalizeGaiaRow(row as Record<string, unknown>, {
          fetchedAt: '',
          fromBackup: true,
        });
        if (star !== null) records.push(star);
      }
      const found = new Set(
        records
          .map((record) => record.key.gaiaDr3Id)
          .filter((value): value is string => value !== undefined),
      );
      return {
        records,
        unresolved: inputValues.filter((value) => !found.has(value)),
      };
    }
  }
  return null;
}

/** Помечает записи копии как `fromBackup` и ставит время копии. */
function markFromBackup(records: readonly StarRecord[], fetchedAt: string): StarRecord[] {
  return records.map((record) => ({
    ...record,
    fetchedAt,
    fromBackup: true,
  }));
}

/** Восстанавливает звёздный источник из копии либо сообщает об ошибке. */
async function restoreStarSource(
  source: StarSourceId,
  inputValues: readonly string[],
  deps: LoadSourceDeps,
  error: unknown,
  time: string,
  noInput: boolean,
): Promise<LoadedSourceResult> {
  const reason = toFetchErrorReason(error);
  const message = noInput ? 'no_input_ids' : errorMessage(error);
  const stored = deps.backup ? await deps.backup.read(source) : null;

  if (stored !== null) {
    const restored = extractBackupStars(stored.payload, source, inputValues);
    if (restored !== null) {
      await logError(deps, {
        source,
        time,
        reason,
        backupUsed: backupFileName(stored),
      });
      return {
        status: backupStatus(source, stored.meta.fetched_at, message),
        records: [],
        stars: markFromBackup(restored.records, stored.meta.fetched_at),
        unresolved: restored.unresolved,
      };
    }
  }

  await logError(deps, { source, time, reason, backupUsed: null });
  return emptyResult(failedStatus(source, message));
}

/** Загружает Gaia DR3 по списку идентификаторов (этап 2). */
export async function loadGaiaSource(
  ids: readonly string[],
  deps: LoadSourceDeps,
): Promise<LoadedSourceResult> {
  const time = timestamp(deps);
  const normalizedIds = normalizeGaiaIds(ids);

  if (normalizedIds.length === 0) {
    return restoreStarSource(
      'gaia',
      normalizedIds,
      deps,
      new SourceFetchError('empty', 'Gaia: нет входных идентификаторов'),
      time,
      true,
    );
  }

  try {
    const fetch = deps.fetchGaia ?? fetchGaiaStars;
    const result = await fetch(normalizedIds, {
      fetchImpl: deps.fetchImpl,
      timeoutMs: deps.timeoutMs,
      fetchedAt: time,
    });

    // Пустой ответ по известным идентификаторам — не сбой: звёзд может
    // не быть в каталоге. Копию с нулём записей хранилище не принимает.
    if (result.stars.length > 0) {
      await writeBackup(
        deps,
        'gaia',
        { records: result.stars, unresolved: result.unresolved },
        { endpoint: GAIA_ENDPOINT, recordCount: result.stars.length },
        time,
      );
    }

    return {
      status: updatedStatus('gaia'),
      records: [],
      stars: result.stars,
      unresolved: result.unresolved,
    };
  } catch (error: unknown) {
    return restoreStarSource('gaia', normalizedIds, deps, error, time, false);
  }
}

/** Загружает SIMBAD по списку имён звёзд (этап 2). */
export async function loadSimbadSource(
  hostNames: readonly string[],
  deps: LoadSourceDeps,
): Promise<LoadedSourceResult> {
  const time = timestamp(deps);
  const names = normalizeHostNames(hostNames);

  if (names.length === 0) {
    return restoreStarSource(
      'simbad',
      names,
      deps,
      new SourceFetchError('empty', 'SIMBAD: нет входных имён'),
      time,
      true,
    );
  }

  try {
    const fetch = deps.fetchSimbad ?? fetchSimbadStars;
    const result = await fetch(names, {
      fetchImpl: deps.fetchImpl,
      timeoutMs: deps.timeoutMs,
      fetchedAt: time,
    });

    if (result.stars.length > 0) {
      await writeBackup(
        deps,
        'simbad',
        { records: result.stars, unresolved: result.unresolved },
        { endpoint: SIMBAD_ENDPOINT, recordCount: result.stars.length },
        time,
      );
    }

    return {
      status: updatedStatus('simbad'),
      records: [],
      stars: result.stars,
      unresolved: result.unresolved,
    };
  } catch (error: unknown) {
    return restoreStarSource('simbad', names, deps, error, time, false);
  }
}
