import { describe, expect, it } from 'vitest';

import { makeParam, nullParam } from '../physics/provenance';
import type { ResolvedPlanet, SolverFlags } from '../types/solver';

import {
  applyHints,
  MAX_CLOUD_COVER,
  METHANE_TINT,
  tintHex,
  WATER_CLOUD_BONUS,
} from './atmosphereHints';
import { buildPlanetStyle, type PlanetStyleInput } from './worldStyle';

/**
 * Тесты подсказок об атмосфере (задача 25; U52).
 *
 * Проверяются два правила — вода и метан, — устойчивость к формулам
 * `H₂O`/`CH₄`, отсутствие мутаций и возврат исходного стиля при `null`.
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

/** Разрешённая планета с радиусом и температурой. */
function resolved(R: number, T_eq: number): ResolvedPlanet {
  return {
    id: 'planet-1',
    R: makeParam(R, 'measured'),
    M: nullParam(),
    e: nullParam(),
    d: nullParam(),
    P: nullParam(),
    S: nullParam(),
    T_eq: makeParam(T_eq, 'physics'),
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

/** Деталь нужного класса. */
function detail(world: PlanetStyleInput['world'], R = 1, T_eq = 255): PlanetStyleInput {
  return {
    id: 'planet-1',
    world,
    gaps: { planetStub: false },
    resolved: resolved(R, T_eq),
  };
}

/** Строит стиль и проверяет, что он есть. */
function styleOf(world: PlanetStyleInput['world'], R = 1, T_eq = 255) {
  const style = buildPlanetStyle(detail(world, R, T_eq));

  expect(style).not.toBeNull();
  if (style === null) throw new Error('стиль не построен');

  return style;
}

describe('applyHints — пустые подсказки', () => {
  it('при null возвращает исходный объект', () => {
    const style = styleOf('earthlike');

    expect(applyHints(style, null)).toBe(style);
  });

  it('игнорирует неизвестные молекулы, но создаёт новый объект', () => {
    const style = styleOf('earthlike');
    const next = applyHints(style, { molecules: ['CO2', 'O3'] });

    expect(next).not.toBe(style);
    expect(next.cloudCover).toBe(style.cloudCover);
    expect(next.palette).toBe(style.palette);
  });

  it('пустой список возвращает прежние значения', () => {
    const style = styleOf('earthlike');
    const next = applyHints(style, { molecules: [] });

    expect(next).not.toBe(style);
    expect(next).toEqual(style);
  });
});

describe('applyHints — вода', () => {
  it('добавляет 0.10 облачности землеподобному миру', () => {
    const style = styleOf('earthlike');
    const next = applyHints(style, { molecules: ['H2O'] });

    expect(next.cloudCover).toBeCloseTo(style.cloudCover + WATER_CLOUD_BONUS, 12);
    expect(next.cloudCover).toBeLessThanOrEqual(MAX_CLOUD_COVER);
  });

  it('понимает подстрочную цифру и регистр', () => {
    const style = styleOf('earthlike');
    const subscript = applyHints(style, { molecules: ['H₂O'] });
    const lower = applyHints(style, { molecules: ['h2o'] });

    expect(subscript.cloudCover).toBe(lower.cloudCover);
  });

  it('действует на лёд и пустыню, но не на газовые миры', () => {
    const ice = styleOf('ice');
    const desert = styleOf('desert');
    const gas = styleOf('gas_giant', 10, 500);

    expect(applyHints(ice, { molecules: ['H2O'] }).cloudCover).toBeCloseTo(
      ice.cloudCover + WATER_CLOUD_BONUS,
      12,
    );
    expect(applyHints(desert, { molecules: ['H2O'] }).cloudCover).toBeCloseTo(
      desert.cloudCover + WATER_CLOUD_BONUS,
      12,
    );
    expect(applyHints(gas, { molecules: ['H2O'] }).cloudCover).toBe(gas.cloudCover);
  });

  it('не поднимает облака выше 0.9', () => {
    const style = { ...styleOf('earthlike'), cloudCover: 0.88 };
    const next = applyHints(style, { molecules: ['H2O'] });

    expect(next.cloudCover).toBe(MAX_CLOUD_COVER);
  });

  it('не изменяет исходный стиль', () => {
    const style = styleOf('earthlike');
    const before = style.cloudCover;

    applyHints(style, { molecules: ['H2O'] });

    expect(style.cloudCover).toBe(before);
  });
});

describe('applyHints — метан', () => {
  it('сдвигает палитру мини-нептуна на 25 % к #4fb8c8', () => {
    const style = styleOf('mini_neptune', 2, 300);
    const next = applyHints(style, { molecules: ['CH4'] });

    expect(METHANE_TINT).toBe('#4fb8c8');
    expect(next.palette.atmosphere).toBe(tintHex(style.palette.atmosphere));
    expect(next.atmosphere.color).toBe(next.palette.atmosphere);
    expect(next.palette.surface[0]).toBe(tintHex(style.palette.surface[0] ?? ''));
  });

  it('понимает CH₄ и не трогает землеподобный мир', () => {
    const mini = styleOf('mini_neptune', 2, 300);
    const earth = styleOf('earthlike');

    expect(applyHints(mini, { molecules: ['CH₄'] }).palette.atmosphere).toBe(
      tintHex(mini.palette.atmosphere),
    );
    expect(applyHints(earth, { molecules: ['CH4'] }).palette).toBe(earth.palette);
  });

  it('смешивает каналы линейно', () => {
    expect(tintHex('#000000', '#ffffff', 0.5)).toBe('#808080');
    expect(tintHex('#000000', '#ffffff', 1)).toBe('#ffffff');
    expect(tintHex('#000000', '#ffffff', 0)).toBe('#000000');
  });
});

describe('applyHints — обе молекулы', () => {
  it('применяет воду и метан независимо', () => {
    const style = styleOf('mini_neptune', 2, 300);
    const next = applyHints(style, { molecules: ['H2O', 'CH4'] });

    expect(next.cloudCover).toBe(style.cloudCover);
    expect(next.palette.atmosphere).toBe(tintHex(style.palette.atmosphere));
  });
});
