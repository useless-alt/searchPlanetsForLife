/**
 * Адаптер CDS SIMBAD — кросс-идентификация и спектральный тип звезды
 * (задача 9, п. 5.1, U7, U27).
 *
 * Запрос идёт в два шага:
 * 1. поиск объекта по именам: `ident` JOIN `basic`, партии по 200 имён;
 *    для каждого имени в `IN (...)` попадают оба варианта — само имя
 *    и `'* ' + имя` (вариант SIMBAD для «звёзд с таким префиксом»);
 * 2. (по желанию) сбор альтернативных идентификаторов: `ident` по `oid`,
 *    партии по 100 значений; все `id` группируются по `oid` в `aliases`.
 *
 * Между любыми двумя запросами к SIMBAD выдерживается пауза не меньше
 * `SIMBAD_MIN_INTERVAL_MS` (окружение, по умолчанию 250 мс, U27).
 *
 * Имя, для которого соответствие не найдено, возвращается в `unresolved`
 * и ошибкой не считается.
 */

import type { SourceId, StarRecord } from '@exo/shared';

import type { BackupStore } from '../backup/store';

import { readCell } from './adapter';
import { assertRequiredColumns, resolveColumns, type ColumnCandidateMap } from './columnResolver';
import { SourceFetchError } from './errors';
import { toNum } from './numbers';
import { tapQuery, type FetchLike } from './tap';

/** Идентификатор источника. */
export const SIMBAD_SOURCE = 'simbad' satisfies SourceId;

/** TAP-эндпоинт SIMBAD (зеркало Harvard). */
export const SIMBAD_ENDPOINT = 'https://simbad.cfa.harvard.edu/simbad/sim-tap/sync';

/** Максимальное число имён в одной партии (шаг 1). */
export const SIMBAD_MAX_BATCH_SIZE = 200;

/** Максимальное число значений `oid` в одной партии (шаг 2). */
export const SIMBAD_ALIAS_BATCH_SIZE = 100;

/** Минимальный интервал между запросами к SIMBAD по умолчанию [мс]. */
export const DEFAULT_SIMBAD_MIN_INTERVAL_MS = 250;

/** Имя переменной окружения с минимальным интервалом между запросами. */
export const SIMBAD_MIN_INTERVAL_ENV = 'SIMBAD_MIN_INTERVAL_MS';

/** Таблица идентификаторов SIMBAD. */
export const SIMBAD_IDENT_TABLE = 'ident';

/** Таблица основных данных SIMBAD. */
export const SIMBAD_BASIC_TABLE = 'basic';

/** Обязательные колонки `ident` (SCHEMA GUARD). */
export const SIMBAD_IDENT_REQUIRED_FIELDS: readonly string[] = ['id', 'oidref'];

/** Обязательные колонки `basic` (SCHEMA GUARD). */
export const SIMBAD_BASIC_REQUIRED_FIELDS: readonly string[] = ['oid'];

/** Кандидаты колонок `ident`. */
export const SIMBAD_IDENT_CANDIDATES: ColumnCandidateMap = {
  id: ['id'],
  oidref: ['oidref'],
};

/** Кандидаты колонок `basic`. */
export const SIMBAD_BASIC_CANDIDATES: ColumnCandidateMap = {
  oid: ['oid'],
  main_id: ['main_id'],
  ra: ['ra'],
  dec: ['dec'],
  plx_value: ['plx_value'],
  sp_type: ['sp_type'],
};

/** Ожидаемые единицы колонок `basic` (сверка схемы). */
export const SIMBAD_BASIC_UNITS: Readonly<Record<string, string>> = {
  ra: 'deg',
  dec: 'deg',
  plx_value: 'mas',
};

/**
 * Читает минимальный интервал между запросами к SIMBAD из окружения.
 *
 * @param env - окружение (по умолчанию `process.env`).
 * @returns интервал [мс]; при некорректном значении — 250 мс.
 */
