import { describe, expect, it } from 'vitest';

import { DEFAULT_FILTERS, DEFAULT_SETTINGS, type ModelSettings } from '../types/settings';
import type { ResolvedPlanet, SolverFlags } from '../types/solver';
import type { PlanetRecord, RawParamKey } from '../types/planet';
import type { ParamValue } from '../types/provenance';

import { makeParam, nullParam } from '../physics/provenance';
import { solvePlanet } from '../physics/solver';

import { computeEsiInterior, computeSubindices, esiParam } from './esi';
import { computeHz } from './hz';
import { computeScore, indexAdaptive, indexClassicEsi, indexRHI, indexStrict } from './indexes';
import { computePenalties, penaltyEcc, penaltyRocky, penaltyStar } from './penalties';
import { computeQData } from './quality';

const measured = (value: number | null): ParamValue => makeParam(value, 'measured');

function makeFlags(overrides: Partial<SolverFlags> = {}): SolverFlags {
  return {
    insufficient_data: false,
    levelB_mass: false,
    levelB_radius: false,
    e_assumed_zero: false,
    excluded_subindices: [],
    k: 4,
    n: 4,
    strict_complete: false,
    available: {
      ESI_R: true,
      ESI_rho: true,
      ESI_ve: true,
      ESI_S: true,
      ESI_T: true,
      F_HZ: true,
    },
    ...overrides,
  };
}

/** Планета с заданными значениями — для граничных случаев индекса. */
function makePlanet(overrides: Partial<ResolvedPlanet> = {}): ResolvedPlanet {
  return {
    id: 'planet-1',
    R: nullParam(),
    M: nullParam(),
    e: nullParam(),
    d: nullParam(),
    P: nullParam(),
    S: nullParam(),
    T_eq: nullParam(),
    rho: nullParam(),
    L: nullParam(),
    st_teff: nullParam(),
    st_rad: nullParam(),
    st_mass: nullParam(),
    dist_pc: nullParam(),
    ra: nullParam(),
    dec: nullParam(),
    flags: makeFlags(),
    ...overrides,
  };
}

function rawParams(
  overrides: Partial<Record<RawParamKey, ParamValue>> = {},
): Record<RawParamKey, ParamValue> {
  const base: Record<RawParamKey, ParamValue> = {
    pl_rade: nullParam(),
    pl_bmasse: nullParam(),
    pl_orbsmax: nullParam(),
    pl_orbper: nullParam(),
    pl_orbeccen: nullParam(),
    pl_insol: nullParam(),
    pl_eqt: nullParam(),
    st_teff: nullParam(),
    st_rad: nullParam(),
    st_mass: nullParam(),
    st_lum: nullParam(),
    sy_dist: nullParam(),
    ra: nullParam(),
    dec: nullParam(),
  };

  return { ...base, ...overrides };
}

function makeRecord(overrides: Partial<Record<RawParamKey, ParamValue>> = {}): PlanetRecord {
  return {
    id: 'earth-like',
    name: 'Earth-like b',
    aliases: [],
    hostname: 'Sun-like',
    letter: 'b',
    sources: ['nasa'],
    params: rawParams(overrides),
  };
}

/** Землеподобная запись: R = 1, M = 1, P = 365.25, e = 0.0167, L = 1. */
const EARTH_RECORD = {
  pl_rade: measured(1),
  pl_bmasse: measured(1),
  pl_insol: measured(1),
  pl_orbper: measured(365.25),
  pl_orbeccen: measured(0.0167),
  st_rad: measured(1),
  st_teff: measured(5772),
  st_mass: measured(1),
};

const OPTIMISTIC: ModelSettings = { ...DEFAULT_SETTINGS, hzBounds: 'optimistic' };

describe('субиндекс ESI', () => {
  it('esiParam(2, 1, 1) = 0.6667 (допуск 1e-4)', () => {
    expect(Math.abs((esiParam(2, 1, 1) as number) - 0.6667)).toBeLessThan(1e-4);
  });

  it('ESI_R при R = 2 равен 0.7937 (допуск 1e-4)', () => {
    const values = computeSubindices(makePlanet({ R: measured(2) }));

    // Точное значение (2/3)^0.57 = 0.793648…, в ТЗ приведено округлённо.
    expect(Math.abs((values.ESI_R as number) - 0.7937)).toBeLessThan(1e-4);
  });

  it('неположительное и отсутствующее значение дают null', () => {
    expect(esiParam(0, 1, 0.57)).toBeNull();
    expect(esiParam(-1, 1, 0.57)).toBeNull();
    expect(esiParam(null, 1, 0.57)).toBeNull();
    expect(esiParam(Number.NaN, 1, 0.57)).toBeNull();
  });

  it('для Земли все субиндексы равны единице', () => {
    const planet = solvePlanet(makeRecord(EARTH_RECORD));
    const values = computeSubindices(planet);

    expect(values.ESI_R).toBeCloseTo(1, 12);
    expect(values.ESI_rho).toBeCloseTo(1, 12);
    expect(values.ESI_ve).toBeCloseTo(1, 12);
    expect(values.ESI_S).toBeCloseTo(1, 12);
    expect(values.ESI_T).toBeCloseTo(1, 12);
    expect(computeEsiInterior(values)).toBeCloseTo(1, 12);
    expect(values.v_e).toBeCloseTo(1, 12);
    expect(values.T_s).toBeCloseTo(288, 12);
  });
});

