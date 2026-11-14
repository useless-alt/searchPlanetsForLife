import { describe, expect, it } from 'vitest';

import type { SourceId, SourceRecord, StarRecord } from '@exo/shared';

import { mergeCatalog } from './mergeCatalog';
import { normalizeLetter, normalizeName } from './normalize';

const FETCHED_AT = '2026-11-14T10:00:00.000Z';
const GAIA_FETCHED_AT = '2026-11-14T11:00:00.000Z';

function rec(
  source: SourceId,
  planetName: string,
  overrides: Partial<SourceRecord> = {},
): SourceRecord {
  return {
    source,
    fetchedAt: FETCHED_AT,
    fromBackup: false,
    planetName,
    aliases: [],
    hostname: null,
    letter: null,
    hostAliases: [],
    ra: null,
    dec: null,
    params: {},
    extra: {},
    ...overrides,
  };
}

function star(source: 'gaia' | 'simbad', overrides: Partial<StarRecord> = {}): StarRecord {
  return {
    source,
    fetchedAt: GAIA_FETCHED_AT,
    fromBackup: false,
    key: {},
    mainId: null,
    aliases: [],
    ra: null,
    dec: null,
    params: {},
    extra: {},
    ...overrides,
  };
}

function merge(planets: SourceRecord[], stars: StarRecord[] = []) {
  return mergeCatalog({ planets, stars });
}

const TWO_ARCSEC_DEG = 2 / 3600;

describe('нормализация имён', () => {
  it('удаляет диакритику, префиксы SIMBAD и заменяет греческие буквы', () => {
    expect(normalizeName('Café')).toBe('cafe');
    expect(normalizeName('V* VY CMa')).toBe('vycma');
    expect(normalizeName('NAME Betelgeuse')).toBe('betelgeuse');
    expect(normalizeName('** V* NAME α Centauri')).toBe('alphacentauri');
    expect(normalizeName('***')).toBeNull();
    expect(normalizeLetter(' B ')).toBe('b');
    expect(normalizeLetter('—')).toBeNull();
  });
});

