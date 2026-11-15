/**
 * Внедрение сбоев в тестовый конвейер (задача 31, п. 1 постановки).
 *
 * Всё управляется переменными окружения, поэтому сервер можно поднять
 * отдельным процессом (Playwright) или в том же процессе (Vitest):
 *
 * - `EXO_FAIL=nasa:http_500,gaia:timeout,exoplanet_eu:invalid_json` —
 *   сбои источников. Допустимые причины: `http_500`, `http_404`,
 *   `timeout`, `invalid_json`, `empty`, `schema_mismatch`, `dns_error`.
 * - `EXO_PRESEED_BACKUPS=nasa,gaia` — заранее положить валидные резервные
 *   копии в `BACKUP_DIR`, чтобы проверить баннеры и статус «резерв».
 * - `EXO_FAKE_EXOMAST=ok|fail|slow:<мс>|backup` — поведение Exo.MAST.
 *
 * Модуль не делает сетевых запросов и не зависит от Playwright: он же
 * используется серверным интеграционным тестом.
 */

import type { FetchErrorReason, SourceId } from '@exo/shared';

import type { BackupStore } from '../backup/store';
import { slug } from '../merge/ids';
import { FAKE_GAIA_ID, buildDatasetRecords, buildDatasetRows, buildFakeGaiaStars } from './dataset';

/** Допустимые токены сбоя в `EXO_FAIL`. */
export type FailureToken =
  'http_500' | 'http_404' | 'timeout' | 'invalid_json' | 'empty' | 'schema_mismatch' | 'dns_error';

/** Разобранное правило сбоя источника. */
export interface FailureRule {
  /** Исходный токен из переменной окружения. */
  token: FailureToken;
  /** Причина в терминах `SourceFetchError`. */
  reason: FetchErrorReason;
  /** HTTP-статус для `http_*`; null — статус неизвестен. */
  status: number | null;
}

/** Карта «источник → правило сбоя». */
export type FailureMap = ReadonlyMap<SourceId, FailureRule>;

/** Соответствие токена причине и статусу. */
const TOKEN_TABLE: Readonly<
  Record<FailureToken, { reason: FetchErrorReason; status: number | null }>
> = {
  http_500: { reason: 'http_5xx', status: 500 },
  http_404: { reason: 'http_4xx', status: 404 },
  timeout: { reason: 'timeout', status: null },
  invalid_json: { reason: 'invalid_json', status: 200 },
  empty: { reason: 'empty', status: 200 },
  schema_mismatch: { reason: 'schema_mismatch', status: 200 },
  dns_error: { reason: 'dns_error', status: null },
};

/** Источники, для которых допускается сбой. */
const FAILABLE_SOURCES: ReadonlySet<SourceId> = new Set<SourceId>([
  'nasa',
  'exoplanet_eu',
  'exomercat',
  'gaia',
  'simbad',
  'exomast',
]);

/** Проверяет, что строка — известный токен сбоя. */
export function isFailureToken(value: string): value is FailureToken {
  return Object.prototype.hasOwnProperty.call(TOKEN_TABLE, value);
}

/**
 * Разбирает строку `EXO_FAIL`.
 *
 * Неизвестные источники и токены пропускаются: опечатка в тестовой
 * переменной не должна ронять сервер. Пустая строка даёт пустую карту.
 */
export function parseFailureSpec(raw: string | undefined): FailureMap {
  const failures = new Map<SourceId, FailureRule>();
  const text = raw?.trim() ?? '';

  if (text === '') return failures;

  for (const part of text.split(',')) {
    const [sourceRaw, tokenRaw] = part.split(':');
    const source = sourceRaw?.trim() as SourceId | undefined;
    const token = tokenRaw?.trim() ?? '';

    if (source === undefined || !FAILABLE_SOURCES.has(source)) continue;
    if (!isFailureToken(token)) continue;

    const rule = TOKEN_TABLE[token];

    failures.set(source, { token, reason: rule.reason, status: rule.status });
  }

  return failures;
}

/** Правило сбоя источника или null. */
export function failureFor(failures: FailureMap, source: SourceId): FailureRule | null {
  return failures.get(source) ?? null;
}

/** Поведение поддельного Exo.MAST. */
export type ExoMastMode =
  { kind: 'ok' } | { kind: 'fail' } | { kind: 'backup' } | { kind: 'slow'; delayMs: number };

