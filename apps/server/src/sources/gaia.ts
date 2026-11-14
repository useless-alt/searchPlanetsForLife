/**
 * Адаптер ESA Gaia DR3 — звёздные параметры (задача 9, п. 5.1, U7).
 *
 * Идентификаторы Gaia DR3 64-битные (порядка 10¹⁸): при разборе JSON
 * они теряют точность. Поэтому запрос идёт с `FORMAT=csv`, и все значения
 * остаются строками — идентификатор хранится строкой (п. 1.4) и нигде
 * не приводится к `number`.
 *
 * Запрос идёт партиями по 500 идентификаторов, последовательно. Любая
 * партия, закончившаяся ошибкой, прерывает весь источник: частичные
 * результаты не возвращаются (решение о резерве — Задача 11).
 *
 * Резервная копия хранит сырые строки как JSON `{ "rows": [...] }`:
 * нормализация повторяется при чтении копии, как и у каталогов Задачи 8.
 *
 * Единицы измерения Gaia (п. 1.4):
 * - `teff_gspphot` — К;
 * - `radius_gspphot`, `radius_flame` — R☉;
 * - `lum_flame` — L☉ (линейная светимость, в запись идёт log10);
 * - `mass_flame` — M☉;
 * - `parallax` — мсд (расстояние в пк получается как 1000 / parallax).
 *
 * Ожидаемые единицы для сверки схемы — в {@link GAIA_SOURCE_UNITS}
 * и {@link GAIA_PARAMS_UNITS}.
 */

import type { SourceId, StarRecord } from '@exo/shared';

import type { BackupStore } from '../backup/store';

import { readCell } from './adapter';
import { assertRequiredColumns, resolveColumns, type ColumnCandidateMap } from './columnResolver';
import { SourceFetchError } from './errors';
import { toNum } from './numbers';
import { tapQuery, type FetchLike } from './tap';

/** Идентификатор источника. */
export const GAIA_SOURCE = 'gaia' satisfies SourceId;

/** TAP-эндпоинт ESA Gaia DR3. */
export const GAIA_ENDPOINT = 'https://gea.esac.esa.int/tap-server/tap/sync';

/** Максимальное число идентификаторов в одной партии. */
export const GAIA_MAX_BATCH_SIZE = 500;

/** Обязательные колонки Gaia (SCHEMA GUARD, п. 1.6). */
export const GAIA_REQUIRED_FIELDS: readonly string[] = ['source_id'];

/** Таблица с координатами и параллаксом звезды. */
export const GAIA_SOURCE_TABLE = 'gaiadr3.gaia_source';

/** Таблица с астрофизическими параметрами звезды. */
export const GAIA_PARAMS_TABLE = 'gaiadr3.astrophysical_parameters';

/** Формат идентификатора Gaia DR3: только цифры, не короче пяти. */
export const GAIA_ID_PATTERN = /^\d{5,}$/;

/** Кандидаты колонок `gaiadr3.gaia_source` (логическое имя → колонки). */
export const GAIA_SOURCE_CANDIDATES: ColumnCandidateMap = {
  source_id: ['source_id'],
  ra: ['ra'],
  dec: ['dec'],
  parallax: ['parallax'],
  parallax_over_error: ['parallax_over_error'],
};

/** Кандидаты колонок `gaiadr3.astrophysical_parameters`. */
export const GAIA_PARAMS_CANDIDATES: ColumnCandidateMap = {
  teff_gspphot: ['teff_gspphot'],
  radius_gspphot: ['radius_gspphot'],
  radius_flame: ['radius_flame'],
  lum_flame: ['lum_flame'],
  mass_flame: ['mass_flame'],
};

/** Ожидаемые единицы колонок `gaiadr3.gaia_source` (сверка схемы). */
export const GAIA_SOURCE_UNITS: Readonly<Record<string, string>> = {
  ra: 'deg',
  dec: 'deg',
  parallax: 'mas',
};

