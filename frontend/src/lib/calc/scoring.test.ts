// TEST FIXTURE: данные в этом файле используются только тестами.
import { describe, expect, it } from 'vitest';
import { mergeSources } from '../pipeline/merge';
import { buildRanking, qualityFor, scorePlanet, spectralClassOf, type ScoreOptions } from './scoring';
import type { Filters, PlanetEntity } from '@/types';
import type { Row } from '../sources/parser';

const NOW = '2026-11-14T00:00:00.000Z';

function row(name: string, host: string, letter: string, overrides: Row = {}): Row {
  return {
    pl_name: name,
    hostname: host,
    pl_letter: letter,
    pl_rade: 1,
    pl_bmasse: 1,
    pl_bmassprov: 'Mass',
    pl_orbper: 365,
    pl_orbsmax: 1,
    pl_orbeccen: 0,
    pl_insol: 1,
    st_teff: 5772,
    st_rad: 1,
    st_mass: 1,
    st_lum: 0,
    st_spectype: 'G2V',
    sy_dist: 10,
    ra: 10,
    dec: 10,
    ...overrides,
  };
}

function options(overrides: Partial<ScoreOptions> = {}): ScoreOptions {
  return {
    mode: 'adaptive',
    hzBound: 'conservative',
    penalizeRocky: true,
    penalizeEcc: true,
    penalizeStar: true,
    applyQData: true,
    ...overrides,
  };
}

const EMPTY_FILTERS: Filters = {
  spectral: [],
  radius: null,
  ts: null,
  ecc: null,
  includeCandidates: false,
};

function dataset(): PlanetEntity[] {
  const { entities } = mergeSources({
    nasa: [
      row('TRAPPIST-1 e', 'TRAPPIST-1', 'e', {
        pl_rade: 0.92,
        pl_bmasse: 0.772,
        pl_orbper: 6.0996,
        pl_orbsmax: 0.02925,
        pl_orbeccen: 0.005,
        pl_insol: 0.646,
        st_teff: 2566,
        st_rad: 0.1192,
        st_mass: 0.0898,
        st_lum: -3.2573,
        st_spectype: 'M8V',
        sy_dist: 12.47,
        ra: 346.6225,
        dec: -5.0414,
      }),
      row('Solar Twin b', 'Solar Twin', 'b'),
      row('Missing Mass c', 'Missing Mass', 'c', {
        pl_rade: 1.2,
        pl_bmasse: null,
        pl_orbeccen: 0.05,
      }),
    ],
    exomercat: [
      {
        exomercat_name: 'K2-999 c',
        host: 'K2-999',
        letter: 'c',
        status: 'candidate',
        p: 20,
        a: 0.15,
        r: 0.0892,
      },
    ],
    exoplanetEu: [],
    gaia: new Map(),
    simbad: new Map(),
    now: NOW,
  });
  return entities;
}

