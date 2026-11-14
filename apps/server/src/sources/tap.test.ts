/**
 * Тесты TAP-клиента (задача 8).
 *
 * Сети в тестах нет: все запросы выполняет мок `fetchImpl`.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { SourceFetchError } from './errors';
import { parseTapJson, tapQuery } from './tap';

import {
  createFailingFetch,
  createHangingFetch,
  createSequenceFetch,
  instantSleep,
} from './fixtures/helpers';

import exoplanetEuFormA from './fixtures/exoplanet_eu-form-a.json';
import exoplanetEuFormB from './fixtures/exoplanet_eu-form-b.json';
import exomercatFormA from './fixtures/exomercat-form-a.json';
import exomercatFormB from './fixtures/exomercat-form-b.json';
import nasaFormA from './fixtures/nasa-form-a.json';
import nasaFormB from './fixtures/nasa-form-b.json';

const FIXTURES_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');

/** CSV-фикстура читается с диска: импорт CSV не поддерживается TypeScript. */
const nasaCsv = readFileSync(path.join(FIXTURES_DIR, 'nasa.csv'), 'utf8');

const ENDPOINT = 'https://exoplanetarchive.ipac.caltech.edu/TAP/sync';
const QUERY = 'SELECT pl_name, hostname FROM pscomppars';

describe('разбор ответов TAP', () => {
  it('фикстуры в форме A и форме B дают одинаковые строки', () => {
    expect(parseTapJson(JSON.stringify(nasaFormA))).toEqual(
      parseTapJson(JSON.stringify(nasaFormB)),
    );
    expect(parseTapJson(JSON.stringify(exoplanetEuFormA))).toEqual(
      parseTapJson(JSON.stringify(exoplanetEuFormB)),
    );
    expect(parseTapJson(JSON.stringify(exomercatFormA))).toEqual(
      parseTapJson(JSON.stringify(exomercatFormB)),
    );
  });

  it('объекты формы B собираются по порядку metadata', () => {
    const rows = parseTapJson(JSON.stringify(nasaFormB));
    expect(Object.keys(rows[0] as object)).toEqual([
      'pl_name',
      'hostname',
      'pl_letter',
      'ra',
      'dec',
      'sy_dist',
      'pl_rade',
      'pl_bmasse',
      'pl_orbsmax',
      'pl_orbper',
      'pl_orbeccen',
      'pl_insol',
      'pl_eqt',
      'st_teff',
      'st_rad',
      'st_mass',
      'st_lum',
      'gaia_dr3_id',
      'gaia_dr2_id',
    ]);
    expect((rows[0] as Record<string, unknown>).pl_name).toBe('Kepler-442 b');
  });

  it('ключи приводятся к нижнему регистру', () => {
    const rows = parseTapJson('[{"PL_NAME":"Kepler-442 b","HostName":"Kepler-442"}]');
    expect(rows[0]).toEqual({ pl_name: 'Kepler-442 b', hostname: 'Kepler-442' });
  });

  it('иная форма ответа даёт invalid_json', () => {
    expect(() => parseTapJson('{"foo":1}')).toThrow(SourceFetchError);
    try {
      parseTapJson('{"foo":1}');
    } catch (error: unknown) {
      expect((error as SourceFetchError).reason).toBe('invalid_json');
    }
  });
});

describe('тело TAP-запроса', () => {
  it('REQUEST, LANG, FORMAT, MAXREC и QUERY заполнены по умолчанию', async () => {
    const { fetchImpl, calls } = createSequenceFetch([{ body: '[{"a":1}]' }]);
    await tapQuery({ source: 'nasa', endpoint: ENDPOINT, query: QUERY, fetchImpl });

    const call = calls[0];
    expect(call?.request).toBe('doQuery');
    expect(call?.lang).toBe('ADQL');
    expect(call?.format).toBe('json');
    expect(call?.maxrec).toBe('1000000');
    expect(call?.query).toBe(QUERY);
  });
});

