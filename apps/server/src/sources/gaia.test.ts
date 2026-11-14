/**
 * Тесты адаптера Gaia DR3 (задача 9).
 *
 * Сети в тестах нет: все запросы выполняет мок `fetchImpl`.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import {
  GAIA_ENDPOINT,
  GAIA_ID_PATTERN,
  GAIA_MAX_BATCH_SIZE,
  GAIA_PARAMS_CANDIDATES,
  GAIA_REQUIRED_FIELDS,
  GAIA_SOURCE_CANDIDATES,
  buildGaiaQuery,
  fetchGaiaStars,
  normalizeGaiaIds,
  normalizeGaiaRow,
  resolveGaiaSchema,
  splitGaiaBatches,
} from './gaia';

import { clearColumnSchemaCache } from './columnResolver';

import { createSchemaAwareFetch, dataCalls, schemaResponse } from './fixtures/helpers';

const FETCHED_AT = '2026-11-14T10:00:00.000Z';

/** Заголовок CSV-ответа Gaia (имена колонок как в запросе). */
const GAIA_HEADER =
  'source_id,ra,dec,parallax,parallax_over_error,teff_gspphot,radius_gspphot,radius_flame,lum_flame,mass_flame';

/** Схема Gaia: ответ `TAP_SCHEMA.columns` (обе таблицы одним ответом). */
const GAIA_SCHEMA = schemaResponse(
  [
    ...Object.values(GAIA_SOURCE_CANDIDATES).flat(),
    ...Object.values(GAIA_PARAMS_CANDIDATES).flat(),
  ].map((name) => ({ name, unit: null })),
);

/**
 * Собирает CSV-ответ Gaia из строк.
 */
function gaiaCsv(rows: readonly string[][]): string {
  return [GAIA_HEADER, ...rows.map((row) => row.join(','))].join('\n');
}

/**
 * Считает число идентификаторов в списке `IN (...)` запроса.
 */
function idCount(query: string): number {
  const match = /IN \(([^)]*)\)/.exec(query);
  const list = match?.[1];
  if (list === undefined || list === '') return 0;
  return list.split(',').length;
}

/** Строка звезды WASP-12 (реальный ответ Gaia, снят 14.11.2026). */
const WASP12_ROW = [
  '4472832130942575872',
  '269.44850252543836',
  '4.739420051112412',
  '546.975939730948',
  '13634.737',
  '3099.6335',
  '0.207',
  '0.20216417',
  '0.0033980533',
  '',
];

describe('Gaia: идентификаторы', () => {
  beforeEach(() => {
    clearColumnSchemaCache();
  });

  it('64-битный идентификатор сохраняется строкой без изменений', async () => {
    const { fetchImpl } = createSchemaAwareFetch({
      schema: GAIA_SCHEMA,
      data: [{ body: gaiaCsv([WASP12_ROW]) }],
    });

    const result = await fetchGaiaStars(['4472832130942575872'], {
      fetchImpl,
      fetchedAt: FETCHED_AT,
    });

    const id = result.stars[0]?.key.gaiaDr3Id;
    expect(id).toBe('4472832130942575872');
    expect(typeof id).toBe('string');
    // Число теряет точность — строковое значение отличается от number.
    expect(String(Number('4472832130942575872'))).not.toBe('4472832130942575872');
  });

  it('дубли удаляются, неверные идентификаторы пропускаются', () => {
    const ids = normalizeGaiaIds([
      '4472832130942575872',
      '4472832130942575872',
      '  4472832130942575873  ',
      'abc',
      '123',
      '12345',
      '',
    ]);

    expect(ids).toEqual(['4472832130942575872', '4472832130942575873', '12345']);
    expect(GAIA_ID_PATTERN.test('12345')).toBe(true);
    expect(GAIA_ID_PATTERN.test('1234')).toBe(false);
  });

  it('идентификатор, для которого нет строки, попадает в unresolved', async () => {
    const { fetchImpl } = createSchemaAwareFetch({
      schema: GAIA_SCHEMA,
      data: [{ body: gaiaCsv([WASP12_ROW]) }],
    });

    const result = await fetchGaiaStars(['4472832130942575872', '4472832130942575999'], {
      fetchImpl,
      fetchedAt: FETCHED_AT,
    });

    expect(result.stars).toHaveLength(1);
    expect(result.unresolved).toEqual(['4472832130942575999']);
  });
});

describe('Gaia: пакетные запросы', () => {
  beforeEach(() => {
    clearColumnSchemaCache();
  });

  it('1100 идентификаторов идут тремя партиями: 500 + 500 + 100', async () => {
    const ids = Array.from({ length: 1100 }, (_value, index) => String(100000 + index));
    const { fetchImpl, calls } = createSchemaAwareFetch({
      schema: GAIA_SCHEMA,
      data: [{ body: gaiaCsv([]) }, { body: gaiaCsv([]) }, { body: gaiaCsv([]) }],
    });

    await fetchGaiaStars(ids, { fetchImpl, fetchedAt: FETCHED_AT });

    const batches = dataCalls(calls);
    expect(batches).toHaveLength(3);
    expect(batches.map((call) => idCount(call.query))).toEqual([500, 500, 100]);
    expect(batches.every((call) => call.format === 'csv')).toBe(true);
    expect(batches.every((call) => call.url === GAIA_ENDPOINT)).toBe(true);
  });

  it('размер партии ограничен 500 идентификаторами', () => {
    expect(GAIA_MAX_BATCH_SIZE).toBe(500);
    const batches = splitGaiaBatches(
      Array.from({ length: 1100 }, () => '1'),
      500,
    );
    expect(batches.map((batch) => batch.length)).toEqual([500, 500, 100]);
  });

  it('запрос содержит LEFT JOIN и непустой список идентификаторов', () => {
    const query = buildGaiaQuery(['4472832130942575872']);

    expect(query).toContain('FROM gaiadr3.gaia_source AS s');
    expect(query).toContain('LEFT JOIN gaiadr3.astrophysical_parameters AS a');
    expect(query).toContain('ON a.source_id = s.source_id');
    expect(query).toContain('WHERE s.source_id IN (4472832130942575872)');
    expect(query).not.toMatch(/select\s+\*/i);
  });

  it('сбой второй партии прерывает источник: результата нет', async () => {
    const ids = Array.from({ length: 600 }, (_value, index) => String(200000 + index));
    const { fetchImpl, calls } = createSchemaAwareFetch({
      schema: GAIA_SCHEMA,
      data: [{ body: gaiaCsv([WASP12_ROW]) }, new Error('Сеть недоступна')],
    });

    const error = await fetchGaiaStars(ids, { fetchImpl, fetchedAt: FETCHED_AT }).catch(
      (reason: unknown) => reason,
    );

    expect(dataCalls(calls)).toHaveLength(2);
    expect((error as { reason?: string }).reason).toBe('dns_error');
    expect((error as { name?: string }).name).toBe('SourceFetchError');
  });
});