describe('зона обитаемости', () => {
  it('оптимистичные границы при st_teff = 5780, L = 1', () => {
    const hz = computeHz({ st_teff: 5780, L: 1, d: 1, e: 0, bounds: 'optimistic' });

    expect(hz.d_in).toBeCloseTo(0.7504, 3);
    expect(hz.d_out).toBeCloseTo(1.7678, 3);
  });

  it('консервативные границы при st_teff = 5780, L = 1', () => {
    const hz = computeHz({ st_teff: 5780, L: 1, d: 1, e: 0, bounds: 'conservative' });

    expect(hz.d_in).toBeCloseTo(0.9504, 3);
    expect(hz.d_out).toBeCloseTo(1.676, 3);
  });

  it('калибровка Земли: F_HZ ≈ 0.74 на оптимистичных границах (U11)', () => {
    const hz = computeHz({ st_teff: 5772, L: 1, d: 1, e: 0.0167, bounds: 'optimistic' });

    expect(hz.F_HZ).toBeCloseTo(0.74, 2);
  });

  it('калибровка Земли: F_HZ ≈ 0.25 на консервативных границах', () => {
    const hz = computeHz({ st_teff: 5772, L: 1, d: 1, e: 0.0167, bounds: 'conservative' });

    expect(hz.F_HZ).toBeCloseTo(0.25, 2);
  });

  it('в середине зоны F_HZ = 1', () => {
    const bounds = computeHz({ st_teff: 5780, L: 1, d: 1, e: 0, bounds: 'optimistic' });
    const middle = ((bounds.d_in as number) + (bounds.d_out as number)) / 2;

    const hz = computeHz({ st_teff: 5780, L: 1, d: middle, e: 0, bounds: 'optimistic' });

    expect(hz.F_HZ).toBeCloseTo(1, 9);
    expect(hz.HZD).toBeCloseTo(0, 9);
  });

  it('внутри внутренней границы F_HZ = 0', () => {
    const bounds = computeHz({ st_teff: 5780, L: 1, d: 1, e: 0, bounds: 'optimistic' });

    const hz = computeHz({
      st_teff: 5780,
      L: 1,
      d: bounds.d_in as number,
      e: 0,
      bounds: 'optimistic',
    });

    expect(hz.F_HZ).toBeCloseTo(0, 9);
  });

  it('далеко за внешней границей F_HZ = 0', () => {
    const bounds = computeHz({ st_teff: 5780, L: 1, d: 1, e: 0, bounds: 'optimistic' });

    const hz = computeHz({
      st_teff: 5780,
      L: 1,
      d: (bounds.d_out as number) * 2,
      e: 0,
      bounds: 'optimistic',
    });

    expect(hz.F_HZ).toBeCloseTo(0, 9);
  });

  it('неполные данные дают null во всех полях', () => {
    const hz = computeHz({ st_teff: null, L: 1, d: 1, e: 0, bounds: 'optimistic' });

    expect(hz.F_HZ).toBeNull();
    expect(hz.HZD).toBeNull();
    expect(hz.d_in).toBeNull();
    expect(hz.d_out).toBeNull();
    expect(hz.d_eff).toBeNull();
  });
});

describe('штрафы', () => {
  it('P_rocky: 1.65 → 0.5, 1.0 → 0.9627, 2.5 → 0.0141', () => {
    expect(penaltyRocky(1.65)).toBeCloseTo(0.5, 9);
    expect(penaltyRocky(1)).toBeCloseTo(0.9627, 3);
    expect(penaltyRocky(2.5)).toBeCloseTo(0.0141, 3);
  });

  it('P_ecc(0.5) = 0.75', () => {
    expect(penaltyEcc(0.5)).toBeCloseTo(0.75, 9);
  });

  it('P_star: 3500 → 0.85, 3900 → 1.00', () => {
    expect(penaltyStar(3500)).toBe(0.85);
    expect(penaltyStar(3900)).toBe(1.0);
  });

  it('отсутствующий параметр даёт штраф 1', () => {
    expect(penaltyRocky(null)).toBe(1);
    expect(penaltyEcc(null)).toBe(1);
    expect(penaltyStar(null)).toBe(1);
  });

  it('выключенный чекбокс даёт множитель 1', () => {
    const planet = makePlanet({ R: measured(2.5), e: measured(0.5), st_teff: measured(3000) });

    const off = computePenalties(planet, {
      ...DEFAULT_SETTINGS,
      penalties: { rocky: false, ecc: false, star: false, qdata: true },
    });
    const on = computePenalties(planet, DEFAULT_SETTINGS);

    expect(off.P_rocky).toBe(1);
    expect(off.P_ecc).toBe(1);
    expect(off.P_star).toBe(1);
    expect(on.P_rocky).toBeLessThan(1);
    expect(on.P_ecc).toBeLessThan(1);
    expect(on.P_star).toBe(0.85);
  });
});

