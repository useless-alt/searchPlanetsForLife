/**
 * Разрешение колонок каталога по схеме TAP (задача 8).
 *
 * Перед основным запросом каждого TAP-источника выполняется
 * `SELECT column_name, unit FROM TAP_SCHEMA.columns WHERE table_name = '<таблица>'`
 * (раздел «SCHEMA GUARD» ТЗ). В SELECT попадают только колонки,
 * существующие в схеме; выдуманные колонки использовать нельзя
 * (жёсткое правило 3).
 *
 * Результат кэшируется в памяти процесса: схема каталога меняется редко,
 * а запрос стоит денег и времени.
 */

import type { SourceId } from '@exo/shared';

import { SourceFetchError } from './errors';
import { tapQuery, type FetchLike } from './tap';

/** Кандидаты столбцов: логическое имя → список возможных имён колонок. */
export type ColumnCandidateMap = Readonly<Record<string, readonly string[]>>;

/** Разрешённая колонка: имя в схеме и единица измерения (если указана). */
export interface ResolvedColumn {
  /** Имя колонки в схеме источника. */
  name: string;
  /** Единица измерения из TAP_SCHEMA; null, если единица не указана. */
  unit: string | null;
}

/** Результат разрешения колонок. */
export interface ResolveColumnsResult {
  /** Логическое имя → колонка (`null`, если колонки нет в схеме). */
  columns: Record<string, ResolvedColumn | null>;
  /** Логические имена отсутствующих колонок. */
  missing: string[];
  /** Предупреждения: недоступная схема, несовпадение единиц. */
  warnings: string[];
}

/** Дополнительные параметры разрешения колонок. */
export interface ResolveColumnsOptions {
  /** Ожидаемые единицы измерения по логическим именам. */
  expectedUnits?: Readonly<Record<string, string>>;
  /** Функция запроса (в тестах — мок). */
  fetchImpl?: FetchLike;
  /** Таймаут запроса [мс]. */
  timeoutMs?: number;
}

/**
 * Псевдонимы единиц измерения → канонический вид.
 *
 * Схемы архивов записывают одну и ту же единицу по-разному
 * (`d`, `day`, `days`; `au`, `a.u.`; `EarthRadius`, `R⊕`).
 */
const UNIT_ALIASES: Readonly<Record<string, string>> = {
  d: 'day',
  day: 'day',
  days: 'day',
  jd: 'day',
  au: 'au',
  astronomicalunit: 'au',
  earthradius: 'earth_radius',
  re: 'earth_radius',
  'r⊕': 'earth_radius',
  rearth: 'earth_radius',
  earthmass: 'earth_mass',
  mearth: 'earth_mass',
  'm⊕': 'earth_mass',
  mjup: 'jupiter_mass',
  jupitermass: 'jupiter_mass',
  mjupiter: 'jupiter_mass',
  rjup: 'jupiter_radius',
  jupiterradius: 'jupiter_radius',
  rjupiter: 'jupiter_radius',
  k: 'kelvin',
  kelvin: 'kelvin',
  solrad: 'solar_radius',
  rsun: 'solar_radius',
  'r☉': 'solar_radius',
  solarradius: 'solar_radius',
  solmass: 'solar_mass',
  msun: 'solar_mass',
  'm☉': 'solar_mass',
  solarmass: 'solar_mass',
  log10: 'log10',
  log10lsun: 'log10',
  loglsun: 'log10',
  log10l: 'log10',
  logl: 'log10',
  pc: 'parsec',
  parsec: 'parsec',
  parsecs: 'parsec',
  deg: 'degree',
  degree: 'degree',
  degrees: 'degree',
  '°': 'degree',
  's⊕': 'earth_insolation',
  insol: 'earth_insolation',
  insolation: 'earth_insolation',
  dimensionless: 'dimensionless',
  '': 'dimensionless',
};

/** Кэш схем в памяти процесса. */
const schemaCache = new Map<string, ResolveColumnsResult>();

/**
 * Приводит единицу измерения к каноническому виду.
 *
 * @param unit - единица из TAP_SCHEMA (может быть `null` или пустой).
 * @returns каноническая единица либо `null`, если единица не указана.
 */
export function canonicalUnit(unit: string | null | undefined): string | null {
  if (unit === null || unit === undefined) return null;
  const normalized = unit
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9°⊕☉]/g, '');
  if (normalized === '') return null;
  return UNIT_ALIASES[normalized] ?? normalized;
}

/**
 * Проверяет, совпадает ли единица из схемы с ожидаемой.
 */