describe('Gaia: сверка схемы', () => {
  beforeEach(() => {
    clearColumnSchemaCache();
  });

  it('обязательная колонка — source_id', () => {
    expect(GAIA_REQUIRED_FIELDS).toEqual(['source_id']);
  });

  it('отсутствие source_id в схеме даёт schema_mismatch', async () => {
    const schema = schemaResponse(
      Object.values(GAIA_PARAMS_CANDIDATES)
        .flat()
        .map((name) => ({ name, unit: null })),
    );
    const { fetchImpl } = createSchemaAwareFetch({ schema, data: [] });

    const error = await fetchGaiaStars(['4472832130942575872'], { fetchImpl }).catch(
      (reason: unknown) => reason,
    );

    expect((error as { reason?: string }).reason).toBe('schema_mismatch');
  });

  it('разрешённая схема даёт колонки запроса в заданном порядке', async () => {
    const { fetchImpl } = createSchemaAwareFetch({ schema: GAIA_SCHEMA, data: [] });

    const schema = await resolveGaiaSchema({ fetchImpl });

    expect(schema.sourceColumns).toEqual([
      'source_id',
      'ra',
      'dec',
      'parallax',
      'parallax_over_error',
    ]);
    expect(schema.paramColumns).toEqual([
      'teff_gspphot',
      'radius_gspphot',
      'radius_flame',
      'lum_flame',
      'mass_flame',
    ]);
  });
});

describe('Gaia: нормализация', () => {
  it('lum_flame = 0.001 даёт st_lum = −3', () => {
    const star = normalizeGaiaRow(
      { source_id: '1', lum_flame: '0.001' },
      { fetchedAt: FETCHED_AT, fromBackup: false },
    );

    expect(star?.params.st_lum).toBeCloseTo(-3, 10);
  });

  it('lum_flame = 0 не даёт st_lum', () => {
    const star = normalizeGaiaRow(
      { source_id: '1', lum_flame: '0' },
      { fetchedAt: FETCHED_AT, fromBackup: false },
    );

    expect(star?.params.st_lum).toBeUndefined();
    expect('st_lum' in (star?.params ?? {})).toBe(false);
  });

  it('parallax = 100 даёт sy_dist = 10 пк', () => {
    const star = normalizeGaiaRow(
      { source_id: '1', parallax: '100' },
      { fetchedAt: FETCHED_AT, fromBackup: false },
    );

    expect(star?.params.sy_dist).toBeCloseTo(10, 10);
  });

  it('parallax ≤ 0 не даёт sy_dist', () => {
    const zero = normalizeGaiaRow(
      { source_id: '1', parallax: '0' },
      { fetchedAt: FETCHED_AT, fromBackup: false },
    );
    const negative = normalizeGaiaRow(
      { source_id: '1', parallax: '-12.5' },
      { fetchedAt: FETCHED_AT, fromBackup: false },
    );

    expect(zero?.params.sy_dist).toBeUndefined();
    expect(negative?.params.sy_dist).toBeUndefined();
  });

  it('при пустом radius_gspphot берётся radius_flame', () => {
    const star = normalizeGaiaRow(
      { source_id: '1', radius_gspphot: null, radius_flame: '0.12' },
      { fetchedAt: FETCHED_AT, fromBackup: false },
    );

    expect(star?.params.st_rad).toBeCloseTo(0.12, 10);
  });

  it('teff и mass переносятся как есть, координаты — в градусах', () => {
    const star = normalizeGaiaRow(
      {
        source_id: '4472832130942575872',
        ra: '269.44850252543836',
        dec: '4.739420051112412',
        teff_gspphot: '3099.6335',
        mass_flame: '0.62',
        radius_flame: '',
      },
      { fetchedAt: FETCHED_AT, fromBackup: false },
    );

    expect(star?.params.st_teff).toBeCloseTo(3099.6335, 6);
    expect(star?.params.st_mass).toBeCloseTo(0.62, 10);
    expect(star?.params.st_rad).toBeUndefined();
    expect(star?.ra).toBeCloseTo(269.44850252543836, 10);
    expect(star?.dec).toBeCloseTo(4.739420051112412, 10);
    expect(star?.source).toBe('gaia');
    expect(star?.fromBackup).toBe(false);
  });

  it('строка без source_id пропускается', () => {
    const star = normalizeGaiaRow(
      { ra: '10', dec: '20' },
      { fetchedAt: FETCHED_AT, fromBackup: false },
    );

    expect(star).toBeNull();
  });
});