/**
 * Ожидаемые единицы колонок `gaiadr3.astrophysical_parameters`.
 *
 * Единицы прочитаны из `TAP_SCHEMA.columns` архива Gaia (14.11.2026):
 * `K`, `solRad`, `solRad`, `solLum`, `solMass`.
 */
export const GAIA_PARAMS_UNITS: Readonly<Record<string, string>> = {
  teff_gspphot: 'K',
  radius_gspphot: 'solRad',
  radius_flame: 'solRad',
  lum_flame: 'solLum',
  mass_flame: 'solMass',
};

/** Порядок колонок `gaiadr3.gaia_source` в запросе. */
export const GAIA_SOURCE_COLUMN_ORDER = [
  'source_id',
  'ra',
  'dec',
  'parallax',
  'parallax_over_error',
] as const;

/** Порядок колонок `gaiadr3.astrophysical_parameters` в запросе. */
export const GAIA_PARAMS_COLUMN_ORDER = [
  'teff_gspphot',
  'radius_gspphot',
  'radius_flame',
  'lum_flame',
  'mass_flame',
] as const;

/** Разрешённая схема Gaia: имена колонок для запроса. */ export interface GaiaSchema {
  /** Имена колонок `gaiadr3.gaia_source` в порядке запроса. */
  sourceColumns: string[];
  /** Имена колонок `gaiadr3.astrophysical_parameters` в порядке запроса. */
  paramColumns: string[];
  /** Предупреждения сверки схемы (несовпадение единиц, недоступная схема). */
  warnings: string[];
}

/**
 * Схема Gaia по умолчанию (все колонки на месте).
 */
export const DEFAULT_GAIA_SCHEMA: GaiaSchema = {
  sourceColumns: [...GAIA_SOURCE_COLUMN_ORDER],
  paramColumns: [...GAIA_PARAMS_COLUMN_ORDER],
  warnings: [],
};

/**
 * Сверяет схему Gaia (SCHEMA GUARD, раздел «ИСТОЧНИКИ» ТЗ).
 *
 * Запрашиваются две таблицы: `gaiadr3.gaia_source` (координаты и параллакс)
 * и `gaiadr3.astrophysical_parameters` (параметры звезды). Отсутствующие
 * необязательные колонки просто выпадают из запроса; отсутствие
 * обязательной колонки `source_id` — это `schema_mismatch`.
 *
 * @throws {SourceFetchError} `schema_mismatch` — нет обязательной колонки.
 */
export async function resolveGaiaSchema(options: GaiaFetchOptions): Promise<GaiaSchema> {
  const source = await resolveColumns(
    GAIA_SOURCE,
    GAIA_ENDPOINT,
    GAIA_SOURCE_TABLE,
    GAIA_SOURCE_CANDIDATES,
    {
      expectedUnits: GAIA_SOURCE_UNITS,
      fetchImpl: options.fetchImpl,
      timeoutMs: options.timeoutMs,
    },
  );
  assertRequiredColumns(GAIA_SOURCE, GAIA_REQUIRED_FIELDS, source);

  const params = await resolveColumns(
    GAIA_SOURCE,
    GAIA_ENDPOINT,
    GAIA_PARAMS_TABLE,
    GAIA_PARAMS_CANDIDATES,
    {
      expectedUnits: GAIA_PARAMS_UNITS,
      fetchImpl: options.fetchImpl,
      timeoutMs: options.timeoutMs,
    },
  );

  const sourceColumns = GAIA_SOURCE_COLUMN_ORDER.map(
    (logical) => source.columns[logical]?.name,
  ).filter((name): name is string => name !== undefined);
  const paramColumns = GAIA_PARAMS_COLUMN_ORDER.map(
    (logical) => params.columns[logical]?.name,
  ).filter((name): name is string => name !== undefined);

  return {
    sourceColumns,
    paramColumns,
    warnings: [...source.warnings, ...params.warnings],
  };
}

/** Контекст нормализации строки Gaia. */
export interface GaiaNormalizeContext {
  /** Время получения данных (ISO 8601). */
  fetchedAt: string;
  /** Признак, что строка взята из резервной копии. */
  fromBackup: boolean;
}