describe('правила дедупликации R1–R4', () => {
  it('сливает Kepler-289 b из трёх каталогов в одну запись', () => {
    const result = merge([
      rec('nasa', 'Kepler-289 b'),
      rec('exoplanet_eu', 'Kepler-289 b', { aliases: ['KOI-289.01'] }),
      rec('exomercat', 'KOI-289.01', { aliases: ['Kepler-289 b'] }),
    ]);

    expect(result.planets).toHaveLength(1);
    expect(result.planets[0]?.sources).toEqual(['nasa', 'exoplanet_eu', 'exomercat']);
    expect(result.planets[0]?.name).toBe('Kepler-289 b');
    expect(result.planets[0]?.id).toBe('kepler-289-b');
    expect(result.stats.uniquePlanets).toBe(result.planets.length);
  });

  it('нормализует варианты TRAPPIST-1 d по R1', () => {
    const result = merge([
      rec('nasa', 'TRAPPIST-1 d'),
      rec('exoplanet_eu', 'TRAPPIST-1d'),
      rec('exomercat', 'Trappist-1 d'),
    ]);

    expect(result.planets).toHaveLength(1);
    expect(result.stats.ruleCounts.R1).toBeGreaterThan(0);
  });

  it('не сливает Kepler-289 b и Kepler-289 c', () => {
    const result = merge([
      rec('nasa', 'Kepler-289 b', { hostname: 'Kepler-289', letter: 'b' }),
      rec('nasa', 'Kepler-289 c', { hostname: 'Kepler-289', letter: 'c' }),
    ]);

    expect(result.planets).toHaveLength(2);
    expect(result.planets.map((planet) => planet.name)).toEqual(['Kepler-289 b', 'Kepler-289 c']);
  });

  it('строит мост GJ 1214 b ↔ Gliese 1214 b через алиасы SIMBAD по R2', () => {
    const result = merge(
      [
        rec('nasa', 'GJ 1214 b', { hostname: 'GJ 1214', letter: 'b' }),
        rec('exoplanet_eu', 'Gliese 1214 b', { hostname: 'Gliese 1214', letter: 'b' }),
      ],
      [
        star('simbad', {
          key: { hostQuery: 'GJ 1214' },
          mainId: 'Gliese 1214',
          aliases: ['GJ 1214', 'Gliese 1214'],
        }),
      ],
    );

    expect(result.planets).toHaveLength(1);
    expect(result.planets[0]?.sources).toContain('simbad');
    expect(result.planets[0]?.hostAliases).toContain('Gliese 1214');
    expect(result.stats.ruleCounts.R2).toBe(1);
  });

  it('сливает разные имена на расстоянии 2″ при совпадающей букве по R3', () => {
    const result = merge([
      rec('nasa', 'A b', { letter: 'b', ra: 10, dec: 20 }),
      rec('exoplanet_eu', 'B b', { letter: 'b', ra: 10, dec: 20 + TWO_ARCSEC_DEG }),
    ]);

    expect(result.planets).toHaveLength(1);
    expect(result.stats.ruleCounts.R3).toBe(1);
  });

  it('не сливает записи на расстоянии 30″', () => {
    const result = merge([
      rec('nasa', 'A b', { letter: 'b', ra: 10, dec: 20 }),
      rec('exoplanet_eu', 'B b', { letter: 'b', ra: 10, dec: 20 + 30 / 3600 }),
    ]);

    expect(result.planets).toHaveLength(2);
  });

  it('применяет вето R3 при периодах 10 и 12 суток', () => {
    const result = merge([
      rec('nasa', 'A b', { letter: 'b', ra: 10, dec: 20, params: { pl_orbper: 10 } }),
      rec('exoplanet_eu', 'B b', {
        letter: 'b',
        ra: 10,
        dec: 20 + TWO_ARCSEC_DEG,
        params: { pl_orbper: 12 },
      }),
    ]);

    expect(result.planets).toHaveLength(2);
    expect(result.stats.vetoed).toBe(1);
  });

  it('сливает записи без одной буквы при близких периодах по R4', () => {
    const result = merge([
      rec('nasa', 'A', { ra: 10, dec: 20, params: { pl_orbper: 10 } }),
      rec('exoplanet_eu', 'B b', {
        letter: 'b',
        ra: 10,
        dec: 20 + TWO_ARCSEC_DEG,
        params: { pl_orbper: 10.05 },
      }),
    ]);

    expect(result.planets).toHaveLength(1);
    expect(result.planets[0]?.letter).toBe('b');
    expect(result.stats.ruleCounts.R4).toBe(1);
  });

  it('не сливает по R4 при периодах 10.0 и 10.5', () => {
    const result = merge([
      rec('nasa', 'A', { ra: 10, dec: 20, params: { pl_orbper: 10 } }),
      rec('exoplanet_eu', 'B', {
        ra: 10,
        dec: 20 + TWO_ARCSEC_DEG,
        params: { pl_orbper: 10.5 },
      }),
    ]);

    expect(result.planets).toHaveLength(2);
  });

  it('использует большую полуось в R4, если оба периода неизвестны', () => {
    const result = merge([
      rec('nasa', 'A', { ra: 10, dec: 20, params: { pl_orbsmax: 1 } }),
      rec('exoplanet_eu', 'B', {
        ra: 10,
        dec: 20 + TWO_ARCSEC_DEG,
        params: { pl_orbsmax: 1.01 },
      }),
    ]);

    expect(result.planets).toHaveLength(1);
  });

  it('учитывает переход RA через 0°/360°', () => {
    const result = merge([
      rec('nasa', 'A b', { letter: 'b', ra: 359.9999, dec: 0 }),
      rec('exoplanet_eu', 'B b', { letter: 'b', ra: 0.0001, dec: 0 }),
    ]);

    expect(result.planets).toHaveLength(1);
  });

  it('отклоняет ошибочный алиас Exo-MerCat ограничением уникальности', () => {
    const result = merge([
      rec('nasa', 'Kepler-289 b'),
      rec('nasa', 'Kepler-289 c'),
      rec('exomercat', 'Kepler-289 MC', {
        aliases: ['Kepler-289 b', 'Kepler-289 c'],
      }),
    ]);

    expect(result.planets).toHaveLength(2);
    expect(result.stats.rejectedUnions).toBe(1);
    expect(
      result.planets.some((planet) => planet.warnings.some((w) => w.includes('уникальности'))),
    ).toBe(true);
  });
});