export function unitsMatch(actual: string | null | undefined, expected: string): boolean {
  const left = canonicalUnit(actual);
  const right = canonicalUnit(expected);
  if (left === null || right === null) return false;
  return left === right;
}

/** Читает строковое значение поля строки (без учёта регистра ключа). */
function readCell(row: Record<string, unknown>, column: string): unknown {
  if (column in row) return row[column];
  const lower = column.toLowerCase();
  for (const [key, value] of Object.entries(row)) {
    if (key.toLowerCase() === lower) return value;
  }
  return undefined;
}

/** Читает строковое значение поля строки; `null`, если значения нет. */
function readText(row: Record<string, unknown>, column: string): string | null {
  const value = readCell(row, column);
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed === '' ? null : trimmed;
  }
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

/**
 * Очищает кэш схем (нужно в тестах, чтобы не делить состояние между кейсами).
 */
export function clearColumnSchemaCache(): void {
  schemaCache.clear();
}

/**
 * Разрешает колонки каталога по схеме TAP.
 *
 * @param source - источник (для сообщений и ключа кэша).
 * @param endpoint - адрес TAP-эндпоинта.
 * @param table - имя таблицы (как в `table_name`).
 * @param candidates - кандидаты столбцов по логическим именам.
 * @param options - ожидаемые единицы, функция запроса, таймаут.
 *
 * @throws {SourceFetchError} `schema_mismatch` не бросается здесь:
 *   отсутствие обязательных колонок проверяет адаптер (`requiredFields`).
 */
export async function resolveColumns(
  source: SourceId,
  endpoint: string,
  table: string,
  candidates: ColumnCandidateMap,
  options: ResolveColumnsOptions = {},
): Promise<ResolveColumnsResult> {
  const cacheKey = [
    source,
    endpoint,
    table,
    JSON.stringify(candidates),
    JSON.stringify(options.expectedUnits ?? {}),
  ].join('|');
  const cached = schemaCache.get(cacheKey);
  if (cached) return cached;

  const warnings: string[] = [];
  const columns: Record<string, ResolvedColumn | null> = {};
  const missing: string[] = [];

  const query = `SELECT column_name, unit FROM TAP_SCHEMA.columns WHERE table_name = '${table}'`;

  let schema: Map<string, ResolvedColumn> | null = null;
  try {
    const result = await tapQuery({
      source,
      endpoint,
      query,
      format: 'json',
      fetchImpl: options.fetchImpl,
      timeoutMs: options.timeoutMs,
    });
    schema = new Map();
    for (const row of result.rows) {
      const name = readText(row, 'column_name');
      if (name === null) continue;
      schema.set(name.toLowerCase(), { name, unit: readText(row, 'unit') });
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    warnings.push(
      `Схема TAP_SCHEMA для таблицы «${table}» недоступна (${message}) — ` +
        'используются первые имена-кандидаты.',
    );
  }

  if (schema !== null) {
    for (const [logical, names] of Object.entries(candidates)) {
      let found: ResolvedColumn | null = null;
      for (const candidate of names) {
        const hit = schema.get(candidate.toLowerCase());
        if (hit) {
          found = { name: hit.name, unit: hit.unit };
          break;
        }
      }
      if (found === null) {
        columns[logical] = null;
        missing.push(logical);
        continue;
      }
      columns[logical] = found;

      const expected = options.expectedUnits?.[logical];
      if (expected !== undefined && found.unit !== null && !unitsMatch(found.unit, expected)) {
        warnings.push(
          `Колонка «${found.name}»: ожидаемая единица «${expected}», в схеме «${found.unit}» — ` +
            'значение не отбрасывается.',
        );
      }
    }
  } else {
    // Схема недоступна: считаем существующим первое имя из списка кандидатов.
    for (const [logical, names] of Object.entries(candidates)) {
      const first = names[0];
      if (first === undefined) {
        columns[logical] = null;
        missing.push(logical);
        continue;
      }
      columns[logical] = { name: first, unit: null };
    }
  }

  const result: ResolveColumnsResult = { columns, missing, warnings };
  schemaCache.set(cacheKey, result);
  return result;
}

/**
 * Проверяет, что все обязательные колонки разрешены.
 *
 * @throws {SourceFetchError} `schema_mismatch`.
 */
export function assertRequiredColumns(
  source: SourceId,
  requiredFields: readonly string[],
  resolved: ResolveColumnsResult,
): void {
  const absent = requiredFields.filter((field) => !resolved.columns[field]);
  if (absent.length > 0) {
    throw new SourceFetchError(
      'schema_mismatch',
      `Источник ${source}: в схеме нет обязательных колонок: ${absent.join(', ')}`,
      { detail: absent.join(', ') },
    );
  }
}
