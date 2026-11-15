import { describe, expect, it } from 'vitest';

import { makeParam, nullParam } from '../physics/provenance';
import type { ResolvedPlanet, SolverFlags } from '../types/solver';

import { PALETTES } from './palettes';
import {
  buildPlanetStyle,
  FBM_HEIGHT_CDF,
  seaLevelForOceanFraction,
  type PlanetStyleInput,
} from './worldStyle';

/**
 * Тесты стиля процедурной планеты (задача 25; п. 9.3; U41, U51).
 *
 * Проверяются отказ от заглушек, диапазоны художественных коэффициентов,
 * зависимость от seed, палитры по температуре и подбор уровня моря.
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

/** Разрешённая планета с нужными полями. */
function resolved(overrides: {
  R?: number | null;
  M?: number | null;
  T_eq?: number | null;
  st_rad?: number | null;
}): ResolvedPlanet {
  return {
    id: 'planet-1',
    R: overrides.R === null ? nullParam() : makeParam(overrides.R ?? 1, 'measured'),
    M: overrides.M === null ? nullParam() : makeParam(overrides.M ?? 1, 'measured'),
    e: nullParam(),
    d: nullParam(),
    P: nullParam(),
    S: nullParam(),
    T_eq: overrides.T_eq === null ? nullParam() : makeParam(overrides.T_eq ?? 255, 'physics'),
    rho: nullParam(),
    L: nullParam(),
    st_teff: nullParam(),
    st_rad: overrides.st_rad === null ? nullParam() : makeParam(overrides.st_rad ?? 1, 'measured'),
    st_mass: nullParam(),
    dist_pc: nullParam(),
    ra: nullParam(),
    dec: nullParam(),
    flags: flags(),
  };
}

/** Деталь для построения стиля. */
function detail(
  world: PlanetStyleInput['world'],
  input: Parameters<typeof resolved>[0] = {},
  overrides: Partial<PlanetStyleInput> = {},
): PlanetStyleInput {
  return {
    id: 'planet-1',
    world,
    gaps: { planetStub: false },
    resolved: resolved(input),
    ...overrides,
  };
}

describe('buildPlanetStyle — отказ от заглушки', () => {
  it('возвращает null для неизвестного класса', () => {
    expect(buildPlanetStyle(detail('unknown'))).toBeNull();
  });

  it('возвращает null при флаге planetStub (задача 27)', () => {
    expect(buildPlanetStyle(detail('earthlike', {}, { gaps: { planetStub: true } }))).toBeNull();
  });
});

describe('buildPlanetStyle — землеподобный мир', () => {
  it('задаёт океан, шапки, облака и блик в диапазонах U51', () => {
    const style = buildPlanetStyle(detail('earthlike', { T_eq: 255 }));

    expect(style).not.toBeNull();
    if (style === null) return;

    expect(style.kind).toBe('earthlike');
    expect(style.T_s).toBe(288);
    expect(style.g).toBe(1);
    expect(style.oceanFraction).toBeGreaterThanOrEqual(0.63);
    expect(style.oceanFraction).toBeLessThanOrEqual(0.79);
    expect(style.cloudCover).toBeGreaterThanOrEqual(0.3);
    expect(style.cloudCover).toBeLessThanOrEqual(0.6);
    expect(style.iceCapExtent).toBeCloseTo(0.08 + 0.55 * ((290 - 288) / 60), 12);
    expect(style.terrainAmp).toBeCloseTo(0.5, 12);
    expect(style.specular).toBe(0.6);
    expect(style.lavaGlow).toBe(0);
    expect(style.bands).toBeNull();
    expect(style.palette.surface).toEqual(['#4f7a3c', '#8a7a4f', '#c9c3b0']);
    expect(style.palette.ocean).toBe('#0b3d6b');
    expect(style.atmosphere.color).toBe('#5ea8ff');
    expect(style.atmosphere.thickness).toBeCloseTo(0.012, 12);
  });

  it('подбирает уровень моря по доле океана с шагом 0.01', () => {
    const style = buildPlanetStyle(detail('earthlike', { T_eq: 255 }));

    expect(style).not.toBeNull();
    if (style === null) return;

    const index = Math.round(style.oceanFraction * 100);

    expect(style.seaLevel).toBe(FBM_HEIGHT_CDF[index]);
    expect(style.seaLevel).toBeGreaterThan(0.5);
  });

  it('границы шапок: T_s = 288 → ≈0.098, 230 → ≈0.63, 290+ → 0.08', () => {
    const earth = buildPlanetStyle(detail('earthlike', { T_eq: 255 }));
    const cold = buildPlanetStyle(detail('earthlike', { T_eq: 197 }));
    const hot = buildPlanetStyle(detail('earthlike', { T_eq: 257 }));

    expect(earth?.iceCapExtent).toBeCloseTo(0.098, 3);
    expect(cold?.iceCapExtent).toBeCloseTo(0.63, 12);
    expect(hot?.iceCapExtent).toBeCloseTo(0.08, 12);
  });

  it('детерминирован по id и меняется у другого id', () => {
    const first = buildPlanetStyle(detail('earthlike'));
    const same = buildPlanetStyle(detail('earthlike'));
    const other = buildPlanetStyle(detail('earthlike', {}, { id: 'planet-2' }));

    expect(first).not.toBeNull();
    if (first === null || same === null || other === null) return;

    expect(same.seed).toBe(first.seed);
    expect(same.oceanFraction).toBe(first.oceanFraction);
    expect(other.seed).not.toBe(first.seed);
    expect(other.oceanFraction).not.toBe(first.oceanFraction);
  });
});

