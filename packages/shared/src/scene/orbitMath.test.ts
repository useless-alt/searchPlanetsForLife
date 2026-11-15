import { describe, expect, it } from 'vitest';

import { makeParam, nullParam } from '../physics/provenance';

import {
  ELLIPSE_SAMPLES_DEFAULT,
  ELLIPSE_SAMPLES_HIGH,
  KEPLER_EPSILON,
  ellipseSampleCount,
  normalizeAngle,
  orbitAvailability,
  positionAU,
  sampleEllipse,
  solveKepler,
} from './orbitMath';

/**
 * Тесты кеплеровской геометрии орбиты (задача 23; п. 11.3; U46, U49).
 *
 * Проверяются решение уравнения Кеплера, положение планеты, контур эллипса
 * с фокусом в звезде и доступность орбиты по данным.
 */

/** Детерминированный генератор случайных чисел (LCG). */
function randomSource(seed: number): () => number {
  let state = seed >>> 0;

  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;

    return state / 0x100000000;
  };
}

/** Невязка уравнения Кеплера. */
function keplerResidual(eccentricAnomaly: number, e: number, meanAnomaly: number): number {
  return Math.abs(eccentricAnomaly - e * Math.sin(eccentricAnomaly) - meanAnomaly);
}

/** Параметр с заданным происхождением. */
function param(number: number, provenance: 'measured' | 'estimate' = 'measured') {
  return makeParam(number, provenance);
}

describe('solveKepler', () => {
  it('при e = 0 эксцентрическая аномалия равна средней', () => {
    for (const mean of [0, 0.1, 1, Math.PI, 5.5]) {
      expect(solveKepler(mean, 0)).toBeCloseTo(mean, 12);
    }
  });

  it('e = 0.5, M = 1 → E ≈ 1.4987', () => {
    expect(solveKepler(1, 0.5)).toBeCloseTo(1.4987, 4);
  });

  it('e = 0.9, M = 0.1 решается с невязкой меньше 1e-12', () => {
    const eccentric = solveKepler(0.1, 0.9);

    expect(keplerResidual(eccentric, 0.9, 0.1)).toBeLessThan(1e-12);
  });

  it('сходится для 1000 случайных пар e ∈ [0, 0.99], M ∈ [0, 2π)', () => {
    const random = randomSource(23);

    for (let index = 0; index < 1000; index += 1) {
      const e = random() * 0.99;
      const mean = random() * Math.PI * 2;
      const eccentric = solveKepler(mean, e);

      expect(keplerResidual(eccentric, e, mean), `e=${e}, M=${mean}`).toBeLessThan(KEPLER_EPSILON);
    }
  });

  it('приводит отрицательную и большую среднюю аномалию к [0, 2π)', () => {
    expect(normalizeAngle(-0.5)).toBeCloseTo(Math.PI * 2 - 0.5, 12);
    expect(normalizeAngle(Math.PI * 6)).toBeCloseTo(0, 12);
    expect(solveKepler(-0.5, 0.5)).toBeCloseTo(solveKepler(Math.PI * 2 - 0.5, 0.5), 12);
  });
});

describe('positionAU', () => {
  const a = 1.5;
  const e = 0.4;
  const period = 8;

  it('в начале отсчёта планета стоит в перицентре на +X', () => {
    const [x, y, z] = positionAU(a, e, 0, period);

    expect(x).toBeCloseTo(a * (1 - e), 12);
    expect(y).toBe(0);
    expect(z).toBeCloseTo(0, 12);
  });

  it('через половину периода находится в апоцентре на −X', () => {
    const [x, y, z] = positionAU(a, e, period / 2, period);

    expect(x).toBeCloseTo(-a * (1 + e), 12);
    expect(y).toBe(0);
    expect(z).toBeCloseTo(0, 9);
  });

  it('без периода планета неподвижна в перицентре', () => {
    const start = positionAU(a, e, 0, null);
    const later = positionAU(a, e, 17, null);

    expect(later).toEqual(start);
  });

  it('для 1000 случайных суток лежит на эллипсе с точностью 1e-9', () => {
    const random = randomSource(49);
    const b = a * Math.sqrt(1 - e * e);

    for (let index = 0; index < 1000; index += 1) {
      const days = random() * 40;
      const [x, , z] = positionAU(a, e, days, period);
      const y = -z;
      const ellipse = ((x + a * e) / a) ** 2 + (y / b) ** 2;

      expect(ellipse, `days=${days}`).toBeCloseTo(1, 9);
    }
  });

  it('расстояние до звезды равно a·(1 − e·cos E) с точностью 1e-9', () => {
    const random = randomSource(123);

    for (let index = 0; index < 1000; index += 1) {
      const days = random() * 80;
      const mean = (Math.PI * 2 * days) / period;
      const eccentric = solveKepler(mean, e);
      const [x, , z] = positionAU(a, e, days, period);
      const distance = Math.hypot(x, z);
      const expected = a * (1 - e * Math.cos(eccentric));

      expect(distance, `days=${days}`).toBeCloseTo(expected, 9);
    }
  });

  it('не возвращает NaN и Infinity при нечисловых входах', () => {
    for (const value of [
      positionAU(Number.NaN, e, 1, period),
      positionAU(a, Number.NaN, 1, period),
      positionAU(a, e, Number.NaN, period),
      positionAU(a, e, 1, Number.NaN),
    ]) {
      expect(value.every(Number.isFinite)).toBe(true);
    }
  });
});

