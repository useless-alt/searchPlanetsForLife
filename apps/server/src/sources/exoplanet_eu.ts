/**
 * Адаптер Exoplanet.eu (LESIA, Парижская обсерватория) — задача 8,
 * п. 5.1, ранг 4.
 *
 * Таблица `exoplanet.epn_core`, ответ в формате DaCHS (разбирается
 * толерантно: форма A и форма B JSON, см. `tap.ts`).
 *
 * Единицы источника отличаются от единиц проекта (п. 1.4):
 * масса — в массах Юпитера, радиус — в радиусах Юпитера,
 * период — в сутках, полуось — в а.е., расстояние — в парсеках.
 * Столбцы `mass_sin_i` не используются (U22: нижняя граница массы
 * не является истинной массой).
 */

import { MJUP_IN_MEARTH, RJUP_IN_REARTH, type SourceId } from '@exo/shared';

import {
  buildParams,
  fetchRows,
  parseAliasList,
  readNumber,
  readRaw,
  readText,
  type AdapterFetchContext,
  type CatalogAdapter,
  type FetchRawResult,
  type NormalizeContext,
  type NormalizeResult,
} from './adapter';
import type { ColumnCandidateMap } from './columnResolver';

/** Идентификатор источника. */
export const EXOPLANET_EU_SOURCE: SourceId = 'exoplanet_eu';

/** TAP-эндпоинт Exoplanet.eu. */
export const EXOPLANET_EU_ENDPOINT = 'http://voparis-tap-planeto.obspm.fr/tap/sync';

/** Таблица каталога Exoplanet.eu. */
export const EXOPLANET_EU_TABLE = 'exoplanet.epn_core';

/** Кандидаты колонок Exoplanet.eu по логическим именам. */
export const EXOPLANET_EU_CANDIDATES: ColumnCandidateMap = {
  target_name: ['target_name'],
  alt_target_name: ['alt_target_name'],
  star_name: ['star_name'],
  ra: ['ra'],
  dec: ['dec'],
  mass: ['mass'],
  radius: ['radius'],
  semi_major_axis: ['semi_major_axis'],
  period: ['period', 'orbital_period'],
  eccentricity: ['eccentricity'],
  star_teff: ['star_teff'],
  star_radius: ['star_radius'],
  star_mass: ['star_mass'],
  distance: ['star_distance', 'distance'],
  planet_status: ['planet_status'],
};

/** Ожидаемые единицы измерения колонок Exoplanet.eu (проверяются по TAP_SCHEMA). */
export const EXOPLANET_EU_EXPECTED_UNITS: Readonly<Record<string, string>> = {
  mass: 'jupiter_mass',
  radius: 'jupiter_radius',
  semi_major_axis: 'au',
  period: 'day',
  star_teff: 'kelvin',
  star_radius: 'solar_radius',
  star_mass: 'solar_mass',
  distance: 'parsec',
  ra: 'degree',
  dec: 'degree',
};

/** Обязательные колонки Exoplanet.eu. */
export const EXOPLANET_EU_REQUIRED_FIELDS: readonly string[] = ['target_name', 'star_name'];

/** Умножает значение на коэффициент перевода единиц; `null` не меняется. */
function scale(value: number | null, factor: number): number | null {
  if (value === null) return null;
  const result = value * factor;
  return Number.isFinite(result) ? result : null;
}

/**
 * Определяет букву планеты: хвост имени после имени звезды.
 *
 * «HD 12345 b» при звезде «HD 12345» → «b»; иначе — `null`.
 */
export function detectLetter(targetName: string | null, starName: string | null): string | null {
  if (targetName === null || starName === null || starName === '') return null;
  if (!targetName.startsWith(`${starName} `)) return null;
  const rest = targetName.slice(starName.length + 1).trim();
  return rest === '' ? null : rest;
}

/**
 * Приводит сырые строки Exoplanet.eu к записям источника.
 *
 * Строка без имени планеты пропускается, `skippedRows` увеличивается.
 */
export function normalizeExoplanetEuRows(
  rows: readonly Record<string, unknown>[],
  ctx: NormalizeContext,
): NormalizeResult {
  const records: NormalizeResult['records'] = [];
  let skippedRows = 0;

  for (const row of rows) {
    const planetName = readText(row, ['target_name']);
    if (planetName === null) {
      skippedRows += 1;
      continue;
    }

    const starName = readText(row, ['star_name']);
    const aliases = parseAliasList(readRaw(row, ['alt_target_name']), /[,;]/);

    const params = buildParams([
      ['pl_rade', scale(readNumber(row, ['radius']), RJUP_IN_REARTH)],
      ['pl_bmasse', scale(readNumber(row, ['mass']), MJUP_IN_MEARTH)],
      ['pl_orbsmax', readNumber(row, ['semi_major_axis'])],
      ['pl_orbper', readNumber(row, ['period', 'orbital_period'])],
      ['pl_orbeccen', readNumber(row, ['eccentricity'])],
      ['st_teff', readNumber(row, ['star_teff'])],
      ['st_rad', readNumber(row, ['star_radius'])],
      ['st_mass', readNumber(row, ['star_mass'])],
      ['sy_dist', readNumber(row, ['star_distance', 'distance'])],
    ]);

    const status = readText(row, ['planet_status']);
    const extra: { status?: string } = {};
    if (status !== null) extra.status = status;

    records.push({
      source: EXOPLANET_EU_SOURCE,
      fetchedAt: ctx.fetchedAt,
      fromBackup: ctx.fromBackup,
      planetName,
      aliases,
      hostname: starName,
      letter: detectLetter(planetName, starName),
      hostAliases: [],
      ra: readNumber(row, ['ra']),
      dec: readNumber(row, ['dec']),
      params,
      extra,
    });
  }

  return { records, skippedRows };
}

/** Адаптер Exoplanet.eu. */
export const exoplanetEuAdapter: CatalogAdapter = {
  id: EXOPLANET_EU_SOURCE,
  requiredFields: [...EXOPLANET_EU_REQUIRED_FIELDS],
  fetchRaw(ctx: AdapterFetchContext): Promise<FetchRawResult> {
    return fetchRows(
      {
        id: EXOPLANET_EU_SOURCE,
        endpoint: EXOPLANET_EU_ENDPOINT,
        table: EXOPLANET_EU_TABLE,
        candidates: EXOPLANET_EU_CANDIDATES,
        expectedUnits: EXOPLANET_EU_EXPECTED_UNITS,
        requiredFields: EXOPLANET_EU_REQUIRED_FIELDS,
      },
      ctx,
    );
  },
  normalize(rows, ctx): NormalizeResult {
    return normalizeExoplanetEuRows(rows, ctx);
  },
};
