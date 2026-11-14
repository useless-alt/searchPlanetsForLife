/**
 * Контракт адаптера каталога и общие помощники нормализации (задача 8).
 *
 * Адаптер отвечает за две вещи:
 * 1. `fetchRaw` — получить сырые строки каталога (запрос TAP + схема);
 * 2. `normalize` — превратить строки в `SourceRecord`.
 *
 * `normalize` работает одинаково для свежих строк и для строк из
 * резервной копии (п. 8.1): резерв хранит сырые строки источника,
 * поэтому преобразование единиц и приведение типов повторяются при чтении.
 */

import type { RawParamKey, SourceId, SourceRecord } from '@exo/shared';

import { assertRequiredColumns, resolveColumns, type ColumnCandidateMap } from './columnResolver';
import { toNum } from './numbers';
import { tapQuery, type FetchLike, type TapFormat } from './tap';

/** Контекст запроса данных источника. */
export interface AdapterFetchContext {
  /** Функция запроса (в тестах — мок, в проде — глобальный `fetch`). */
  fetchImpl?: FetchLike;
  /** Таймаут запроса [мс]. */
  timeoutMs?: number;
  /** `MAXREC` TAP-запроса. */
  maxrec?: number;
  /** Формат ответа источника; по умолчанию `json`. */
  format?: TapFormat;
}

/** Результат запроса сырых строк источника. */
export interface FetchRawResult {
  /** Сырые строки источника; ключи столбцов — в нижнем регистре. */
  rows: Record<string, unknown>[];
  /** Эндпоинт, к которому выполнен запрос. */
  endpoint: string;
  /** Текст выполненного ADQL-запроса. */
  query: string;
  /** Предупреждения: недоступная схема, несовпадение единиц, подмена формата. */
  warnings: string[];
}

/** Контекст нормализации строк. */
export interface NormalizeContext {
  /** Время получения данных (ISO 8601). */
  fetchedAt: string;
  /** Признак, что строки взяты из резервной копии. */
  fromBackup: boolean;
}

/** Результат нормализации строк. */
export interface NormalizeResult {
  /** Готовые записи источника. */
  records: SourceRecord[];
  /** Число пропущенных строк (без имени планеты). */
  skippedRows: number;
}

/** Адаптер каталога экзопланет. */
export interface CatalogAdapter {
  /** Идентификатор источника. */
  id: SourceId;
  /** Обязательные колонки: если их нет в схеме — `schema_mismatch`. */
  requiredFields: string[];
  /** Запрашивает сырые строки каталога. */
  fetchRaw(ctx: AdapterFetchContext): Promise<FetchRawResult>;
  /** Превращает сырые строки в записи источника. */
  normalize(rows: Record<string, unknown>[], ctx: NormalizeContext): NormalizeResult;
}

/** Описание источника для общей реализации `fetchRaw`. */
export interface AdapterSourceConfig {
  /** Идентификатор источника. */
  id: SourceId;
  /** Адрес TAP-эндпоинта. */
  endpoint: string;
  /** Таблица каталога. */
  table: string;
  /** Кандидаты столбцов по логическим именам. */
  candidates: ColumnCandidateMap;
  /** Ожидаемые единицы измерения по логическим именам. */
  expectedUnits?: Readonly<Record<string, string>>;
  /** Обязательные колонки (логические имена). */
  requiredFields: readonly string[];
  /** Формат ответа источника. */
  format?: TapFormat;
}

/**
 * Читает значение ячейки строки по имени колонки (без учёта регистра).
 *
 * @returns значение или `undefined`, если колонки в строке нет.
 */
export function readCell(row: Record<string, unknown>, column: string): unknown {
  if (Object.prototype.hasOwnProperty.call(row, column)) return row[column];
  const lower = column.toLowerCase();
  for (const [key, value] of Object.entries(row)) {
    if (key.toLowerCase() === lower) return value;
  }
  return undefined;
}

/**
 * Находит в строке колонку из списка кандидатов.
 *
 * @returns имя найденной колонки (как в строке) либо `null`.
 */
export function pickColumnName(
  row: Record<string, unknown>,
  candidates: readonly string[],
): string | null {
  for (const candidate of candidates) {
    if (Object.prototype.hasOwnProperty.call(row, candidate)) return candidate;
    const lower = candidate.toLowerCase();
    for (const key of Object.keys(row)) {
      if (key.toLowerCase() === lower) return key;
    }
  }
  return null;
}