/** Параметры запроса звёздных параметров Gaia. */
export interface GaiaFetchOptions {
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
}

/** Результат запроса звёздных параметров Gaia. */
export interface GaiaStarsResult {
  /** Нормализованные записи звёзд. */
  stars: StarRecord[];
  /** Идентификаторы, для которых в ответе не было строки. */
  unresolved: string[];
}

/**
 * Читает ячейку строки Gaia по имени колонки.
 *
 * Имена колонок в CSV приходят без префикса таблицы (`source_id`), но
 * запрос собирается с префиксами (`s.source_id`) — поддержаны оба вида.
 */
function readGaiaCell(row: Record<string, unknown>, column: string): unknown {
  const direct = readCell(row, column);
  if (direct !== undefined) return direct;
  for (const [key, value] of Object.entries(row)) {
    if (key.toLowerCase().endsWith(`.${column}`)) return value;
  }
  return undefined;
}

/**
 * Читает текстовое значение колонки Gaia.
 *
 * Идентификатор `source_id` читается только так: он остаётся строкой
 * и никогда не приводится к числу (п. 1.4).
 */
function readGaiaText(row: Record<string, unknown>, column: string): string | null {
  const value = readGaiaCell(row, column);
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed === '' ? null : trimmed;
  }
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

/**
 * Читает числовое значение колонки Gaia; нечисловое значение → `null`.
 */
function readGaiaNumber(row: Record<string, unknown>, column: string): number | null {
  return toNum(readGaiaCell(row, column));
}

/**
 * Собирает ADQL-запрос Gaia по списку идентификаторов.
 *
 * Идентификаторы проверены регулярным выражением {@link GAIA_ID_PATTERN},
 * поэтому вставка значений безопасна.
 *
 * @param ids - идентификаторы Gaia DR3 одной партии.
 * @param schema - разрешённая схема (по умолчанию — все колонки).
 */
export function buildGaiaQuery(
  ids: readonly string[],
  schema: GaiaSchema = DEFAULT_GAIA_SCHEMA,
): string {
  const source = schema.sourceColumns.map((name) => `s.${name}`).join(', ');
  const params = schema.paramColumns.map((name) => `a.${name}`).join(', ');
  const columns = params === '' ? source : `${source}, ${params}`;
  const list = ids.join(', ');
  return (
    `SELECT ${columns} FROM gaiadr3.gaia_source AS s ` +
    'LEFT JOIN gaiadr3.astrophysical_parameters AS a ON a.source_id = s.source_id ' +
    `WHERE s.source_id IN (${list})`
  );
}

/**
 * Нормализует строку ответа Gaia в запись звезды.
 *
 * Правила перевода (п. 5.1):
 * - `st_teff` = `teff_gspphot` [К];
 * - `st_rad` = `radius_gspphot`, иначе `radius_flame` [R☉];
 * - `st_lum` = log10(`lum_flame`) при `lum_flame > 0`;
 * - `st_mass` = `mass_flame` [M☉];
 * - `sy_dist` = 1000 / `parallax` при `parallax > 0` [пк].
 *
 * Отсутствующие значения (в том числе из-за фильтров FLAME, U24)
 * остаются `null` и в `params` не попадают.
 *
 * @returns запись звезды либо `null`, если в строке нет `source_id`.
 */
