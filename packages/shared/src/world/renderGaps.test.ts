import { describe, expect, it } from 'vitest';

import { makeParam, nullParam } from '../physics/provenance';
import type { ResolvedPlanet, SolverFlags } from '../types/solver';
import type { ParamValue } from '../types/provenance';

import { renderGaps } from './renderGaps';

/**
 * Тесты пробелов данных для отрисовки (задача 19; п. 9.2).
 *
 * Списки ключей переиспользуются карточкой и 3D-сценой, поэтому проверяется
 * их состав и признаки заглушек.
 */

/** Флаги решателя по умолчанию. */
function flags(overrides: Partial<SolverFlags> = {}): SolverFlags {
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

/** Значение, если оно задано. */
function value(input: number | null): ParamValue {
  return input === null ? nullParam() : makeParam(input, 'measured');
}

/** Планета с заданными ключевыми параметрами. */
function planet(overrides: Partial<ResolvedPlanet> = {}): ResolvedPlanet {
  return {
    id: 'planet-1',
    R: value(1),
    M: value(1),
    e: value(0),
    d: value(1),
    P: value(365.25),
    S: value(1),
    T_eq: value(255),
    rho: value(5.51),
    L: value(1),
    st_teff: value(5772),
    st_rad: value(1),
    st_mass: value(1),
    dist_pc: value(10),
    ra: value(0),
    dec: value(0),
    flags: flags(),
    ...overrides,
  };
}

describe('renderGaps', () => {
  it('полные данные не дают пробелов', () => {
    expect(renderGaps(planet())).toEqual({
      planet: [],
      star: [],
      planetStub: false,
      starStub: false,
    });
  });

  it('без радиуса — ключ R и заглушка планеты', () => {
    const gaps = renderGaps(planet({ R: nullParam() }));

    expect(gaps.planet).toEqual(['R']);
    expect(gaps.planetStub).toBe(true);
  });

  it('без температуры — ключ T_eq', () => {
    expect(renderGaps(planet({ T_eq: nullParam() })).planet).toEqual(['T_eq']);
  });

  it('insufficient_data включает заглушку даже без пробелов', () => {
    const gaps = renderGaps(planet({ flags: flags({ insufficient_data: true }) }));

    expect(gaps.planet).toEqual([]);
    expect(gaps.planetStub).toBe(true);
  });

  it('без температуры звезды — st_teff и starStub', () => {
    const gaps = renderGaps(planet({ st_teff: nullParam() }));

    expect(gaps.star).toEqual(['st_teff']);
    expect(gaps.starStub).toBe(true);
  });

  it('L и st_rad отсутствуют одновременно — L_or_st_rad', () => {
    const gaps = renderGaps(planet({ L: nullParam(), st_rad: nullParam() }));

    expect(gaps.star).toEqual(['L_or_st_rad']);
    expect(gaps.starStub).toBe(true);
  });

  it('достаточно одного из L и st_rad — пробела нет', () => {
    expect(renderGaps(planet({ L: nullParam() })).star).toEqual([]);
    expect(renderGaps(planet({ st_rad: nullParam() })).star).toEqual([]);
  });
});