export function getSimbadMinIntervalMs(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env[SIMBAD_MIN_INTERVAL_ENV]?.trim();
  if (!raw) return DEFAULT_SIMBAD_MIN_INTERVAL_MS;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return DEFAULT_SIMBAD_MIN_INTERVAL_MS;
  return parsed;
}

/** Параметры запроса звёзд SIMBAD. */
export interface SimbadFetchOptions {
  /** Запрашивать альтернативные идентификаторы (по умолчанию — да). */
  fetchAliases?: boolean;
  /** Функция запроса (в тестах — мок, в проде — глобальный `fetch`). */
  fetchImpl?: FetchLike;
  /** Таймаут запроса [мс]. */
  timeoutMs?: number;
  /** Хранилище резервных копий; при отсутствии копия не пишется. */
  backup?: BackupStore;
  /** Время получения данных (ISO 8601); по умолчанию — текущее. */
  fetchedAt?: string;
  /** Признак, что данные взяты из резервной копии. */
  fromBackup?: boolean;
  /** Минимальный интервал между запросами [мс]. */
  minIntervalMs?: number;
  /** Функция текущего времени [мс] (в тестах — фиктивные часы). */
  now?: () => number;
  /** Функция ожидания (в тестах — мгновенная или фиктивная). */
  sleep?: (ms: number) => Promise<void>;
}

/** Результат запроса звёзд SIMBAD. */
export interface SimbadStarsResult {
  /** Нормализованные записи звёзд. */
  stars: StarRecord[];
  /** Имена, для которых соответствие не найдено. */
  unresolved: string[];
}

/** Разрешённая схема SIMBAD: имена колонок для запросов. */
export interface SimbadSchema {
  /** Колонка `ident` с идентификаторами (`id`). */
  idColumn: string;
  /** Колонка `ident` со ссылкой на объект (`oidref`). */
  oidrefColumn: string;
  /** Колонки `basic` в порядке запроса. */
  basicColumns: string[];
  /** Предупреждения сверки схемы. */
  warnings: string[];
}

/**
 * Схема SIMBAD по умолчанию (все колонки на месте).
 */
export const DEFAULT_SIMBAD_SCHEMA: SimbadSchema = {
  idColumn: 'id',
  oidrefColumn: 'oidref',
  basicColumns: ['oid', 'main_id', 'ra', 'dec', 'plx_value', 'sp_type'],
  warnings: [],
};

/**
 * Сверяет схему SIMBAD (SCHEMA GUARD, раздел «ИСТОЧНИКИ» ТЗ).
 *
 * @throws {SourceFetchError} `schema_mismatch` — нет обязательной колонки.
 */
export async function resolveSimbadSchema(options: SimbadFetchOptions): Promise<SimbadSchema> {
  const ident = await resolveColumns(
    SIMBAD_SOURCE,
    SIMBAD_ENDPOINT,
    SIMBAD_IDENT_TABLE,
    SIMBAD_IDENT_CANDIDATES,
    {
      fetchImpl: options.fetchImpl,
      timeoutMs: options.timeoutMs,
    },
  );
  assertRequiredColumns(SIMBAD_SOURCE, SIMBAD_IDENT_REQUIRED_FIELDS, ident);

  const basic = await resolveColumns(
    SIMBAD_SOURCE,
    SIMBAD_ENDPOINT,
    SIMBAD_BASIC_TABLE,
    SIMBAD_BASIC_CANDIDATES,
    {
      expectedUnits: SIMBAD_BASIC_UNITS,
      fetchImpl: options.fetchImpl,
      timeoutMs: options.timeoutMs,
    },
  );
  assertRequiredColumns(SIMBAD_SOURCE, SIMBAD_BASIC_REQUIRED_FIELDS, basic);

  const basicColumns = ['oid', 'main_id', 'ra', 'dec', 'plx_value', 'sp_type']
    .map((logical) => basic.columns[logical]?.name)
    .filter((name): name is string => name !== undefined);

  return {
    idColumn: ident.columns['id']?.name ?? 'id',
    oidrefColumn: ident.columns['oidref']?.name ?? 'oidref',
    basicColumns,
    warnings: [...ident.warnings, ...basic.warnings],
  };
}