describe('ошибки и повторы TAP', () => {
  it('HTTP 429: успех на второй попытке', async () => {
    const { fetchImpl, calls } = createSequenceFetch([
      { status: 429 },
      { status: 200, body: '[{"pl_name":"Kepler-442 b"}]' },
    ]);

    const result = await tapQuery({
      source: 'nasa',
      endpoint: ENDPOINT,
      query: QUERY,
      fetchImpl,
      retryDelaysMs: [0, 0, 0],
      sleep: instantSleep,
    });

    expect(calls).toHaveLength(2);
    expect(result.rows).toHaveLength(1);
  });

  it('HTTP 503: не больше трёх попыток, затем http_5xx', async () => {
    const { fetchImpl, calls } = createSequenceFetch([{ status: 503 }]);

    const error = await tapQuery({
      source: 'nasa',
      endpoint: ENDPOINT,
      query: QUERY,
      fetchImpl,
      retryDelaysMs: [0, 0, 0],
      sleep: instantSleep,
    }).catch((reason: unknown) => reason);

    expect(calls).toHaveLength(3);
    expect(error).toBeInstanceOf(SourceFetchError);
    expect((error as SourceFetchError).reason).toBe('http_5xx');
  });

  it('HTTP 500: повторов нет', async () => {
    const { fetchImpl, calls } = createSequenceFetch([{ status: 500 }]);

    const error = await tapQuery({
      source: 'nasa',
      endpoint: ENDPOINT,
      query: QUERY,
      fetchImpl,
      retryDelaysMs: [0, 0, 0],
      sleep: instantSleep,
    }).catch((reason: unknown) => reason);

    expect(calls).toHaveLength(1);
    expect((error as SourceFetchError).reason).toBe('http_5xx');
  });

  it('HTTP 404 даёт http_4xx', async () => {
    const { fetchImpl } = createSequenceFetch([{ status: 404 }]);
    const error = await tapQuery({
      source: 'nasa',
      endpoint: ENDPOINT,
      query: QUERY,
      fetchImpl,
    }).catch((reason: unknown) => reason);

    expect((error as SourceFetchError).reason).toBe('http_4xx');
  });

  it('битый JSON даёт invalid_json', async () => {
    const { fetchImpl } = createSequenceFetch([{ status: 200, body: '{"pl_name": ' }]);
    const error = await tapQuery({
      source: 'nasa',
      endpoint: ENDPOINT,
      query: QUERY,
      fetchImpl,
    }).catch((reason: unknown) => reason);

    expect((error as SourceFetchError).reason).toBe('invalid_json');
  });

  it('пустой массив даёт empty', async () => {
    const { fetchImpl } = createSequenceFetch([{ status: 200, body: '[]' }]);
    const error = await tapQuery({
      source: 'nasa',
      endpoint: ENDPOINT,
      query: QUERY,
      fetchImpl,
    }).catch((reason: unknown) => reason);

    expect((error as SourceFetchError).reason).toBe('empty');
  });

  it('отмена по таймауту даёт timeout', async () => {
    const error = await tapQuery({
      source: 'nasa',
      endpoint: ENDPOINT,
      query: QUERY,
      fetchImpl: createHangingFetch(),
      timeoutMs: 5,
    }).catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(SourceFetchError);
    expect((error as SourceFetchError).reason).toBe('timeout');
  });

  it('ENOTFOUND даёт dns_error', async () => {
    const error = await tapQuery({
      source: 'nasa',
      endpoint: ENDPOINT,
      query: QUERY,
      fetchImpl: createFailingFetch('ENOTFOUND'),
    }).catch((reason: unknown) => reason);

    expect((error as SourceFetchError).reason).toBe('dns_error');
  });

  it('HTTP 400 на FORMAT=json: один повтор с FORMAT=application/json', async () => {
    const { fetchImpl, calls } = createSequenceFetch([
      { status: 400 },
      { status: 200, body: '[{"pl_name":"Kepler-442 b"}]' },
    ]);

    const result = await tapQuery({
      source: 'nasa',
      endpoint: ENDPOINT,
      query: QUERY,
      fetchImpl,
      retryDelaysMs: [0, 0, 0],
      sleep: instantSleep,
    });

    expect(calls).toHaveLength(2);
    expect(calls[0]?.format).toBe('json');
    expect(calls[1]?.format).toBe('application/json');
    expect(result.format).toBe('application/json');
    expect(result.warnings).toHaveLength(1);
  });
});

describe('разбор CSV-ответа TAP', () => {
  it('значения остаются строками, кавычки и переводы строк учтены', async () => {
    const { fetchImpl } = createSequenceFetch([{ status: 200, body: nasaCsv }]);

    const result = await tapQuery({
      source: 'nasa',
      endpoint: ENDPOINT,
      query: QUERY,
      format: 'csv',
      fetchImpl,
    });

    expect(result.rows).toHaveLength(2);
    const first = result.rows[0] as Record<string, unknown>;
    expect(first['pl_name']).toBe('Kepler-442 b');
    const second = result.rows[1] as Record<string, unknown>;
    expect(second['pl_name']).toBe('HD 209458, b');
    expect(second['hostname']).toBe('HD 209458\n(A)');
  });
});