describe('scorePlanet', () => {
  it('считает адаптивный индекс и учитывает штрафы', () => {
    const entities = dataset();
    const trappist = entities.find((e) => e.names[0] === 'TRAPPIST-1 e')!;
    const score = scorePlanet(trappist, options());
    expect(score).not.toBeNull();
    expect(score!).toBeGreaterThan(0.5);
    expect(score!).toBeLessThan(0.9);
    expect(trappist.computed.pStar).toBe(0.85);
  });

  it('упрощённый ESI (R, S) не применяет штрафы и Q_data', () => {
    const entities = dataset();
    // Уровень Б: qDataBase = 0.90 — в формуле режима 3 он участвовать не должен.
    const missingMass = entities.find((e) => e.names[0] === 'Missing Mass c')!;
    expect(missingMass.computed.qDataBase).toBeCloseTo(0.9, 10);
    const classic = scorePlanet(missingMass, options({ mode: 'classic' }));
    const expected = Math.sqrt(
      (missingMass.computed.esiS ?? 0) * (missingMass.computed.esiR ?? 0),
    );
    expect(classic).toBeCloseTo(expected, 10);
  });

  it('строгий режим не применяет Q_data и штрафы', () => {
    const entities = dataset();
    const solar = entities.find((e) => e.names[0] === 'Solar Twin b')!;
    expect(solar.computed.esi4).not.toBeNull();
    expect(solar.computed.fHz).not.toBeNull();
    solar.computed.qDataBase = 0.75;
    const strict = scorePlanet(solar, options({ mode: 'strict' }));
    expect(strict).toBeCloseTo(Math.sqrt((solar.computed.esi4 ?? 0) * (solar.computed.fHz ?? 0)), 10);
  });

  it('строгий режим отказывает планете с вычисленной массой', () => {
    const entities = dataset();
    const missingMass = entities.find((e) => e.names[0] === 'Missing Mass c')!;
    expect(scorePlanet(missingMass, options({ mode: 'strict' }))).toBeNull();
    expect(scorePlanet(missingMass, options())).not.toBeNull();
  });

  it('k < 3 даёт 0.00 в адаптивном режиме и null в RHI', () => {
    const { entities } = mergeSources({
      nasa: [{ pl_name: 'Empty b', hostname: 'Empty', pl_letter: 'b' }],
      exomercat: [],
      exoplanetEu: [],
      gaia: new Map(),
      simbad: new Map(),
      now: NOW,
    });
    const empty = entities[0];
    expect(empty.computed.insufficientData).toBe(true);
    expect(scorePlanet(empty, options())).toBe(0);
    expect(scorePlanet(empty, options({ mode: 'rhi' }))).toBeNull();
  });

  it('k < 3 получает индекс 0.00, но не попадает в ранжирование и Топ-50', () => {
    const { entities } = mergeSources({
      nasa: [
        { pl_name: 'Empty b', hostname: 'Empty', pl_letter: 'b' },
        row('Solar Twin b', 'Solar Twin', 'b'),
      ],
      exomercat: [],
      exoplanetEu: [],
      gaia: new Map(),
      simbad: new Map(),
      now: NOW,
    });
    const empty = entities.find((e) => e.names[0] === 'Empty b')!;
    expect(scorePlanet(empty, options())).toBe(0);

    const ranking = buildRanking(entities, options(), EMPTY_FILTERS);
    expect(ranking.ranked.map((r) => r.entity.names[0])).not.toContain('Empty b');
    expect(ranking.top.map((r) => r.entity.names[0])).not.toContain('Empty b');
    expect(ranking.top[0].entity.names[0]).toBe('Solar Twin b');
  });

  it('Q_data фильтруется и вычисляется по режиму', () => {
    const entities = dataset();
    const missingMass = entities.find((e) => e.names[0] === 'Missing Mass c')!;
    expect(missingMass.computed.levelB).toBe(true);
    expect(qualityFor(missingMass, 'adaptive', 'conservative')).toBeCloseTo(0.9, 10);
    expect(qualityFor(missingMass, 'classic', 'conservative')).toBeCloseTo(0.9, 10);
    expect(qualityFor(missingMass, 'rhi', 'conservative')).toBeCloseTo(0.9, 10);
  });
});