describe('buildPlanetStyle — остальные классы', () => {
  it('лёд: шапка на всю планету и нет океана', () => {
    const style = buildPlanetStyle(detail('ice', { T_eq: 180 }));

    expect(style).not.toBeNull();
    if (style === null) return;

    expect(style.oceanFraction).toBe(0);
    expect(style.iceCapExtent).toBe(1);
    expect(style.cloudCover).toBe(0.1);
    expect(style.palette).toBe(PALETTES.ice);
  });

  it('пустыня: почти нет облаков и слабый блик', () => {
    const style = buildPlanetStyle(detail('desert', { T_eq: 450 }));

    expect(style).not.toBeNull();
    if (style === null) return;

    expect(style.cloudCover).toBe(0.08);
    expect(style.specular).toBe(0.05);
    expect(style.atmosphere.color).toBe('#e8b27a');
  });

  it('лава: нет облаков, свечение растёт с температурой', () => {
    const style = buildPlanetStyle(detail('lava', { T_eq: 967 }));

    expect(style).not.toBeNull();
    if (style === null) return;

    expect(style.T_s).toBe(1000);
    expect(style.cloudCover).toBe(0);
    expect(style.lavaGlow).toBeCloseTo(0.375, 12);
    expect(style.palette.glow).toEqual(['#ff5a1f', '#ffb347']);
  });

  it('границы свечения лавы: 700 K → 0.25, 1500 K → 1', () => {
    const cold = buildPlanetStyle(detail('lava', { T_eq: 667 }));
    const hot = buildPlanetStyle(detail('lava', { T_eq: 1467 }));

    expect(cold?.lavaGlow).toBe(0.25);
    expect(hot?.lavaGlow).toBe(1);
  });

  it('мини-нептун: пять полос, холодная палитра ниже 250 K', () => {
    const style = buildPlanetStyle(detail('mini_neptune', { R: 2, T_eq: 200 }));

    expect(style).not.toBeNull();
    if (style === null) return;

    expect(style.bands).toEqual({ count: 5, contrast: 0.25 });
    expect(style.palette).toBe(PALETTES.miniNeptuneCold);
    expect(style.atmosphere.thickness).toBe(0.06);
  });

  it('мини-нептун: тёплая палитра при 300 K', () => {
    const style = buildPlanetStyle(detail('mini_neptune', { R: 2, T_eq: 300 }));

    expect(style).not.toBeNull();
    if (style === null) return;

    expect(style.palette).toBe(PALETTES.miniNeptuneWarm);
  });

  it('газовый гигант: 9–13 полос, палитра по T_eq', () => {
    const cold = buildPlanetStyle(detail('gas_giant', { R: 10, T_eq: 150 }));
    const medium = buildPlanetStyle(detail('gas_giant', { R: 10, T_eq: 500 }));
    const hot = buildPlanetStyle(detail('gas_giant', { R: 10, T_eq: 1500 }));

    expect(cold).not.toBeNull();
    expect(medium).not.toBeNull();
    expect(hot).not.toBeNull();
    if (cold === null || medium === null || hot === null) return;

    expect(cold.palette).toBe(PALETTES.gasGiantCold);
    expect(medium.palette).toBe(PALETTES.gasGiantMedium);
    expect(hot.palette).toBe(PALETTES.gasGiantHot);
    expect(cold.bands?.count).toBeGreaterThanOrEqual(9);
    expect(cold.bands?.count).toBeLessThanOrEqual(13);
    expect(cold.bands?.contrast).toBe(0.45);
    expect(cold.atmosphere.thickness).toBe(0.03);
  });
});

describe('buildPlanetStyle — g и атмосфера', () => {
  it('считает g = M / R², при M = null принимает 1', () => {
    const heavy = buildPlanetStyle(detail('earthlike', { R: 2, M: 8, T_eq: 255 }));
    const unknownMass = buildPlanetStyle(detail('earthlike', { R: 2, M: null, T_eq: 255 }));

    expect(heavy?.g).toBeCloseTo(2, 12);
    expect(unknownMass?.g).toBeCloseTo(0.25, 12);
  });

  it('ограничивает толщину атмосферы скальных миров 0.006…0.04', () => {
    const thin = buildPlanetStyle(detail('desert', { R: 1, M: 100, T_eq: 300 }));
    const thick = buildPlanetStyle(detail('lava', { R: 1, M: 0.01, T_eq: 967 }));

    expect(thin?.atmosphere.thickness).toBe(0.006);
    expect(thick?.atmosphere.thickness).toBe(0.04);
  });
});

describe('seaLevelForOceanFraction', () => {
  it('монотонен и ограничен крайними значениями', () => {
    expect(seaLevelForOceanFraction(0)).toBe(FBM_HEIGHT_CDF[0]);
    expect(seaLevelForOceanFraction(1)).toBe(FBM_HEIGHT_CDF[100]);

    const middle = seaLevelForOceanFraction(0.5);
    const high = seaLevelForOceanFraction(0.71);

    expect(middle).toBe(0.5);
    expect(high).toBeGreaterThan(middle);
  });

  it('шаг таблицы — ровно 0.01', () => {
    expect(FBM_HEIGHT_CDF).toHaveLength(101);
    expect(seaLevelForOceanFraction(0.71)).toBe(FBM_HEIGHT_CDF[71]);
  });
});