describe('слияние полей и статистика', () => {
  it('отдаёт st_teff Gaia приоритет над NASA и не хранит равные alternatives', () => {
    const result = merge(
      [
        rec('nasa', 'Priority b', {
          params: { st_teff: 5100 },
          extra: { gaiaDr3Id: '1234567890123456789' },
        }),
        rec('exoplanet_eu', 'Priority b', { params: { st_teff: 5000 } }),
      ],
      [
        star('gaia', {
          key: { gaiaDr3Id: '1234567890123456789' },
          params: { st_teff: 5000 },
        }),
      ],
    );

    const teff = result.planets[0]?.params.st_teff;
    expect(teff?.value).toBe(5000);
    expect(teff?.source).toBe('gaia');
    expect(teff?.sourceDate).toBe(GAIA_FETCHED_AT);
    expect(teff?.alternatives).toEqual([{ source: 'nasa', value: 5100, sourceDate: FETCHED_AT }]);
  });

  it('выбирает NASA, если у Gaia значение отсутствует', () => {
    const result = merge(
      [
        rec('nasa', 'Priority b', {
          params: { st_teff: 5100 },
          extra: { gaiaDr3Id: '123' },
        }),
      ],
      [star('gaia', { key: { gaiaDr3Id: '123' }, params: {} })],
    );

    expect(result.planets[0]?.params.st_teff.value).toBe(5100);
    expect(result.planets[0]?.params.st_teff.source).toBe('nasa');
    expect(result.planets[0]?.params.st_teff.alternatives).toEqual([]);
  });

  it('выбирает основную запись источника по числу params и считает дубли', () => {
    const result = merge([
      rec('nasa', 'Same b', { params: { pl_rade: 1 } }),
      rec('nasa', 'Same b', { params: { pl_rade: 1.1, pl_bmasse: 2 } }),
    ]);

    expect(result.planets).toHaveLength(1);
    expect(result.stats.sameSourceDuplicates).toBe(1);
    expect(result.planets[0]?.params.pl_rade.value).toBe(1.1);
    expect(result.planets[0]?.params.pl_rade.alternatives).toEqual([
      { source: 'nasa', value: 1, sourceDate: FETCHED_AT },
    ]);
    expect(
      result.planets[0]?.warnings.some((warning) => warning.includes('несколько записей')),
    ).toBe(true);
  });

  it('сохраняет measured, источник, дату и fromBackup в ParamValue', () => {
    const backupDate = '2026-11-13T09:00:00.000Z';
    const result = merge([
      rec('nasa', 'Backup b', {
        fetchedAt: backupDate,
        fromBackup: true,
        params: { pl_rade: 1.2 },
      }),
    ]);

    expect(result.planets[0]?.params.pl_rade).toMatchObject({
      value: 1.2,
      provenance: 'measured',
      source: 'nasa',
      sourceDate: backupDate,
      fromBackup: true,
    });
    for (const param of Object.values(result.planets[0]?.params ?? {})) {
      if (param.value !== null) {
        expect(param.source).not.toBeNull();
        expect(param.sourceDate).not.toBeNull();
      }
    }
    expect(result.stats.recordsBySource.nasa).toBe(1);
  });
});

describe('детерминизм и идентификаторы', () => {
  it('даёт идентичный результат при перемешивании входа и повторном запуске', () => {
    const planets = [
      rec('nasa', 'Stable A b', {
        hostname: 'Stable A',
        letter: 'b',
        ra: 10,
        dec: 10,
        params: { pl_rade: 1, st_teff: 5100 },
        extra: { gaiaDr3Id: '42' },
      }),
      rec('exoplanet_eu', 'Stable A b', {
        hostname: 'Stable A',
        letter: 'b',
        ra: 10,
        dec: 10 + TWO_ARCSEC_DEG,
        params: { pl_rade: 1.01, st_teff: 5000 },
      }),
      rec('exomercat', 'Stable B c', { hostname: 'Stable B', letter: 'c' }),
      rec('nasa', 'Stable B c', { hostname: 'Stable B', letter: 'c' }),
    ];
    const stars = [
      star('simbad', {
        key: { hostQuery: 'Stable A' },
        mainId: 'Stable A alias',
        aliases: ['Stable A'],
      }),
      star('gaia', { key: { gaiaDr3Id: '42' }, params: { st_teff: 5000 } }),
    ];

    const first = merge(planets, stars);
    const shuffled = merge([...planets].reverse(), [...stars].reverse());
    const repeated = merge(planets, stars);

    expect(shuffled).toEqual(first);
    expect(repeated.planets.map((planet) => planet.id)).toEqual(
      first.planets.map((planet) => planet.id),
    );
  });

  it('разрешает коллизию slug суффиксом -2 в детерминированном порядке (U30)', () => {
    const result = merge([
      rec('nasa', 'Foo Bar', { aliases: ['AAA'] }),
      rec('nasa', 'Foo-Bar', { aliases: ['AAB'] }),
      rec('exomercat', 'X', { aliases: ['AAA'] }),
      rec('exomercat', 'Y', { aliases: ['AAB'] }),
    ]);

    expect(result.planets).toHaveLength(2);
    expect(result.planets.map((planet) => planet.id)).toEqual(['foo-bar', 'foo-bar-2']);
    expect(result.stats.rejectedUnions).toBe(1);
  });

  it('обрабатывает 20 000 записей быстрее 2 секунд', () => {
    const planets = Array.from({ length: 20_000 }, (_, index) =>
      rec(index % 2 === 0 ? 'nasa' : 'exoplanet_eu', `Perf ${index}`, {
        hostname: `Perf Host ${index}`,
        ra: (index * 0.137) % 360,
        dec: -60 + ((index * 0.071) % 120),
        params: { pl_rade: 1 + (index % 10) / 10 },
      }),
    );

    const started = performance.now();
    const result = merge(planets);
    const elapsed = performance.now() - started;

    expect(result.planets).toHaveLength(20_000);
    expect(result.stats.uniquePlanets).toBe(result.planets.length);
    expect(elapsed).toBeLessThan(2000);
  });
});