/** Разбирает `EXO_FAKE_EXOMAST`; по умолчанию — `ok`. */
export function parseExoMastMode(raw: string | undefined): ExoMastMode {
  const text = raw?.trim().toLowerCase() ?? '';

  if (text === 'fail') return { kind: 'fail' };
  if (text === 'backup') return { kind: 'backup' };

  if (text.startsWith('slow:')) {
    const value = Number.parseInt(text.slice('slow:'.length), 10);

    return { kind: 'slow', delayMs: Number.isFinite(value) && value > 0 ? value : 1000 };
  }

  return { kind: 'ok' };
}

/** Список источников для `EXO_PRESEED_BACKUPS`. */
export function parsePreseedBackups(raw: string | undefined): SourceId[] {
  const text = raw?.trim() ?? '';

  if (text === '') return [];

  const result: SourceId[] = [];

  for (const part of text.split(',')) {
    const source = part.trim() as SourceId;

    if (FAILABLE_SOURCES.has(source) && !result.includes(source)) result.push(source);
  }

  return result;
}

/** Время резервной копии: фиксировано, чтобы даты в баннерах были стабильны. */
export const PRESEED_BACKUP_DATE = new Date('2026-11-14T08:00:00.000Z');

/** Пауза [мс]. */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/** Один словарь Exo.MAST с полями в единицах проекта (п. 1.4). */
export function buildExoMastProperties(planetName: string): Record<string, unknown> {
  return {
    catalog_name: 'nexsci',
    planet_name: planetName,
    canonical_name: planetName,
    Teff: 6100,
    Teff_unit: 'K',
    Rs: 1.05,
    Rs_unit: 'R_sun',
    Ms: 1.08,
    Ms_unit: 'M_sun',
    distance: 12.5,
    distance_unit: 'pc',
    Rp: 0.095,
    Rp_unit: 'R_Jupiter',
    Mp: 0.9,
    Mp_unit: 'M_Jupiter',
    Tp: 420,
    Tp_unit: 'K',
    orbital_period: 21.5,
    orbital_period_unit: 'd',
    orbital_distance: 0.16,
    orbital_distance_unit: 'AU',
    eccentricity: 0.03,
    eccentricity_unit: '',
    molecules: ['H2O', 'CO2', 'CH4'],
  };
}

/** Идентификаторы планет для резервных копий Exo.MAST (ключ кэша). */
export function datasetPlanetIds(): string[] {
  const { planets } = buildDatasetRecords();
  const ids = new Set<string>();

  for (const record of planets) ids.add(slug(record.planetName));

  return [...ids];
}

/**
 * Кладёт валидные резервные копии в хранилище.
 *
 * @param store Хранилище `BACKUP_DIR`.
 * @param sources Источники из `EXO_PRESEED_BACKUPS`.
 * @param now Время копии (по умолчанию {@link PRESEED_BACKUP_DATE}).
 */
export async function preseedBackups(
  store: BackupStore,
  sources: readonly SourceId[],
  now: Date = PRESEED_BACKUP_DATE,
): Promise<void> {
  for (const source of sources) {
    if (source === 'nasa' || source === 'exoplanet_eu' || source === 'exomercat') {
      const rows = buildDatasetRows(source);

      await store.write(
        source,
        rows,
        {
          endpoint: `fake://${source}`,
          recordCount: rows.length,
          requiredFields: ['planetName'],
        },
        now,
      );
      continue;
    }

    if (source === 'gaia') {
      const records = buildFakeGaiaStars([FAKE_GAIA_ID], now.toISOString());

      await store.write(
        'gaia',
        { records, unresolved: [] },
        { endpoint: 'fake://gaia', recordCount: records.length },
        now,
      );
      continue;
    }

    if (source === 'simbad') {
      await store.write(
        'simbad',
        { records: [], unresolved: [] },
        { endpoint: 'fake://simbad', recordCount: 1 },
        now,
      );
      continue;
    }

    if (source === 'exomast') {
      for (const planetId of datasetPlanetIds()) {
        const properties = [buildExoMastProperties(planetId)];

        await store.write(
          'exomast',
          { properties, canonicalName: planetId, spectraFiles: [] },
          {
            endpoint: 'https://exo.mast.stsci.edu/api/v0.1/',
            recordCount: properties.length,
            key: planetId,
          },
          now,
        );
      }
    }
  }
}
