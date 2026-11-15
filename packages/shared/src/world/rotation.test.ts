import { describe, expect, it } from 'vitest';

import { makeParam, nullParam } from '../physics/provenance';
import type { ResolvedPlanet, SolverFlags } from '../types/solver';

import { assumedRotationPeriodDays, computeRotation, rotationAngle, TILT_RANGES } from './rotation';

/**
 * Тесты модели вращения (задача 26; п. 9.3, 11.5; U53–U55).
 *
 * Проверяются приливной захват, условные периоды, диапазоны наклона,
 * детерминированность и формулы углов.
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

/** Планета с нужными полями. */
function planet(input: {
  id?: string;
  P?: number | null;
  R?: number | null;
  st_teff?: number | null;
}): ResolvedPlanet {
  return {
    id: input.id ?? 'planet-1',
    R: input.R === null ? nullParam() : makeParam(input.R ?? 1, 'measured'),
    M: makeParam(1, 'measured'),
    e: makeParam(0, 'measured'),
    d: makeParam(1, 'measured'),
    P: input.P === null ? nullParam() : makeParam(input.P ?? 4, 'measured'),
    S: makeParam(1, 'measured'),
    T_eq: makeParam(255, 'physics'),
    rho: nullParam(),
    L: makeParam(1, 'measured'),
    st_teff: input.st_teff === null ? nullParam() : makeParam(input.st_teff ?? 5772, 'measured'),
    st_rad: makeParam(1, 'measured'),
    st_mass: makeParam(1, 'measured'),
    dist_pc: makeParam(10, 'measured'),
    ra: makeParam(0, 'measured'),
    dec: makeParam(0, 'measured'),
    flags: flags(),
  };
}

/** Проверяет попадание значения в диапазон. */
function inRange(value: number, range: readonly [number, number]): boolean {
  return value >= range[0] && value <= range[1];
}

describe('computeRotation — режим', () => {
  it('P = 4 → приливной захват по близкой орбите', () => {
    const spec = computeRotation(planet({ P: 4 }));

    expect(spec.mode).toBe('locked');
    expect(spec.reason).toBe('close_orbit');
    expect(spec.periodDays).toBe(4);
    expect(spec.direction).toBe(1);
    expect(spec.tiltDeg).toBeLessThanOrEqual(3);
  });

  it('P = 30 у красного карлика → приливной захват', () => {
    const spec = computeRotation(planet({ P: 30, st_teff: 3500 }));

    expect(spec.mode).toBe('locked');
    expect(spec.reason).toBe('red_dwarf');
    expect(spec.periodDays).toBe(30);
  });

  it('P = 30 у солнцеподобной звезды → условное вращение', () => {
    expect(computeRotation(planet({ P: 30, st_teff: 5772 })).mode).toBe('assumed');
  });

  it('P = 60 у красного карлика уже не захват', () => {
    const spec = computeRotation(planet({ P: 60, st_teff: 3500 }));

    expect(spec.mode).toBe('assumed');
    expect(spec.reason).toBe('default');
  });

  it('P = null → условное вращение', () => {
    expect(computeRotation(planet({ P: null })).mode).toBe('assumed');
  });
});

describe('computeRotation — условные периоды', () => {
  it('R = 1 → 1 сутки, R = 3 → 16/24, R = 10 → 10/24', () => {
    expect(assumedRotationPeriodDays(1)).toBe(1);
    expect(assumedRotationPeriodDays(3)).toBeCloseTo(16 / 24, 15);
    expect(assumedRotationPeriodDays(10)).toBeCloseTo(10 / 24, 15);

    expect(computeRotation(planet({ P: 365, R: 1 })).periodDays).toBe(1);
    expect(computeRotation(planet({ P: 365, R: 3 })).periodDays).toBeCloseTo(16 / 24, 15);
    expect(computeRotation(planet({ P: 365, R: 10 })).periodDays).toBeCloseTo(10 / 24, 15);
  });
});

describe('computeRotation — наклон и детерминированность', () => {
  it('locked: наклон 0…3° для 1000 случайных id', () => {
    for (let index = 0; index < 1000; index += 1) {
      const spec = computeRotation(planet({ id: `locked-${index}`, P: 4 }));

      expect(inRange(spec.tiltDeg, TILT_RANGES.locked)).toBe(true);
      expect(spec.tiltAzimuthDeg).toBeGreaterThanOrEqual(0);
      expect(spec.tiltAzimuthDeg).toBeLessThan(360);
    }
  });

  it('assumed: скальные 5…30°, мини-нептуны 5…25°, газовые 1…27°', () => {
    for (let index = 0; index < 1000; index += 1) {
      const rocky = computeRotation(planet({ id: `rocky-${index}`, P: 365, R: 1 }));
      const mini = computeRotation(planet({ id: `mini-${index}`, P: 365, R: 3 }));
      const gas = computeRotation(planet({ id: `gas-${index}`, P: 365, R: 10 }));

      expect(inRange(rocky.tiltDeg, TILT_RANGES.rocky)).toBe(true);
      expect(inRange(mini.tiltDeg, TILT_RANGES.miniNeptune)).toBe(true);
      expect(inRange(gas.tiltDeg, TILT_RANGES.gasGiant)).toBe(true);
    }
  });

  it('повторный вызов с тем же id даёт тот же результат', () => {
    const first = computeRotation(planet({ id: 'same', P: 30, st_teff: 3500 }));
    const second = computeRotation(planet({ id: 'same', P: 30, st_teff: 3500 }));

    expect(second).toEqual(first);
  });
});

describe('rotationAngle — формулы', () => {
  it('assumed: за 24 ч угол растёт на 2π', () => {
    const spec = computeRotation(planet({ P: 365, R: 1 }));
    const delta = rotationAngle(spec, 0, 24) - spec.theta0;

    expect(delta).toBeCloseTo(Math.PI * 2, 12);
    expect(rotationAngle(spec, 0, 6)).toBeGreaterThan(spec.theta0);
  });

  it('locked: за P суток угол растёт на 2π', () => {
    const spec = computeRotation(planet({ P: 4 }));
    const delta = rotationAngle(spec, 4, 0) - spec.theta0;

    expect(delta).toBeCloseTo(Math.PI * 2, 12);
  });

  it('locked: начальный меридиан смотрит на звезду при планете на +X', () => {
    const spec = computeRotation(planet({ P: 4 }));
    const angle = spec.theta0;
    const meridian: [number, number, number] = [Math.cos(angle), 0, -Math.sin(angle)];

    expect(meridian[0]).toBeCloseTo(-1, 12);
    expect(meridian[1]).toBe(0);
    expect(meridian[2]).toBeCloseTo(0, 12);
  });
});
