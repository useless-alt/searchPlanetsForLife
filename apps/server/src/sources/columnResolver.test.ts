/**
 * Тесты разрешения колонок по схеме TAP (задача 8).
 */

import { beforeEach, describe, expect, it } from 'vitest';

import {
  assertRequiredColumns,
  canonicalUnit,
  clearColumnSchemaCache,
  resolveColumns,
  unitsMatch,
} from './columnResolver';
import { SourceFetchError } from './errors';

import { createSequenceFetch, schemaResponse } from './fixtures/helpers';

const ENDPOINT = 'https://exoplanetarchive.ipac.caltech.edu/TAP/sync';
const TABLE = 'pscomppars';

const CANDIDATES = {
  pl_name: ['pl_name'],
  hostname: ['hostname'],
  pl_insol: ['pl_insol'],
} as const;

describe('разрешение колонок по схеме TAP', () => {
  beforeEach(() => {
    clearColumnSchemaCache();
  });

  it('находит колонки без учёта регистра', async () => {
    const { fetchImpl } = createSequenceFetch([
      schemaResponse([{ name: 'PL_NAME' }, { name: 'hostname' }, { name: 'pl_insol', unit: 'S⊕' }]),
    ]);

    const result = await resolveColumns('nasa', ENDPOINT, TABLE, CANDIDATES, { fetchImpl });

    expect(result.columns['pl_name']).toEqual({ name: 'PL_NAME', unit: null });
    expect(result.columns['hostname']).toEqual({ name: 'hostname', unit: null });
    expect(result.missing).toEqual([]);
  });

  it('отсутствующий необязательный столбец попадает в missing', async () => {
    const { fetchImpl } = createSequenceFetch([
      schemaResponse([{ name: 'pl_name' }, { name: 'hostname' }]),
    ]);

    const result = await resolveColumns('nasa', ENDPOINT, TABLE, CANDIDATES, { fetchImpl });

    expect(result.missing).toEqual(['pl_insol']);
    expect(result.columns['pl_insol']).toBeNull();
  });

  it('сбой запроса к TAP_SCHEMA: предупреждение, работа продолжается', async () => {
    const error = new Error('ECONNREFUSED');
    const { fetchImpl } = createSequenceFetch([error]);

    const result = await resolveColumns('nasa', ENDPOINT, TABLE, CANDIDATES, { fetchImpl });

    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.columns['pl_name']).toEqual({ name: 'pl_name', unit: null });
    expect(result.columns['pl_insol']).toEqual({ name: 'pl_insol', unit: null });
  });

  it('несовпадение ожидаемой единицы даёт предупреждение, но не теряет колонку', async () => {
    const { fetchImpl } = createSequenceFetch([
      schemaResponse([{ name: 'pl_name' }, { name: 'hostname' }, { name: 'pl_insol', unit: 'W' }]),
    ]);

    const result = await resolveColumns('nasa', ENDPOINT, TABLE, CANDIDATES, {
      expectedUnits: { pl_insol: 'earth_insolation' },
      fetchImpl,
    });

    expect(result.columns['pl_insol']).not.toBeNull();
    expect(result.warnings.join(' ')).toContain('pl_insol');
  });

  it('отсутствие обязательного столбца даёт schema_mismatch', async () => {
    const { fetchImpl } = createSequenceFetch([
      schemaResponse([{ name: 'pl_name' }, { name: 'pl_insol' }]),
    ]);

    const resolved = await resolveColumns('nasa', ENDPOINT, TABLE, CANDIDATES, { fetchImpl });

    expect(() => assertRequiredColumns('nasa', ['pl_name', 'hostname'], resolved)).toThrow(
      SourceFetchError,
    );
    try {
      assertRequiredColumns('nasa', ['pl_name', 'hostname'], resolved);
    } catch (error: unknown) {
      expect((error as SourceFetchError).reason).toBe('schema_mismatch');
    }
  });

  it('схема кэшируется в памяти процесса', async () => {
    const { fetchImpl, calls } = createSequenceFetch([
      schemaResponse([{ name: 'pl_name' }, { name: 'hostname' }, { name: 'pl_insol' }]),
    ]);

    await resolveColumns('nasa', ENDPOINT, TABLE, CANDIDATES, { fetchImpl });
    await resolveColumns('nasa', ENDPOINT, TABLE, CANDIDATES, { fetchImpl });

    expect(calls).toHaveLength(1);
  });
});

describe('сравнение единиц измерения', () => {
  it('одинаковые единицы приводятся к каноническому виду', () => {
    expect(canonicalUnit('d')).toBe('day');
    expect(canonicalUnit('days')).toBe('day');
    expect(canonicalUnit('EarthRadius')).toBe('earth_radius');
    expect(canonicalUnit('R⊕')).toBe('earth_radius');
    expect(canonicalUnit('deg')).toBe('degree');
    expect(unitsMatch('d', 'day')).toBe(true);
    expect(unitsMatch('au', 'au')).toBe(true);
    expect(unitsMatch('au', 'day')).toBe(false);
  });

  it('пустая единица не сравнивается', () => {
    expect(canonicalUnit('')).toBeNull();
    expect(canonicalUnit(null)).toBeNull();
    expect(unitsMatch('', 'day')).toBe(false);
  });
});
