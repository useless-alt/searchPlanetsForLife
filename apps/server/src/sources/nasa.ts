/**
 * Адаптер NASA Exoplanet Archive (задача 8, п. 5.1, ранг 3).
 *
 * Таблица `pscomppars` — одна строка на одну планету (композит из разных
 * публикаций, согласованность параметров не гарантируется).
 * Единицы колонок NASA уже совпадают с единицами проекта (п. 1.4):
 * R, M — земные; `pl_orbsmax` — а.е.; `pl_orbper` — сутки;
 * `st_lum` — log10 солнечных; `sy_dist` — пк.
 */

import type { SourceId } from '@exo/shared';

import {
  buildParams,
  extractNumericId,
  fetchRows,
  readNumber,
  readText,
  type AdapterFetchContext,
  type CatalogAdapter,
  type FetchRawResult,
  type NormalizeContext,
  type NormalizeResult,
} from './adapter';
import type { ColumnCandidateMap } from './columnResolver';

/** Идентификатор источника. */
export const NASA_SOURCE: SourceId = 'nasa';

/** TAP-эндпоинт NASA Exoplanet Archive. */
export const NASA_ENDPOINT = 'https://exoplanetarchive.ipac.caltech.edu/TAP/sync';

/** Таблица каталога NASA. */
export const NASA_TABLE = 'pscomppars';

/** Кандидаты колонок NASA по логическим именам. */
export const NASA_CANDIDATES: ColumnCandidateMap = {
  pl_name: ['pl_name'],
  hostname: ['hostname'],
  pl_letter: ['pl_letter'],
  ra: ['ra'],
  dec: ['dec'],
  sy_dist: ['sy_dist'],
  pl_rade: ['pl_rade'],
  pl_bmasse: ['pl_bmasse'],
  pl_orbsmax: ['pl_orbsmax'],
  pl_orbper: ['pl_orbper'],
  pl_orbeccen: ['pl_orbeccen'],
  pl_insol: ['pl_insol'],
  pl_eqt: ['pl_eqt'],
  st_teff: ['st_teff'],
  st_rad: ['st_rad'],
  st_mass: ['st_mass'],
  st_lum: ['st_lum'],
  gaia_dr3: ['gaia_dr3_id'],
  gaia_dr2: ['gaia_dr2_id', 'gaia_id'],
};

/** Ожидаемые единицы измерения колонок NASA (проверяются по TAP_SCHEMA). */
export const NASA_EXPECTED_UNITS: Readonly<Record<string, string>> = {
  pl_rade: 'earth_radius',
  pl_bmasse: 'earth_mass',
  pl_orbsmax: 'au',
  pl_orbper: 'day',
  pl_insol: 'earth_insolation',
  pl_eqt: 'kelvin',
  st_teff: 'kelvin',
  st_rad: 'solar_radius',
  st_mass: 'solar_mass',
  st_lum: 'log10',
  sy_dist: 'parsec',
  ra: 'degree',
  dec: 'degree',
};

/** Обязательные колонки NASA: без них каталог непригоден. */
export const NASA_REQUIRED_FIELDS: readonly string[] = ['pl_name', 'hostname'];

/**
 * Приводит сырые строки NASA к записям источника.
 *
 * Строка без имени планеты пропускается, `skippedRows` увеличивается.
 */
export function normalizeNasaRows(
  rows: readonly Record<string, unknown>[],
  ctx: NormalizeContext,
): NormalizeResult {
  const records: NormalizeResult['records'] = [];
  let skippedRows = 0;

  for (const row of rows) {
    const planetName = readText(row, 'pl_name');
    if (planetName === null) {
      skippedRows += 1;
      continue;
    }

    const params = buildParams([
      ['pl_rade', readNumber(row, 'pl_rade')],
      ['pl_bmasse', readNumber(row, 'pl_bmasse')],
      ['pl_orbsmax', readNumber(row, 'pl_orbsmax')],
      ['pl_orbper', readNumber(row, 'pl_orbper')],
      ['pl_orbeccen', readNumber(row, 'pl_orbeccen')],
      ['pl_insol', readNumber(row, 'pl_insol')],
      ['pl_eqt', readNumber(row, 'pl_eqt')],
      ['st_teff', readNumber(row, 'st_teff')],
      ['st_rad', readNumber(row, 'st_rad')],
      ['st_mass', readNumber(row, 'st_mass')],
      ['st_lum', readNumber(row, 'st_lum')],
      ['sy_dist', readNumber(row, 'sy_dist')],
    ]);

    const gaiaDr3Id = extractNumericId(readText(row, ['gaia_dr3_id']));
    const gaiaDr2Id = extractNumericId(readText(row, ['gaia_dr2_id', 'gaia_id']));

    const extra: {
      gaiaDr3Id?: string;
      gaiaDr2Id?: string;
    } = {};
    if (gaiaDr3Id !== null) extra.gaiaDr3Id = gaiaDr3Id;
    if (gaiaDr2Id !== null) extra.gaiaDr2Id = gaiaDr2Id;

    records.push({
      source: NASA_SOURCE,
      fetchedAt: ctx.fetchedAt,
      fromBackup: ctx.fromBackup,
      planetName,
      aliases: [],
      hostname: readText(row, 'hostname'),
      letter: readText(row, 'pl_letter'),
      hostAliases: [],
      ra: readNumber(row, 'ra'),
      dec: readNumber(row, 'dec'),
      params,
      extra,
    });
  }

  return { records, skippedRows };
}

/** Адаптер NASA Exoplanet Archive. */
export const nasaAdapter: CatalogAdapter = {
  id: NASA_SOURCE,
  requiredFields: [...NASA_REQUIRED_FIELDS],
  fetchRaw(ctx: AdapterFetchContext): Promise<FetchRawResult> {
    return fetchRows(
      {
        id: NASA_SOURCE,
        endpoint: NASA_ENDPOINT,
        table: NASA_TABLE,
        candidates: NASA_CANDIDATES,
        expectedUnits: NASA_EXPECTED_UNITS,
        requiredFields: NASA_REQUIRED_FIELDS,
      },
      ctx,
    );
  },
  normalize(rows, ctx): NormalizeResult {
    return normalizeNasaRows(rows, ctx);
  },
};