describe('sampleEllipse', () => {
  const a = 2;
  const e = 0.3;

  it('содержит ровно n точек без повторения последней', () => {
    const points = sampleEllipse(a, e, 90);

    expect(points).toHaveLength(90);
  });

  it('выбирает 360 точек при e ≤ 0.8 и 720 при большей вытянутости', () => {
    expect(sampleEllipse(a, 0.8)).toHaveLength(ELLIPSE_SAMPLES_DEFAULT);
    expect(sampleEllipse(a, 0.81)).toHaveLength(ELLIPSE_SAMPLES_HIGH);
    expect(ellipseSampleCount(0)).toBe(ELLIPSE_SAMPLES_DEFAULT);
    expect(ellipseSampleCount(0.81)).toBe(ELLIPSE_SAMPLES_HIGH);
  });

  it('перицентр и апоцентр совпадают с a·(1 − e) и a·(1 + e)', () => {
    const points = sampleEllipse(a, e);
    const distances = points.map(([x, , z]) => Math.hypot(x, z));

    expect(Math.min(...distances)).toBeCloseTo(a * (1 - e), 9);
    expect(Math.max(...distances)).toBeCloseTo(a * (1 + e), 9);
  });

  it('не содержит дубликатов', () => {
    const points = sampleEllipse(a, e, 120);
    const keys = new Set(points.map(([x, , z]) => `${x.toFixed(9)}:${z.toFixed(9)}`));

    expect(keys.size).toBe(points.length);
  });

  it('центр контура смещён на −a·e по X: звезда в фокусе, а не в центре', () => {
    const points = sampleEllipse(a, e, 360);
    const meanX = points.reduce((sum, [x]) => sum + x, 0) / points.length;
    const meanZ = points.reduce((sum, [, , z]) => sum + z, 0) / points.length;

    expect(meanX).toBeCloseTo(-a * e, 9);
    expect(meanZ).toBeCloseTo(0, 9);
  });

  it('возвращает пустой массив при нечисловой большой полуоси', () => {
    expect(sampleEllipse(Number.NaN, e)).toEqual([]);
    expect(sampleEllipse(0, e)).toEqual([]);
  });
});

describe('orbitAvailability', () => {
  const scale = { nominal: false };

  it('доступна при d > 0, e ∈ [0, 1) и реальном масштабе', () => {
    expect(orbitAvailability({ d: param(1.2), e: param(0.3) }, scale)).toEqual({
      available: true,
      reason: null,
    });
  });

  it('принятый нулевой эксцентриситет с происхождением estimate не мешает', () => {
    expect(orbitAvailability({ d: param(1), e: param(0, 'estimate') }, scale).available).toBe(true);
  });

  it('отсутствующий эксцентриситет считается нулевым', () => {
    expect(orbitAvailability({ d: param(1), e: nullParam() }, scale).available).toBe(true);
  });

  it('без большой полуоси орбита недоступна с причиной «missing-axis»', () => {
    expect(orbitAvailability({ d: nullParam(), e: param(0) }, scale)).toEqual({
      available: false,
      reason: 'missing-axis',
    });
  });

  it('нефизичный эксцентриситет делает орбиту недоступной', () => {
    for (const eccentricity of [1, 1.5, -0.2]) {
      expect(orbitAvailability({ d: param(1), e: param(eccentricity) }, scale).available).toBe(
        false,
      );
    }
  });

  it('условное расстояние модели даёт причину «nominal»', () => {
    expect(orbitAvailability({ d: param(1), e: param(0) }, { nominal: true })).toEqual({
      available: false,
      reason: 'nominal',
    });
  });
});