describe('достоверность Q_data', () => {
  const flags = (overrides: Partial<SolverFlags> = {}): SolverFlags => makeFlags(overrides);

  it('без штрафов Q_data = 1.00', () => {
    expect(computeQData({ flags: flags(), P: 365.25, nullSubindices: [] })).toBe(1);
  });

  it('восстановление по модели Чен — Киппинг даёт 0.90', () => {
    expect(
      computeQData({
        flags: flags({ levelB_mass: true }),
        P: 365.25,
        nullSubindices: [],
      }),
    ).toBeCloseTo(0.9, 9);
  });

  it('принятый нулевой эксцентриситет без периода даёт 0.85', () => {
    expect(
      computeQData({
        flags: flags({ levelB_mass: true, e_assumed_zero: true }),
        P: null,
        nullSubindices: [],
      }),
    ).toBeCloseTo(0.85, 9);
  });

  it('при периоде 4 сут штраф за нулевой эксцентриситет не применяется', () => {
    expect(
      computeQData({
        flags: flags({ levelB_mass: true, e_assumed_zero: true }),
        P: 4,
        nullSubindices: [],
      }),
    ).toBeCloseTo(0.9, 9);
  });

  it('два исключённых субиндекса дают 0.75', () => {
    expect(
      computeQData({
        flags: flags({ levelB_mass: true, e_assumed_zero: true }),
        P: null,
        nullSubindices: ['F_HZ', 'ESI_rho'],
      }),
    ).toBeCloseTo(0.75, 9);
  });

  it('четыре исключённых субиндекса без других штрафов дают 0.80', () => {
    expect(
      computeQData({
        flags: flags(),
        P: 365.25,
        nullSubindices: ['ESI_R', 'ESI_rho', 'ESI_ve', 'F_HZ'],
      }),
    ).toBeCloseTo(0.8, 9);
  });

  it('пол Q_data = 0.75 достигается при совокупности штрафов', () => {
    expect(
      computeQData({
        flags: flags({ levelB_mass: true, e_assumed_zero: true }),
        P: null,
        nullSubindices: ['ESI_R', 'ESI_rho', 'ESI_ve', 'F_HZ'],
      }),
    ).toBeCloseTo(0.75, 9);
  });
});

