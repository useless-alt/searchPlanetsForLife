/**
 * Адаптер Exo-MerCat (INAF) — задача 8, п. 5.1, ранг 6.
 *
 * Таблица `exomercat.exomercat` — объединённый каталог: кросс-имена
 * (`nasa_name`, `eu_name`, `toi_name`, `epic_name`) нужны для дедупликации
 * (задача 10), здесь они попадают в `aliases`.
 *
 * Единицы источника: масса — в массах Юпитера, радиус — в радиусах Юпитера,
 * период — в сутках, полуось — в а.е.; координаты (`main_id_ra`,
 * `main_id_dec`) приходят строками в градусах.
 */

import { MJUP_IN_MEARTH, RJUP_IN_REARTH, type SourceId } from '@exo/shared';

import {
  buildParams,
  fetchRows,
  parseAliasList,
  readNumber,
  readRaw,
  readText,
  uniqueNames,
  type AdapterFetchContext,
  type CatalogAdapter,
  type FetchRawResult,
  type NormalizeContext,
  type NormalizeResult,
} from './adapter';
import type { ColumnCandidateMap } from './columnResolver';

/** Идентификатор источника. */
export const EXOMERCAT_SOURCE: SourceId = 'exomercat';

/** TAP-эндпоинт Exo-MerCat. */
export const EXOMERCAT_ENDPOINT = 'http://archives.ia2.inaf.it/vo/tap/projects/sync';

/** Таблица каталога Exo-MerCat. */
export const EXOMERCAT_TABLE = 'exomercat.exomercat';

/** Кандидаты колонок Exo-MerCat по логическим именам. */
export const EXOMERCAT_CANDIDATES: ColumnCandidateMap = {
  exomercat_name: ['exomercat_name', 'name'],
  nasa_name: ['nasa_name'],
  eu_name: ['eu_name'],
  toi_name: ['toi_name'],
  epic_name: ['epic_name'],
  host: ['host'],
  letter: ['letter'],
  main_id: ['main_id'],
  main_id_aliases: ['main_id_aliases'],
  main_id_ra: ['main_id_ra'],
  main_id_dec: ['main_id_dec'],
  mass: ['mass'],
  r: ['r'],
  p: ['p', 'period'],
  a: ['a', 'semi_major_axis'],
  e: ['e', 'eccentricity'],
  status: ['status'],
};

/** Ожидаемые единицы измерения колонок Exo-MerCat (проверяются по TAP_SCHEMA). */
export const EXOMERCAT_EXPECTED_UNITS: Readonly<Record<string, string>> = {
  mass: 'jupiter_mass',
  r: 'jupiter_radius',
  p: 'day',
  a: 'au',
  e: 'dimensionless',
  main_id_ra: 'degree',
  main_id_dec: 'degree',
};

/** Обязательные колонки Exo-MerCat. */
export const EXOMERCAT_REQUIRED_FIELDS: readonly string[] = ['exomercat_name', 'host'];

/** Умножает значение на коэффициент перевода единиц; `null` не меняется. */
function scale(value: number | null, factor: number): number | null {
  if (value === null) return null;
  const result = value * factor;
  return Number.isFinite(result) ? result : null;
}

/**
 * Приводит сырые строки Exo-MerCat к записям источника.
 *
 * Строка без имени планеты пропускается, `skippedRows` увеличивается.
 */
export function normalizeExomercatRows(
  rows: readonly Record<string, unknown>[],
  ctx: NormalizeContext,
): NormalizeResult {
  const records: NormalizeResult['records'] = [];
  let skippedRows = 0;

  for (const row of rows) {
    const planetName = readText(row, ['exomercat_name', 'name']);
    if (planetName === null) {
      skippedRows += 1;
      continue;
    }

    const aliases = uniqueNames([
      readText(row, ['nasa_name']),
      readText(row, ['eu_name']),
      readText(row, ['toi_name']),
      readText(row, ['epic_name']),
    ]);

    const host = readText(row, ['host']);
    const mainId = readText(row, ['main_id']);
    const hostAliases = uniqueNames([
      ...parseAliasList(readRaw(row, ['main_id_aliases']), /[;,|]/),
      mainId,
      host,
    ]);

    const params = buildParams([
      ['pl_rade', scale(readNumber(row, ['r']), RJUP_IN_REARTH)],
      ['pl_bmasse', scale(readNumber(row, ['mass']), MJUP_IN_MEARTH)],
      ['pl_orbper', readNumber(row, ['p', 'period'])],
      ['pl_orbsmax', readNumber(row, ['a', 'semi_major_axis'])],
      ['pl_orbeccen', readNumber(row, ['e', 'eccentricity'])],
    ]);

    const status = readText(row, ['status']);
    const extra: { status?: string; mainId?: string } = {};
    if (status !== null) extra.status = status;
    if (mainId !== null) extra.mainId = mainId;

    records.push({
      source: EXOMERCAT_SOURCE,
      fetchedAt: ctx.fetchedAt,
      fromBackup: ctx.fromBackup,
      planetName,
      aliases,
      hostname: host,
      letter: readText(row, ['letter']),
      hostAliases,
      ra: readNumber(row, ['main_id_ra']),
      dec: readNumber(row, ['main_id_dec']),
      params,
      extra,
    });
  }

  return { records, skippedRows };
}

/** Адаптер Exo-MerCat. */
export const exomercatAdapter: CatalogAdapter = {
  id: EXOMERCAT_SOURCE,
  requiredFields: [...EXOMERCAT_REQUIRED_FIELDS],
  fetchRaw(ctx: AdapterFetchContext): Promise<FetchRawResult> {
    return fetchRows(
      {
        id: EXOMERCAT_SOURCE,
        endpoint: EXOMERCAT_ENDPOINT,
        table: EXOMERCAT_TABLE,
        candidates: EXOMERCAT_CANDIDATES,
        expectedUnits: EXOMERCAT_EXPECTED_UNITS,
        requiredFields: EXOMERCAT_REQUIRED_FIELDS,
      },
      ctx,
    );
  },
  normalize(rows, ctx): NormalizeResult {
    return normalizeExomercatRows(rows, ctx);
  },
};
