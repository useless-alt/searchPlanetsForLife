import { describe, expect, it } from 'vitest';

import { makeParam, nullParam } from '../physics/provenance';
import type { ResolvedPlanet, SolverFlags } from '../types/solver';

import { classifyWorld, planetSurfaceTemperature } from './classify';

/**
 * Тесты классификации миров (задача 19; п. 9.3, U41).
 *
 * Границы проверяются на самих значениях и на шаг в обе стороны:
 * 230/330 K входят в «землеподобный», 1.65 R⊕ — ещё скальный мир.
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

/** Планета с радиусом и температурой поверхности. */
function planet(R: number | null, T_s: number | null): ResolvedPlanet {
  return {
    id: 'planet-1',
    R: R === null ? nullParam() : makeParam(R, 'measured'),
    M: nullParam(),
    e: nullParam(),
    d: nullParam(),
    P: nullParam(),
    S: nullParam(),
    // T_s = T_eq + 33 K, поэтому обратный пересчёт точен.
    T_eq: T_s === null ? nullParam() : makeParam(T_s - 33, 'physics'),
    rho: nullParam(),
    L: nullParam(),
    st_teff: nullParam(),
    st_rad: nullParam(),
    st_mass: nullParam(),
    dist_pc: nullParam(),
    ra: nullParam(),
    dec: nullParam(),
    flags: flags(),
  };
}

describe('classifyWorld', () => {
  it('землеподобный мир при R = 1 и T_s = 288 K', () => {
    expect(classifyWorld(planet(1, 288))).toBe('earthlike');
  });

  it('границы температуры: 229.9 — лёд, 230 и 330 — землеподобный', () => {
    expect(classifyWorld(planet(1, 229.9))).toBe('ice');
    expect(classifyWorld(planet(1, 230))).toBe('earthlike');
    expect(classifyWorld(planet(1, 330))).toBe('earthlike');
  });

  it('границы температуры: 330.1 и 699.9 — пустыня, 700 — лава', () => {
    expect(classifyWorld(planet(1, 330.1))).toBe('desert');
    expect(classifyWorld(planet(1, 699.9))).toBe('desert');
    expect(classifyWorld(planet(1, 700))).toBe('lava');
  });

  it('границы радиуса: 1.65 — скальный класс, 1.66 — мини-нептун', () => {
    expect(classifyWorld(planet(1.65, 288))).toBe('earthlike');
    expect(classifyWorld(planet(1.66, 288))).toBe('mini_neptune');
    expect(classifyWorld(planet(6, 288))).toBe('mini_neptune');
    expect(classifyWorld(planet(6.01, 288))).toBe('gas_giant');
  });

  it('без радиуса или температуры класс не определён', () => {
    expect(classifyWorld(planet(null, 288))).toBe('unknown');
    expect(classifyWorld(planet(1, null))).toBe('unknown');
  });

  it('радиус больше 6 R⊕ даёт газовый гигант независимо от температуры', () => {
    expect(classifyWorld(planet(8, null))).toBe('gas_giant');
  });

  it('T_s = T_eq + 33 K', () => {
    expect(planetSurfaceTemperature(planet(1, 288))).toBeCloseTo(288, 9);
  });
});