/** Состояние ограничителя частоты запросов к SIMBAD. */
interface ThrottleState {
  /** Момент начала последнего запроса [мс]; null — запросов ещё не было. */
  lastStartAt: number | null;
  /** Очередь запросов: следующий ждёт предыдущий. */
  queue: Promise<void>;
}

const throttleState: ThrottleState = { lastStartAt: null, queue: Promise.resolve() };

/**
 * Сбрасывает ограничитель частоты запросов (нужно в тестах).
 */
export function resetSimbadThrottle(): void {
  throttleState.lastStartAt = null;
  throttleState.queue = Promise.resolve();
}

/** Ожидание по умолчанию. */
function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Пропускает запрос через ограничитель частоты.
 *
 * Гарантируется, что между началами двух запросов проходит не меньше
 * `minIntervalMs` миллисекунд, даже если вызовы идут параллельно.
 */
async function waitForSimbadTurn(
  minIntervalMs: number,
  now: () => number,
  sleep: (ms: number) => Promise<void>,
): Promise<void> {
  const previous = throttleState.queue;
  let release: () => void = () => undefined;
  throttleState.queue = new Promise<void>((resolve) => {
    release = resolve;
  });

  await previous;
  try {
    const last = throttleState.lastStartAt;
    if (last !== null) {
      const elapsed = now() - last;
      const wait = minIntervalMs - elapsed;
      if (wait > 0) await sleep(wait);
    }
    throttleState.lastStartAt = now();
  } finally {
    release();
  }
}

/**
 * Экранирует имя для строковой константы ADQL.
 *
 * Одиночная кавычка удваивается (`'` → `''`).
 */
export function escapeSimbadLiteral(value: string): string {
  return value.replace(/'/g, "''");
}

/**
 * Оборачивает значение в кавычки ADQL с экранированием.
 */
export function quoteSimbadLiteral(value: string): string {
  return `'${escapeSimbadLiteral(value)}'`;
}

/**
 * Варианты имени звезды для поиска в SIMBAD.
 *
 * Для каждого имени берутся само имя и вариант с префиксом `'* '`.
 */
export function simbadNameVariants(name: string): string[] {
  return [name, `* ${name}`];
}

/**
 * Собирает ADQL-запрос поиска объекта по именам.
 *
 * @param variants - значения `ident.id` (сами имена и варианты с `'* '`).
 * @param schema - разрешённая схема (по умолчанию — все колонки).
 */
export function buildSimbadQuery(
  variants: readonly string[],
  schema: SimbadSchema = DEFAULT_SIMBAD_SCHEMA,
): string {
  const list = variants.map(quoteSimbadLiteral).join(', ');
  const columns = [
    `i.${schema.idColumn} AS query_id`,
    ...schema.basicColumns.map((name) => `b.${name}`),
  ];
  return (
    `SELECT ${columns.join(', ')} FROM ident AS i JOIN basic AS b ON b.oid = i.oidref ` +
    `WHERE i.id IN (${list})`
  );
}

/**
 * Собирает ADQL-запрос сбора альтернативных идентификаторов по `oid`.
 *
 * @param oids - значения `oid` (строкой, чтобы не терять разрядность).
 * @param schema - разрешённая схема (по умолчанию — все колонки).
 */
export function buildSimbadAliasQuery(
  oids: readonly string[],
  schema: SimbadSchema = DEFAULT_SIMBAD_SCHEMA,
): string {
  const list = oids.map(quoteSimbadLiteral).join(', ');
  return `SELECT ${schema.oidrefColumn}, ${schema.idColumn} FROM ident WHERE oidref IN (${list})`;
}

/**
 * Разбивает список на партии не больше `batchSize`.
 */
export function splitSimbadBatches(items: readonly string[], batchSize: number): string[][] {
  const batches: string[][] = [];
  for (let index = 0; index < items.length; index += batchSize) {
    batches.push(items.slice(index, index + batchSize));
  }
  return batches;
}

/**
 * Убирает повторы и пустые имена, сохраняя порядок.
 */
export function normalizeHostNames(names: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of names) {
    const name = typeof raw === 'string' ? raw.trim() : '';
    if (name === '' || seen.has(name)) continue;
    seen.add(name);
    result.push(name);
  }
  return result;
}