/**
 * Читает сырое значение ячейки по списку кандидатов (без приведения типов).
 */
export function readRaw(row: Record<string, unknown>, candidates: readonly string[]): unknown {
  const name = pickColumnName(row, candidates);
  if (name === null) return undefined;
  return readCell(row, name);
}

/**
 * Читает текстовое значение колонки (пустая строка и `null` → `null`).
 */
export function readText(
  row: Record<string, unknown>,
  column: string | readonly string[],
): string | null {
  const name = typeof column === 'string' ? column : pickColumnName(row, column);
  if (name === null) return null;
  const value = readCell(row, name);
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed === '' ? null : trimmed;
  }
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

/**
 * Читает числовое значение колонки; нечисловое значение → `null`.
 */
export function readNumber(
  row: Record<string, unknown>,
  column: string | readonly string[],
): number | null {
  const name = typeof column === 'string' ? column : pickColumnName(row, column);
  if (name === null) return null;
  return toNum(readCell(row, name));
}

/**
 * Разбирает список имён: JSON-массив либо строка с разделителями.
 *
 * Разделители по умолчанию — запятая и точка с запятой
 * (формат `alt_target_name` каталога Exoplanet.eu).
 *
 * @param value - исходное значение (строка, массив или `null`).
 * @param separators - регулярное выражение с разделителями.
 */
export function parseAliasList(value: unknown, separators: RegExp = /[,;]/): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter((item) => item !== '');
  }
  if (typeof value !== 'string') return [];
  const trimmed = value.trim();
  if (trimmed === '') return [];

  if (trimmed.startsWith('[')) {
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.map((item) => String(item).trim()).filter((item) => item !== '');
      }
    } catch {
      // Не JSON-массив — разбираем как обычный список.
    }
  }

  return trimmed
    .split(separators)
    .map((item) => item.trim())
    .filter((item) => item !== '');
}

/**
 * Убирает пустые значения и повторы, сохраняя порядок.
 */
export function uniqueNames(values: readonly (string | null)[]): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    if (value === null) continue;
    const trimmed = value.trim();
    if (trimmed === '' || seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
}

/**
 * Достаёт числовой идентификатор из строки вида «Gaia DR3 4472832130942575872».
 *
 * Идентификатор остаётся строкой: через `number` он бы потерял точность
 * (19 значащих цифр).
 *
 * @returns цифры идентификатора либо `null`, если совпадения нет.
 */
export function extractNumericId(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value !== 'string') return null;
  const match = /(\d{5,})/.exec(value);
  return match ? (match[1] as string) : null;
}

/**
 * Собирает `params` записи: только конечные числа, отсутствующие ключи опускаются.
 */
export function buildParams(
  entries: readonly (readonly [RawParamKey, number | null])[],
): Partial<Record<RawParamKey, number>> {
  const params: Partial<Record<RawParamKey, number>> = {};
  for (const [key, value] of entries) {
    if (value === null || !Number.isFinite(value)) continue;
    params[key] = value;
  }
  return params;
}

/**
 * Общая реализация `fetchRaw`: схема → SELECT → запрос TAP.
 *
 * В SELECT попадают только существующие колонки; ограничений числа строк
 * (WHERE, TOP, LIMIT) в запросе нет (разд. 1 части 1: 100 % записей).
 *
 * @throws {SourceFetchError} `schema_mismatch` — нет обязательных колонок.
 */
export async function fetchRows(
  config: AdapterSourceConfig,
  ctx: AdapterFetchContext,
): Promise<FetchRawResult> {
  const resolved = await resolveColumns(
    config.id,
    config.endpoint,
    config.table,
    config.candidates,
    {
      expectedUnits: config.expectedUnits,
      fetchImpl: ctx.fetchImpl,
      timeoutMs: ctx.timeoutMs,
    },
  );

  assertRequiredColumns(config.id, config.requiredFields, resolved);

  const names: string[] = [];
  for (const column of Object.values(resolved.columns)) {
    if (column) names.push(column.name);
  }

  const query = `SELECT ${names.join(', ')} FROM ${config.table}`;
  const result = await tapQuery({
    source: config.id,
    endpoint: config.endpoint,
    query,
    format: config.format ?? 'json',
    timeoutMs: ctx.timeoutMs,
    maxrec: ctx.maxrec,
    fetchImpl: ctx.fetchImpl,
  });

  return {
    rows: result.rows,
    endpoint: config.endpoint,
    query,
    warnings: [...resolved.warnings, ...result.warnings],
  };
}
