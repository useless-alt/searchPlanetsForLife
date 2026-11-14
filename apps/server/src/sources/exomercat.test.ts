/**
 * Тесты адаптера Exo-MerCat (задача 8).
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { MJUP_IN_MEARTH, RJUP_IN_REARTH } from '@exo/shared';

import { clearColumnSchemaCache } from './columnResolver';
import {
  EXOMERCAT_CANDIDATES,
  EXOMERCAT_ENDPOINT,
  EXOMERCAT_TABLE,
  exomercatAdapter,
} from './exomercat';

import { createAdapterFetch, schemaFrom, schemaResponse } from './fixtures/helpers';

import exomercatFormA from './fixtures/exomercat-form-a.json';

const ROWS = exomercatFormA as Array<Record<string, unknown>>;

/** Регулярное выражение запрета ограничений числа строк. */
const NO_ROW_LIMIT = /\bWHERE\b|\bTOP\b|\bLIMIT\b/i;

const CTX = { fetchedAt: '2026-11-14T10:00:00.000Z', fromBackup: false };

describe('адаптер Exo-MerCat: запрос', () => {
  beforeEach(() => {
    clearColumnSchemaCache();
  });

  it('запрашивает существующие колонки без ограничения числа строк', async () => {
    const { fetchImpl, calls } = createAdapterFetch({
      schema: schemaResponse(schemaFrom(EXOMERCAT_CANDIDATES)),
      rows: ROWS,
    });

    const result = await exomercatAdapter.fetchRaw({ fetchImpl });

    const dataCall = calls.find((call) => !call.query.includes('TAP_SCHEMA.columns'));
    expect(dataCall?.query).toMatch(/^SELECT .+ FROM exomercat\.exomercat$/);
    expect(dataCall?.query).not.toMatch(NO_ROW_LIMIT);
    expect(result.endpoint).toBe(EXOMERCAT_ENDPOINT);
    expect(EXOMERCAT_TABLE).toBe('exomercat.exomercat');
  });

  it('отсутствие обязательной колонки даёт schema_mismatch', async () => {
    const schema = schemaFrom(EXOMERCAT_CANDIDATES).filter(
      (column) => column.name !== 'exomercat_name' && column.name !== 'name',
    );
    const { fetchImpl } = createAdapterFetch({
      schema: schemaResponse(schema),
      rows: ROWS,
    });

    const error = await exomercatAdapter.fetchRaw({ fetchImpl }).catch((reason: unknown) => reason);

    expect((error as { reason: string }).reason).toBe('schema_mismatch');
  });

  it('несовпадение единиц у столбцов p и a даёт предупреждение', async () => {
    const schema = schemaFrom(EXOMERCAT_CANDIDATES, { p: 'year', a: 'km' });
    const { fetchImpl } = createAdapterFetch({
      schema: schemaResponse(schema),
      rows: ROWS,
    });

    const result = await exomercatAdapter.fetchRaw({ fetchImpl });

    const text = result.warnings.join(' ');
    expect(text).toContain('«p»');
    expect(text).toContain('«a»');
  });
});

describe('адаптер Exo-MerCat: нормализация', () => {
  it('координаты из строк main_id_ra и main_id_dec приводятся к числам', () => {
    const { records } = exomercatAdapter.normalize(ROWS, CTX);

    expect(records[0]?.ra).toBeCloseTo(172.56, 6);
    expect(records[0]?.dec).toBeCloseTo(-5.31, 6);
    expect(records[1]?.ra).toBeNull();
    expect(records[1]?.dec).toBeNull();
  });

  it('масса и радиус переводятся из юпитеров в земные единицы', () => {
    const { records } = exomercatAdapter.normalize(ROWS, CTX);

    expect(records[0]?.params.pl_bmasse).toBeCloseTo(2.36 * MJUP_IN_MEARTH, 6);
    expect(records[0]?.params.pl_rade).toBeCloseTo(1.16 * RJUP_IN_REARTH, 6);
    expect(records[0]?.params.pl_orbper).toBeCloseTo(112.3053, 4);
    expect(records[0]?.params.pl_orbsmax).toBeCloseTo(0.4093, 6);
    expect(records[0]?.params.pl_orbeccen).toBeCloseTo(0.4134, 6);
  });

  it('масса 1 и радиус 1 дают точные коэффициенты перевода', () => {
    const { records } = exomercatAdapter.normalize(
      [
        {
          exomercat_name: 'Test b',
          host: 'Test',
          mass: 1,
          r: 1,
        },
      ],
      CTX,
    );

    expect(records[0]?.params.pl_bmasse).toBe(317.83);
    expect(records[0]?.params.pl_rade).toBe(11.209);
  });

  it('кросс-имена попадают в aliases, синонимы звезды — в hostAliases', () => {
    const { records } = exomercatAdapter.normalize(ROWS, CTX);

    expect(records[0]?.aliases).toEqual(['Kepler-442 b']);
    expect(records[1]?.aliases).toEqual(['TOI-700 d']);

    expect(records[0]?.hostAliases).toEqual(['*   Kepler-442', 'Kepler-442']);
    expect(records[1]?.hostAliases).toEqual(['TOI-700', 'TIC 150428135']);
  });

  it('статус и основной идентификатор попадают в extra', () => {
    const { records } = exomercatAdapter.normalize(ROWS, CTX);

    expect(records[0]?.extra.status).toBe('confirmed');
    expect(records[0]?.extra.mainId).toBe('*   Kepler-442');
  });

  it('строка без имени пропускается, skippedRows увеличивается', () => {
    const { records, skippedRows } = exomercatAdapter.normalize(ROWS, CTX);

    expect(skippedRows).toBe(1);
    expect(records).toHaveLength(2);
  });
});