describe('buildRanking', () => {
  it('сортирует по индексу и считает дельту к упрощённому ESI', () => {
    const entities = dataset();
    const ranking = buildRanking(entities, options(), EMPTY_FILTERS);
    expect(ranking.top.length).toBeGreaterThan(0);
    expect(ranking.top[0].rank).toBe(1);
    expect(ranking.top[0].entity.names[0]).toBe('TRAPPIST-1 e');
    expect(ranking.top[0].delta).not.toBeNull();
    for (let i = 1; i < ranking.top.length; i += 1) {
      const prev = ranking.top[i - 1];
      const next = ranking.top[i];
      expect((prev.score ?? 0) >= (next.score ?? 0)).toBe(true);
    }
  });

  it('по умолчанию скрывает кандидатов, но считает их в total', () => {
    const entities = dataset();
    const hidden = buildRanking(entities, options(), EMPTY_FILTERS);
    expect(hidden.total).toBe(entities.length);
    expect(hidden.top.some((r) => r.entity.status === 'candidate')).toBe(false);

    const shown = buildRanking(entities, options(), { ...EMPTY_FILTERS, includeCandidates: true });
    expect(shown.top.some((r) => r.entity.status === 'candidate')).toBe(true);
  });

  it('фильтрует по радиусу, T_s, эксцентриситету и классу', () => {
    const entities = dataset();
    const narrow = buildRanking(entities, options(), { ...EMPTY_FILTERS, radius: [0.95, 1.1] });
    expect(narrow.top.map((r) => r.entity.names[0])).toContain('Solar Twin b');
    expect(narrow.top.map((r) => r.entity.names[0])).not.toContain('TRAPPIST-1 e');

    const hot = buildRanking(entities, options(), { ...EMPTY_FILTERS, ts: [280, 300] });
    expect(hot.top.map((r) => r.entity.names[0])).toContain('Solar Twin b');
    expect(hot.top.map((r) => r.entity.names[0])).not.toContain('TRAPPIST-1 e');

    const mClass = buildRanking(entities, options(), { ...EMPTY_FILTERS, spectral: ['M'] });
    expect(mClass.top).toHaveLength(1);
    expect(mClass.top[0].entity.names[0]).toBe('TRAPPIST-1 e');

    const eccentric = buildRanking(entities, options(), { ...EMPTY_FILTERS, ecc: [0.1, 0.9] });
    expect(eccentric.top).toHaveLength(0);
  });

  it('фильтр по минимальному Q_data исключает уровень Б при пороге 95%', () => {
    const entities = dataset();
    const strictQ = buildRanking(entities, options(), EMPTY_FILTERS, 95);
    expect(strictQ.top.map((r) => r.entity.names[0])).not.toContain('Missing Mass c');

    const looseQ = buildRanking(entities, options(), EMPTY_FILTERS, 75);
    expect(looseQ.top.map((r) => r.entity.names[0])).toContain('Missing Mass c');
  });

  it('считает строгий режим только по измеренным полям', () => {
    const entities = dataset();
    const ranking = buildRanking(entities, options(), EMPTY_FILTERS);
    expect(ranking.strict).toBe(2);
  });
});

describe('числовая устойчивость', () => {
  it('по всей выборке нет NaN/Infinity в вычисленных значениях и индексах', () => {
    const { entities } = mergeSources({
      nasa: [
        row('Solar Twin b', 'Solar Twin', 'b'),
        row('Extreme R c', 'Extreme R', 'c', {
          pl_rade: 20,
          pl_bmasse: null,
          pl_insol: null,
          pl_orbeccen: 0.999,
        }),
        row('Extreme M d', 'Extreme M', 'd', {
          pl_rade: null,
          pl_bmasse: 200,
          pl_insol: null,
        }),
        row('Cold e', 'Cold', 'e', {
          st_teff: 1000,
          st_rad: 0.01,
          pl_insol: 0,
        }),
        row('Broken f', 'Broken', 'f', {
          pl_rade: 'NaN',
          pl_bmasse: '',
          st_teff: 'oops',
          st_rad: null,
          sy_dist: 0,
          ra: null,
          dec: null,
        }),
      ],
      exomercat: [],
      exoplanetEu: [],
      gaia: new Map(),
      simbad: new Map(),
      now: NOW,
    });

    for (const entity of entities) {
      for (const [key, value] of Object.entries(entity.computed)) {
        if (typeof value === 'number') {
          expect(Number.isFinite(value), `${entity.names[0]}.${key} = ${value}`).toBe(true);
        }
      }
      for (const mode of ['adaptive', 'rhi', 'classic', 'strict'] as const) {
        const score = scorePlanet(entity, options({ mode }));
        if (score !== null) {
          expect(Number.isFinite(score), `${entity.names[0]} · ${mode}`).toBe(true);
        }
      }
    }
  });
});

describe('spectralClassOf', () => {
  it('берёт класс из спектрального типа или температуры', () => {
    const entities = dataset();
    const trappist = entities.find((e) => e.names[0] === 'TRAPPIST-1 e')!;
    expect(spectralClassOf(trappist)).toBe('M');
  });

  it('возвращает null без данных', () => {
    const { entities } = mergeSources({
      nasa: [{ pl_name: 'No Data b', hostname: 'No Data', pl_letter: 'b' }],
      exomercat: [],
      exoplanetEu: [],
      gaia: new Map(),
      simbad: new Map(),
      now: NOW,
    });
    expect(spectralClassOf(entities[0])).toBeNull();
  });
});