export function normalizeGaiaRow(
  row: Record<string, unknown>,
  ctx: GaiaNormalizeContext,
): StarRecord | null {
  const gaiaDr3Id = readGaiaText(row, 'source_id');
  if (gaiaDr3Id === null) return null;

  const params: StarRecord['params'] = {};

  const teff = readGaiaNumber(row, 'teff_gspphot');
  if (teff !== null) params.st_teff = teff;

  const radiusGspphot = readGaiaNumber(row, 'radius_gspphot');
  const radiusFlame = readGaiaNumber(row, 'radius_flame');
  const radius = radiusGspphot ?? radiusFlame;
  if (radius !== null) params.st_rad = radius;

  const lumFlame = readGaiaNumber(row, 'lum_flame');
  if (lumFlame !== null && lumFlame > 0) params.st_lum = Math.log10(lumFlame);

  const mass = readGaiaNumber(row, 'mass_flame');
  if (mass !== null) params.st_mass = mass;

  const parallax = readGaiaNumber(row, 'parallax');
  if (parallax !== null && parallax > 0) params.sy_dist = 1000 / parallax;

  return {
    source: GAIA_SOURCE,
    fetchedAt: ctx.fetchedAt,
    fromBackup: ctx.fromBackup,
    key: { gaiaDr3Id },
    mainId: gaiaDr3Id,
    aliases: [],
    ra: readGaiaNumber(row, 'ra'),
    dec: readGaiaNumber(row, 'dec'),
    params,
    extra: {},
  };
}

/**
 * Убирает повторы и неверные идентификаторы Gaia.
 *
 * Идентификатор, не подпадающий под `^\d{5,}$`, пропускается: подставить
 * «похожее» значение нельзя (жёсткое правило 4).
 */
export function normalizeGaiaIds(ids: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of ids) {
    const id = typeof raw === 'string' ? raw.trim() : '';
    if (!GAIA_ID_PATTERN.test(id)) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    result.push(id);
  }
  return result;
}

/**
 * Разбивает список идентификаторов на партии не больше {@link GAIA_MAX_BATCH_SIZE}.
 */
export function splitGaiaBatches(
  ids: readonly string[],
  batchSize: number = GAIA_MAX_BATCH_SIZE,
): string[][] {
  const batches: string[][] = [];
  for (let index = 0; index < ids.length; index += batchSize) {
    batches.push(ids.slice(index, index + batchSize));
  }
  return batches;
}

/**
 * Запрашивает звёздные параметры Gaia DR3 по списку идентификаторов.
 *
 * Партии идут последовательно, ответ читается в формате CSV, поэтому
 * значения (в том числе `source_id`) остаются строками.
 *
 * @throws {SourceFetchError} любая ошибка партии прерывает весь источник;
 *   частичные результаты не возвращаются.
 */
export async function fetchGaiaStars(
  gaiaDr3Ids: readonly string[],
  options: GaiaFetchOptions,
): Promise<GaiaStarsResult> {
  const ids = normalizeGaiaIds(gaiaDr3Ids);
  const batches = splitGaiaBatches(ids);
  const rows: Record<string, unknown>[] = [];
  const fetchedAt = options.fetchedAt ?? new Date().toISOString();
  const fromBackup = options.fromBackup ?? false;
  const schema = await resolveGaiaSchema(options);

  for (const batch of batches) {
    const query = buildGaiaQuery(batch, schema);
    let result;
    try {
      result = await tapQuery({
        source: GAIA_SOURCE,
        endpoint: GAIA_ENDPOINT,
        query,
        format: 'csv',
        fetchImpl: options.fetchImpl,
        timeoutMs: options.timeoutMs,
      });
    } catch (error: unknown) {
      // Ответ без строк — это «звезда не найдена», а не сбой источника.
      if (error instanceof SourceFetchError && error.reason === 'empty') continue;
      throw error;
    }
    rows.push(...result.rows);
  }

  const stars: StarRecord[] = [];
  const found = new Set<string>();
  for (const row of rows) {
    const star = normalizeGaiaRow(row, {
      fetchedAt,
      fromBackup,
    });
    if (star === null) continue;
    stars.push(star);
    const id = star.key.gaiaDr3Id;
    if (id !== undefined) found.add(id);
  }

  if (options.backup && rows.length > 0) {
    try {
      await options.backup.write(
        GAIA_SOURCE,
        { rows },
        { endpoint: GAIA_ENDPOINT, recordCount: rows.length },
      );
    } catch (error: unknown) {
      console.warn('[gaia] не удалось записать резервную копию:', error);
    }
  }

  const unresolved = ids.filter((id) => !found.has(id));
  return { stars, unresolved };
}
