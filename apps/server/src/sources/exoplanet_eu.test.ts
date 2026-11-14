/**
 * Тесты адаптера Exoplanet.eu (задача 8).
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { MJUP_IN_MEARTH, RJUP_IN_REARTH } from '@exo/shared';

import { clearColumnSchemaCache } from './columnResolver';
import { parseAliasList } from './adapter';
import {
  EXOPLANET_EU_CANDIDATES,
  EXOPLANET_EU_ENDPOINT,
  EXOPLANET_EU_TABLE,
  exoplanetEuAdapter,
} from './exoplanet_eu';

import { createAdapterFetch, schemaFrom, schemaResponse } from './fixtures/helpers';

import exoplanetEuFormA from './fixtures/exoplanet_eu-form-a.json';

const ROWS = exoplanetEuFormA as Array<Record<string, unknown>>;

/** Регулярное выражение запрета ограничений числа строк. */
const NO_ROW_LIMIT = /\bWHERE\b|\bTOP\b|\bLIMIT\b/i;

const CTX = { fetchedAt: '2026-11-14T10:00:00.000Z', fromBackup: false };

describe('адаптер Exoplanet.eu: запрос', () => {
  beforeEach(() => {
    clearColumnSchemaCache();
  });

  it('запрашивает существующие колонки без ограничения числа строк', async () => {
    const { fetchImpl, calls } = createAdapterFetch({
      schema: schemaResponse(schemaFrom(EXOPLANET_EU_CANDIDATES)),
      rows: ROWS,
    });

    const result = await exoplanetEuAdapter.fetchRaw({ fetchImpl });

    const dataCall = calls.find((call) => !call.query.includes('TAP_SCHEMA.columns'));
    expect(dataCall?.query).toMatch(/^SELECT .+ FROM exoplanet\.epn_core$/);
    expect(dataCall?.query).not.toMatch(NO_ROW_LIMIT);
    expect(result.endpoint).toBe(EXOPLANET_EU_ENDPOINT);
    expect(EXOPLANET_EU_TABLE).toBe('exoplanet.epn_core');
  });

  it('отсутствие обязательной колонки даёт schema_mismatch', async () => {
    const schema = schemaFrom(EXOPLANET_EU_CANDIDATES).filter(
      (column) => column.name !== 'star_name',
    );
    const { fetchImpl } = createAdapterFetch({
      schema: schemaResponse(schema),
      rows: ROWS,
    });

    const error = await exoplanetEuAdapter
      .fetchRaw({ fetchImpl })
      .catch((reason: unknown) => reason);

    expect((error as { reason: string }).reason).toBe('schema_mismatch');
  });
});

describe('адаптер Exoplanet.eu: нормализация', () => {
  it('переводит массу и радиус из юпитеров в земные единицы', () => {
    const { records } = exoplanetEuAdapter.normalize(ROWS, CTX);

    const first = records[0];
    expect(first?.params.pl_bmasse).toBeCloseTo(0.69 * MJUP_IN_MEARTH, 6);
    expect(first?.params.pl_rade).toBeCloseTo(1.38 * RJUP_IN_REARTH, 6);
    expect(first?.params.pl_orbsmax).toBeCloseTo(0.04747, 6);
    expect(first?.params.pl_orbper).toBeCloseTo(3.52474859, 6);
    expect(first?.params.pl_orbeccen).toBeCloseTo(0.01, 8);
    expect(first?.params.st_teff).toBe(6091);
    expect(first?.params.st_rad).toBe(1.16);
    expect(first?.params.st_mass).toBe(1.23);
    expect(first?.params.sy_dist).toBe(48.3);
  });

  it('масса 1 и радиус 1 дают точные коэффициенты перевода', () => {
    const { records } = exoplanetEuAdapter.normalize(
      [
        {
          target_name: 'Test b',
          star_name: 'Test',
          mass: 1,
          radius: 1,
        },
      ],
      CTX,
    );

    expect(records[0]?.params.pl_bmasse).toBe(317.83);
    expect(records[0]?.params.pl_rade).toBe(11.209);
  });

  it('столбец mass_sin_i не используется (U22)', () => {
    const { records } = exoplanetEuAdapter.normalize(
      [
        {
          target_name: 'Test b',
          star_name: 'Test',
          mass: 2,
          mass_sin_i: 1,
        },
      ],
      CTX,
    );

    expect(records[0]?.params.pl_bmasse).toBeCloseTo(2 * MJUP_IN_MEARTH, 6);
  });

  it('алиасы разбираются из строки со списком и из JSON-массива', () => {
    expect(parseAliasList('A b, A-b')).toEqual(['A b', 'A-b']);
    expect(parseAliasList('["A b","A-b"]')).toEqual(['A b', 'A-b']);

    const { records } = exoplanetEuAdapter.normalize(ROWS, CTX);
    expect(records[0]?.aliases).toEqual(['HD 209458 b', 'V452 Vul']);
    expect(records[1]?.aliases).toEqual(['Alpha Cen B b', 'C1']);
  });

  it('буква планеты берётся из хвоста имени после имени звезды', () => {
    const { records } = exoplanetEuAdapter.normalize(ROWS, CTX);

    expect(records[0]?.letter).toBe('b');
    expect(records[1]?.letter).toBe('b');
  });

  it('строка без имени пропускается, skippedRows увеличивается', () => {
    const { records, skippedRows } = exoplanetEuAdapter.normalize(ROWS, CTX);

    expect(skippedRows).toBe(1);
    expect(records).toHaveLength(2);
    expect(records.every((record) => record.planetName !== '')).toBe(true);
  });
});