/**
 * Читает текстовое значение ячейки строки SIMBAD.
 */
function readText(row: Record<string, unknown>, column: string): string | null {
  const value = readCell(row, column);
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed === '' ? null : trimmed;
  }
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

/** Собранные по строке ответов данные объекта SIMBAD. */
interface MergedObject {
  /** Внутренний идентификатор `oid` (строкой). */
  oid: string | null;
  /** Основной идентификатор `main_id`. */
  mainId: string | null;
  /** Прямое восхождение [°]. */
  ra: number | null;
  /** Склонение [°]. */
  dec: number | null;
  /** Параллакс [мсд]. */
  plx: number | null;
  /** Спектральный тип. */
  spType: string | null;
}

/**
 * Сливает строки одного объекта: первое непустое значение по каждому полю.
 */
function mergeRows(rows: readonly Record<string, unknown>[]): MergedObject {
  const merged: MergedObject = {
    oid: null,
    mainId: null,
    ra: null,
    dec: null,
    plx: null,
    spType: null,
  };

  for (const row of rows) {
    if (merged.oid === null) merged.oid = readText(row, 'oid');
    if (merged.mainId === null) merged.mainId = readText(row, 'main_id');
    if (merged.ra === null) merged.ra = toNum(readCell(row, 'ra'));
    if (merged.dec === null) merged.dec = toNum(readCell(row, 'dec'));
    if (merged.plx === null) merged.plx = toNum(readCell(row, 'plx_value'));
    if (merged.spType === null) merged.spType = readText(row, 'sp_type');
  }

  return merged;
}

/**
 * Запрашивает данные звёзд SIMBAD по списку имён.
 *
 * @param hostNames - имена звёзд (как в каталогах планет).
 * @param options - параметры запроса.
 * @throws {SourceFetchError} ошибка запроса прерывает источник целиком.
 */
