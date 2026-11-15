import { describe, expect, it } from 'vitest';

import { makeParam, nullParam } from '../physics/provenance';
import type { ResolvedPlanet, SolverFlags } from '../types/solver';

import { buildStarStyle } from './starStyle';

/**
 * Тесты стиля звезды (задача 25; п. 9.1; U51).
 *
 * Проверяются формула яркости, активность красных карликов, ступени
 * потемнения к краю, корона и зернистость.
 */

/** Флаги решателя по умолчанию. */
function flags(): SolverFlags {
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
  };
}

/** Планета со звёздными параметрами. */
function star(input: {
  st_teff?: number | null;
  L?: number | null;
  st_rad?: number | null;
}): ResolvedPlanet {
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
    L: input.L === null ? nullParam() : makeParam(input.L ?? 1, 'measured'),
    st_teff: input.st_teff === null ? nullParam() : makeParam(input.st_teff ?? 5772, 'measured'),
    st_rad: input.st_rad === null ? nullParam() : makeParam(input.st_rad ?? 1, 'measured'),
    st_mass: nullParam(),
    dist_pc: nullParam(),
    ra: nullParam(),
    dec: nullParam(),
    flags: flags(),
  };
}

describe('buildStarStyle — Солнце', () => {
  it('даёт белую фотосферу, нейтральный свет и нулевую активность', () => {
    const style = buildStarStyle(star({ st_teff: 5772, L: 1, st_rad: 1 }), 7);

    expect(style.seed).toBe(7);
    expect(style.color[0]).toBeCloseTo(1, 3);
    expect(style.color[1]).toBeCloseTo(0.9502, 3);
    expect(style.color[2]).toBeCloseTo(0.9034, 3);
    expect(style.sunColor[0]).toBeCloseTo(1, 3);
    expect(style.sunColor[1]).toBeCloseTo(0.4 + 0.6 * 0.9502, 3);
    expect(style.brightness).toBeCloseTo(0.85, 12);
    expect(style.activity).toBe(0);
    expect(style.spotCover).toBe(0.04);
    expect(style.limbU).toBe(0.6);
    expect(style.coronaScale).toBe(1.8);
    expect(style.granulation).toBe(8);
  });
});

describe('buildStarStyle — красный карлик', () => {
  it('повышает активность, пятна, потемнение и корону', () => {
    const style = buildStarStyle(star({ st_teff: 3200, L: 0.01, st_rad: 0.2 }), 1);

    expect(style.activity).toBeCloseTo((4500 - 3200) / 2200, 12);
    expect(style.spotCover).toBeCloseTo(0.04 + 0.28 * ((4500 - 3200) / 2200), 12);
    expect(style.limbU).toBe(0.75);
    expect(style.coronaScale).toBeCloseTo(1.8 + 0.8 * ((4500 - 3200) / 2200), 12);
    expect(style.granulation).toBeCloseTo(8 - 3 * Math.log10(0.2), 12);
  });

  it('делает свет на планете теплее белого', () => {
    const style = buildStarStyle(star({ st_teff: 3200 }), 1);

    expect(style.sunColor[0]).toBeGreaterThan(style.sunColor[2]);
  });
});

describe('buildStarStyle — яркость и границы', () => {
  it('ограничивает яркость 0.55…1.5', () => {
    expect(buildStarStyle(star({ L: 1e-6 }), 1).brightness).toBe(0.55);
    expect(buildStarStyle(star({ L: 0 }), 1).brightness).toBe(0.55);
    expect(buildStarStyle(star({ L: 5.5e-4 }), 1).brightness).toBe(0.55);
    expect(buildStarStyle(star({ L: 1e6 }), 1).brightness).toBe(1.5);
  });

  it('активность и потемнение совпадают с таблицей задачи', () => {
    expect(buildStarStyle(star({ st_teff: 2566 }), 1).activity).toBeCloseTo(1934 / 2200, 12);
    expect(buildStarStyle(star({ st_teff: 2566 }), 1).limbU).toBe(0.75);
    expect(buildStarStyle(star({ st_teff: 3500 }), 1).activity).toBeCloseTo(1000 / 2200, 12);
    expect(buildStarStyle(star({ st_teff: 8000 }), 1).limbU).toBe(0.45);
  });

  it('при L = null принимает светимость 1', () => {
    expect(buildStarStyle(star({ L: null }), 1).brightness).toBe(0.85);
  });

  it('выбирает потемнение по ступеням 4000 и 6500 K', () => {
    expect(buildStarStyle(star({ st_teff: 3999 }), 1).limbU).toBe(0.75);
    expect(buildStarStyle(star({ st_teff: 4000 }), 1).limbU).toBe(0.6);
    expect(buildStarStyle(star({ st_teff: 6499 }), 1).limbU).toBe(0.6);
    expect(buildStarStyle(star({ st_teff: 6500 }), 1).limbU).toBe(0.45);
  });

  it('ограничивает зернистость 5…12 и терпит st_rad = null', () => {
    expect(buildStarStyle(star({ st_rad: 100 }), 1).granulation).toBe(5);
    expect(buildStarStyle(star({ st_rad: 0.01 }), 1).granulation).toBeCloseTo(11.903, 3);
    expect(buildStarStyle(star({ st_rad: null }), 1).granulation).toBe(8);
  });

  it('для неизвестной температуры даёт серый цвет и нулевую активность', () => {
    const style = buildStarStyle(star({ st_teff: null }), 3);

    expect(style.color[0]).toBeCloseTo(0x8b / 255, 12);
    expect(style.activity).toBe(0);
  });
});
