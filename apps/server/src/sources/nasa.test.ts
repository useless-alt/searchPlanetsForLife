/**
 * Тесты адаптера NASA Exoplanet Archive (задача 8).
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { clearColumnSchemaCache } from './columnResolver';
import { SourceFetchError } from './errors';
import { NASA_CANDIDATES, NASA_ENDPOINT, nasaAdapter } from './nasa';

import { createAdapterFetch, schemaFrom, schemaResponse } from './fixtures/helpers';

import nasaFormA from './fixtures/nasa-form-a.json';

const ROWS = nasaFormA as Array<Record<string, unknown>>;

/** Регулярное выражение запрета ограничений числа строк. */
const NO_ROW_LIMIT = /\bWHERE\b|\bTOP\b|\bLIMIT\b/i;

describe('адаптер NASA: запрос', () => {
  beforeEach(() => {
    clearColumnSchemaCache();
  });

  it('запрашивает существующие колонки без ограничения числа строк', async () => {
    const { fetchImpl, calls } = createAdapterFetch({
      schema: schemaResponse(schemaFrom(NASA_CANDIDATES)),
      rows: ROWS,
    });

    const result = await nasaAdapter.fetchRaw({ fetchImpl });

    const dataCall = calls.find((call) => !call.query.includes('TAP_SCHEMA.columns'));
    expect(dataCall).toBeDefined();
    expect(dataCall?.query).toMatch(/^SELECT .+ FROM pscomppars$/);
    expect(dataCall?.query).not.toMatch(NO_ROW_LIMIT);
    expect(result.query).toBe(dataCall?.query);
    expect(result.rows).toHaveLength(3);
    expect(result.endpoint).toBe(NASA_ENDPOINT);
  });

  it('отсутствующий необязательный столбец не попадает в SELECT', async () => {
    const schema = schemaFrom(NASA_CANDIDATES).filter((column) => column.name !== 'pl_insol');
    const { fetchImpl, calls } = createAdapterFetch({
      schema: schemaResponse(schema),
      rows: ROWS,
    });

    const result = await nasaAdapter.fetchRaw({ fetchImpl });

    const dataCall = calls.find((call) => !call.query.includes('TAP_SCHEMA.columns'));
    expect(dataCall?.query).not.toContain('pl_insol');
    expect(result.query).not.toContain('pl_insol');
    expect(result.warnings).toEqual([]);
  });

  it('отсутствие обязательной колонки даёт schema_mismatch', async () => {
    const schema = schemaFrom(NASA_CANDIDATES).filter((column) => column.name !== 'pl_name');
    const { fetchImpl } = createAdapterFetch({
      schema: schemaResponse(schema),
      rows: ROWS,
    });

    const error = await nasaAdapter.fetchRaw({ fetchImpl }).catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(SourceFetchError);
    expect((error as SourceFetchError).reason).toBe('schema_mismatch');
  });

  it('сбой схемы не останавливает работу: в запросе первые имена-кандидаты', async () => {
    const { fetchImpl, calls } = createAdapterFetch({
      schema: new Error('ECONNREFUSED'),
      rows: ROWS,
    });

    const result = await nasaAdapter.fetchRaw({ fetchImpl });

    expect(result.warnings.length).toBeGreaterThan(0);
    const dataCall = calls.find((call) => !call.query.includes('TAP_SCHEMA.columns'));
    expect(dataCall?.query).toContain('pl_name');
  });
});

describe('адаптер NASA: нормализация', () => {
  it('переносит параметры в единицы проекта', () => {
    const { records, skippedRows } = nasaAdapter.normalize(ROWS, {
      fetchedAt: '2026-11-14T10:00:00.000Z',
      fromBackup: false,
    });

    expect(skippedRows).toBe(1);
    expect(records).toHaveLength(2);

    const first = records[0];
    expect(first?.source).toBe('nasa');
    expect(first?.fetchedAt).toBe('2026-11-14T10:00:00.000Z');
    expect(first?.fromBackup).toBe(false);
    expect(first?.planetName).toBe('Kepler-442 b');
    expect(first?.hostname).toBe('Kepler-442');
    expect(first?.letter).toBe('b');
    expect(first?.ra).toBeCloseTo(229.1064167, 6);
    expect(first?.dec).toBeCloseTo(-19.2495699, 6);
    expect(first?.params.pl_rade).toBe(1.16);
    expect(first?.params.pl_bmasse).toBe(2.36);
    expect(first?.params.pl_orbsmax).toBeCloseTo(0.4093, 6);
    expect(first?.params.pl_orbper).toBeCloseTo(112.3053, 4);
    expect(first?.params.pl_orbeccen).toBeCloseTo(0.4134, 6);
    expect(first?.params.st_teff).toBe(5402);
    expect(first?.params.st_rad).toBe(0.567);
    expect(first?.params.st_mass).toBe(0.544);
    expect(first?.params.st_lum).toBeCloseTo(-0.5862, 6);
    expect(first?.params.sy_dist).toBe(370.5);
    expect(first?.aliases).toEqual([]);
    expect(first?.hostAliases).toEqual([]);
  });

  it('идентификатор Gaia DR3 остаётся строкой без потерь точности', () => {
    const { records } = nasaAdapter.normalize(ROWS, {
      fetchedAt: '2026-11-14T10:00:00.000Z',
      fromBackup: false,
    });

    const first = records[0];
    expect(first?.extra.gaiaDr3Id).toBe('4472832130942575872');
    expect(typeof first?.extra.gaiaDr3Id).toBe('string');
    expect(first?.extra.gaiaDr2Id).toBe('1094620656933164800');
  });

  it('в params нет NaN, Infinity и null', () => {
    const { records } = nasaAdapter.normalize(ROWS, {
      fetchedAt: '2026-11-14T10:00:00.000Z',
      fromBackup: false,
    });

    for (const record of records) {
      for (const value of Object.values(record.params)) {
        expect(typeof value).toBe('number');
        expect(Number.isFinite(value)).toBe(true);
      }
    }
  });

  it('нормализация одинакова для свежих строк и строк из резервной копии', () => {
    const fresh = nasaAdapter.normalize(ROWS, {
      fetchedAt: '2026-11-14T10:00:00.000Z',
      fromBackup: false,
    });
    const backup = nasaAdapter.normalize(ROWS, {
      fetchedAt: '2026-11-14T10:00:00.000Z',
      fromBackup: true,
    });

    expect(backup.records.map((record) => ({ ...record, fromBackup: false }))).toEqual(
      fresh.records.map((record) => ({ ...record, fromBackup: false })),
    );
    expect(backup.records.every((record) => record.fromBackup)).toBe(true);
  });
});