export async function fetchSimbadStars(
  hostNames: readonly string[],
  options: SimbadFetchOptions = {},
): Promise<SimbadStarsResult> {
  const names = normalizeHostNames(hostNames);
  const fetchedAt = options.fetchedAt ?? new Date().toISOString();
  const fromBackup = options.fromBackup ?? false;
  const fetchAliases = options.fetchAliases ?? true;
  const minIntervalMs = options.minIntervalMs ?? getSimbadMinIntervalMs();
  const now = options.now ?? (() => Date.now());
  const sleep = options.sleep ?? defaultSleep;

  // Ограничитель частоты накрывает все запросы к SIMBAD, включая
  // запросы схемы и повторы при 429/503.
  const baseFetch = options.fetchImpl;
  const throttledFetch: FetchLike | undefined =
    baseFetch === undefined
      ? undefined
      : async (url, init) => {
          await waitForSimbadTurn(minIntervalMs, now, sleep);
          return baseFetch(url, init);
        };

  const schema = await resolveSimbadSchema({
    ...options,
    fetchImpl: throttledFetch,
  });

  // Карта «вариант имени → исходное имя» для обратной связи со строками.
  const variantToName = new Map<string, string>();
  for (const name of names) {
    for (const variant of simbadNameVariants(name)) variantToName.set(variant, name);
  }

  const rowsByName = new Map<string, Record<string, unknown>[]>();
  const allRows: Record<string, unknown>[] = [];

  for (const batch of splitSimbadBatches(names, SIMBAD_MAX_BATCH_SIZE)) {
    const variants = batch.flatMap(simbadNameVariants);
    const query = buildSimbadQuery(variants, schema);

    let rows: Record<string, unknown>[];
    try {
      const result = await tapQuery({
        source: SIMBAD_SOURCE,
        endpoint: SIMBAD_ENDPOINT,
        query,
        format: 'json',
        fetchImpl: throttledFetch,
        timeoutMs: options.timeoutMs,
      });
      rows = result.rows;
    } catch (error: unknown) {
      // Ответ без строк — «звезда не найдена», а не сбой источника.
      if (error instanceof SourceFetchError && error.reason === 'empty') continue;
      throw error;
    }

    allRows.push(...rows);
    for (const row of rows) {
      const queryId = readText(row, 'query_id');
      if (queryId === null) continue;
      const name = variantToName.get(queryId);
      if (name === undefined) continue;
      const bucket = rowsByName.get(name);
      if (bucket === undefined) rowsByName.set(name, [row]);
      else bucket.push(row);
    }
  }

  // Альтернативные идентификаторы: все `id` группируются по `oid`.
  const aliasesByOid = new Map<string, string[]>();
  if (fetchAliases) {
    const oids: string[] = [];
    const seenOids = new Set<string>();
    for (const rows of rowsByName.values()) {
      const oid = mergeRows(rows).oid;
      if (oid === null || seenOids.has(oid)) continue;
      seenOids.add(oid);
      oids.push(oid);
    }

    for (const batch of splitSimbadBatches(oids, SIMBAD_ALIAS_BATCH_SIZE)) {
      const query = buildSimbadAliasQuery(batch, schema);

      let rows: Record<string, unknown>[];
      try {
        const result = await tapQuery({
          source: SIMBAD_SOURCE,
          endpoint: SIMBAD_ENDPOINT,
          query,
          format: 'json',
          fetchImpl: throttledFetch,
          timeoutMs: options.timeoutMs,
        });
        rows = result.rows;
      } catch (error: unknown) {
        if (error instanceof SourceFetchError && error.reason === 'empty') continue;
        throw error;
      }

      for (const row of rows) {
        const oid = readText(row, 'oidref');
        const id = readText(row, 'id');
        if (oid === null || id === null) continue;
        const bucket = aliasesByOid.get(oid);
        if (bucket === undefined) aliasesByOid.set(oid, [id]);
        else if (!bucket.includes(id)) bucket.push(id);
      }
    }
  }

  const stars: StarRecord[] = [];
  const unresolved: string[] = [];

  for (const name of names) {
    const rows = rowsByName.get(name);
    if (rows === undefined || rows.length === 0) {
      unresolved.push(name);
      continue;
    }

    // Точное совпадение имени приоритетнее варианта с префиксом «* ».
    const ordered = [
      ...rows.filter((row) => readText(row, 'query_id') === name),
      ...rows.filter((row) => readText(row, 'query_id') !== name),
    ];
    const merged = mergeRows(ordered);

    const params: StarRecord['params'] = {};
    if (merged.plx !== null && merged.plx > 0) params.sy_dist = 1000 / merged.plx;

    const aliases = merged.oid === null ? [] : (aliasesByOid.get(merged.oid) ?? []);

    stars.push({
      source: SIMBAD_SOURCE,
      fetchedAt,
      fromBackup,
      key: { hostQuery: name },
      mainId: merged.mainId,
      aliases,
      ra: merged.ra,
      dec: merged.dec,
      params,
      extra: { spType: merged.spType },
    });
  }

  if (options.backup && allRows.length > 0) {
    try {
      await options.backup.write(
        SIMBAD_SOURCE,
        { rows: allRows },
        { endpoint: SIMBAD_ENDPOINT, recordCount: allRows.length },
      );
    } catch (error: unknown) {
      console.warn('[simbad] не удалось записать резервную копию:', error);
    }
  }

  return { stars, unresolved };
}