describe('итоговые индексы', () => {
  const earth = solvePlanet(makeRecord(EARTH_RECORD));

  it('Земля на оптимистичных границах: RHI ≈ 0.83, adaptive ≈ 0.89', () => {
    const rhi = indexRHI(earth, OPTIMISTIC);
    const adaptive = indexAdaptive(earth, OPTIMISTIC);

    expect(rhi.index).toBeCloseTo(0.83, 2);
    expect(adaptive.index).toBeCloseTo(0.89, 2);
    expect(adaptive.k).toBe(4);
    expect(adaptive.n).toBe(4);
    expect(adaptive.insufficient_data).toBe(false);
    expect(adaptive.Q_data).toBe(1);
  });

  it('без звёздных данных: F_HZ недоступен, k = 3, Q_data = 0.95', () => {
    const withoutStar = solvePlanet(makeRecord({ ...EARTH_RECORD, st_teff: nullParam() }));
    const adaptive = indexAdaptive(withoutStar, OPTIMISTIC);

    expect(adaptive.F_HZ).toBeNull();
    expect(adaptive.k).toBe(3);
    expect(adaptive.Q_data).toBeCloseTo(0.95, 9);
    expect(adaptive.index).toBeCloseTo(0.914, 3);
  });

  it('k = 2 даёт индекс 0 и insufficient_data = true', () => {
    const planet = makePlanet({
      R: measured(1),
      st_teff: measured(5772),
      L: measured(1),
      d: measured(1),
    });

    const adaptive = indexAdaptive(planet, OPTIMISTIC);

    expect(adaptive.k).toBe(2);
    expect(adaptive.index).toBe(0);
    expect(adaptive.insufficient_data).toBe(true);
  });

  it('выключенный qdata убирает Q_data из индекса, но значение остаётся в разложении', () => {
    const withoutStar = solvePlanet(makeRecord({ ...EARTH_RECORD, st_teff: nullParam() }));

    const withQ = indexAdaptive(withoutStar, OPTIMISTIC);
    const withoutQ = indexAdaptive(withoutStar, {
      ...OPTIMISTIC,
      penalties: { ...OPTIMISTIC.penalties, qdata: false },
    });

    expect(withQ.Q_data).toBeCloseTo(0.95, 9);
    expect(withoutQ.Q_data).toBeCloseTo(0.95, 9);
    expect(withoutQ.index).toBeCloseTo((withQ.index as number) / 0.95, 9);
  });

  it('строгий режим не применяется к неполной записи', () => {
    const strict = indexStrict(earth, OPTIMISTIC);

    expect(strict.index).toBeNull();
  });

  it('строгий режим работает для полной измеренной записи', () => {
    const full = solvePlanet(
      makeRecord({
        ...EARTH_RECORD,
        pl_orbsmax: measured(1),
        st_lum: measured(0),
      }),
    );

    const strict = indexStrict(full, OPTIMISTIC);

    expect(full.flags.strict_complete).toBe(true);
    expect(strict.index).toBeCloseTo(0.86, 2);
  });

  it('упрощённый ESI считает только R и S', () => {
    const classic = indexClassicEsi(earth, OPTIMISTIC);

    expect(classic.index).toBeCloseTo(1, 9);
    expect(classic.ESI_interior).toBeCloseTo(1, 9);
  });

  it('RHI без F_HZ не оценивает планету (U20)', () => {
    const withoutStar = solvePlanet(makeRecord({ ...EARTH_RECORD, st_teff: nullParam() }));

    expect(indexRHI(withoutStar, OPTIMISTIC).index).toBeNull();
  });

  it('computeScore выбирает режим', () => {
    expect(computeScore('adaptive', earth, OPTIMISTIC).mode).toBe('adaptive');
    expect(computeScore('rhi', earth, OPTIMISTIC).mode).toBe('rhi');
    expect(computeScore('classic_esi', earth, OPTIMISTIC).mode).toBe('classic_esi');
    expect(computeScore('strict', earth, OPTIMISTIC).mode).toBe('strict');
  });

  it('разложение содержит все множители для таблицы «Декомпозиция балла»', () => {
    const score = indexAdaptive(earth, OPTIMISTIC);

    expect(score.ESI_R).not.toBeUndefined();
    expect(score.ESI_rho).not.toBeUndefined();
    expect(score.ESI_ve).not.toBeUndefined();
    expect(score.ESI_S).not.toBeUndefined();
    expect(score.ESI_T).not.toBeUndefined();
    expect(score.ESI_interior).not.toBeUndefined();
    expect(score.F_HZ).not.toBeUndefined();
    expect(score.HZD).not.toBeUndefined();
    expect(score.P_rocky).not.toBeUndefined();
    expect(score.P_ecc).not.toBeUndefined();
    expect(score.P_star).not.toBeUndefined();
    expect(score.Q_data).not.toBeUndefined();
    expect(score.index).not.toBeUndefined();
    expect(score.k).toBe(4);
    expect(score.n).toBe(4);
    expect(score.insufficient_data).toBe(false);
    expect(score.T_s).toBeCloseTo(288, 12);
    expect(score.v_e).toBeCloseTo(1, 12);
  });
});

describe('устойчивость к плохим данным', () => {
  it('функции не бросают исключений и не возвращают NaN/Infinity', () => {
    const bad: Array<number | null> = [null, Number.NaN, 0, -1, Number.POSITIVE_INFINITY];

    for (const value of bad) {
      const planet = makePlanet({
        R: makeParam(value, 'measured'),
        M: makeParam(value, 'measured'),
        e: makeParam(value, 'measured'),
        d: makeParam(value, 'measured'),
        S: makeParam(value, 'measured'),
        T_eq: makeParam(value, 'measured'),
        rho: makeParam(value, 'measured'),
        L: makeParam(value, 'measured'),
        st_teff: makeParam(value, 'measured'),
        P: makeParam(value, 'measured'),
      });

      for (const mode of ['adaptive', 'rhi', 'classic_esi', 'strict'] as const) {
        const score = computeScore(mode, planet, DEFAULT_SETTINGS);
        const values = [
          score.ESI_R,
          score.ESI_rho,
          score.ESI_ve,
          score.ESI_S,
          score.ESI_T,
          score.ESI_interior,
          score.F_HZ,
          score.HZD,
          score.index,
        ];

        for (const item of values) {
          expect(item === null || Number.isFinite(item)).toBe(true);
        }
      }
    }
  });

  it('фильтры по умолчанию не влияют на расчёт индексов', () => {
    expect(DEFAULT_FILTERS.spectralClasses).toEqual([]);
  });
});
