import { describe, expect, it } from 'vitest';

import { makeParam, nullParam } from '../physics/provenance';
import type { ParamValue } from '../types/provenance';

import { AU_IN_REARTH, RSUN_IN_REARTH } from './constants';
import {
  eccentricityOf,
  isNominalDistance,
  makeScaleModel,
  overviewPlanetDistance,
  type ScaleInput,
} from './scale';
import { starRadiusSolar } from './starRadius';

/**
 * Тесты модели масштаба сцены (задача 22; п. 9.1, 9.4; U46–U50).
 *
 * Эталонные значения: TRAPPIST-1 d и Солнце–Земля; отдельно проверяются
 * высокий эксцентриситет, условное расстояние, монотонность сжатия
 * и инвариант перицентра.
 */

/** Проверяет абсолютный допуск. */
function expectClose(actual: number, expected: number, tolerance = 0.01): void {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tolerance);
}

/** Измеренное значение. */
function value(number: number | null): ParamValue {
  return number === null ? nullParam() : makeParam(number, 'measured');
}

/** Собирает минимальный набор полей планеты. */
function scaleInput(overrides: {
  R?: number | null;
  d?: number | null;
  e?: number | null;
  L?: number | null;
  st_rad?: number | null;
  st_teff?: number | null;
}): ScaleInput {
  return {
    R: value(overrides.R === undefined ? 1 : overrides.R),
    d: value(overrides.d === undefined ? 1 : overrides.d),
    e: value(overrides.e === undefined ? 0 : overrides.e),
    L: value(overrides.L ?? null),
    st_rad: value(overrides.st_rad ?? null),
    st_teff: value(overrides.st_teff ?? null),
  };
}

/** TRAPPIST-1 d: R = 0.77 R⊕, st_rad = 0.119 R☉, d = 0.0222 а.е. */
function trappist(): ScaleInput {
  return scaleInput({ R: 0.77, st_rad: 0.119, d: 0.0222, e: 0 });
}

/** Солнце–Земля: R = 1 R⊕, st_rad = 1 R☉, d = 1 а.е., e = 0.0167. */
function earth(): ScaleInput {
  return scaleInput({ R: 1, st_rad: 1, d: 1, e: 0.0167 });
}

describe('makeScaleModel — обзорный режим', () => {
  it('TRAPPIST-1 d: радиус звезды, D и unitsPerAU', () => {
    const model = makeScaleModel(trappist(), 'overview');

    expect(model).not.toBeNull();
    if (model === null) return;

    expectClose(model.starRadius, 16.88, 0.01);
    expectClose(overviewPlanetDistance(model.starRadius, 0.0222), 21.4, 0.01);
    expectClose(model.unitsPerAU, 964, 0.2);
    expect(model.planetRadius).toBe(1);
    expectClose(model.mapAU(0.0222), 21.4, 0.01);
  });

  it('Солнце–Земля ограничивает отношение радиусов значением 40', () => {
    const model = makeScaleModel(earth(), 'overview');

    expect(model).not.toBeNull();
    if (model === null) return;

    expect(model.starRadius).toBe(40);
    expectClose(overviewPlanetDistance(model.starRadius, 1), 50.25, 0.01);
  });

  it('высокий эксцентриситет растягивает масштаб до безопасного перицентра', () => {
    const model = makeScaleModel(scaleInput({ st_rad: 1, R: 1, d: 1, e: 0.9 }), 'overview');

    expect(model).not.toBeNull();
    if (model === null) return;

    expectClose(model.unitsPerAU, 420, 0.01);
  });

  it('D монотонно растёт по d на сетке 0.001…100', () => {
    let previous = -Infinity;

    for (const distance of [0.001, 0.01, 0.1, 1, 10, 100]) {
      const current = overviewPlanetDistance(40, distance);

      expect(current).toBeGreaterThan(previous);
      previous = current;
    }
  });

  it('перицентр орбиты не задевает звезду ни при каком e', () => {
    for (const eccentricity of [0, 0.2, 0.5, 0.9, 0.99]) {
      for (const distance of [0.001, 0.01, 0.1, 1, 10, 100]) {
        const model = makeScaleModel(
          scaleInput({ st_rad: 1, R: 1, d: distance, e: eccentricity }),
          'overview',
        );

        expect(model).not.toBeNull();
        if (model === null) continue;

        const pericenter = model.unitsPerAU * distance * (1 - eccentricity);

        expect(pericenter).toBeGreaterThanOrEqual(model.starRadius + 2 - 1e-9);
      }
    }
  });

  it('нефизичный эксцентриситет приводится к нулю', () => {
    expect(eccentricityOf(scaleInput({ e: -0.2 }))).toBe(0);
    expect(eccentricityOf(scaleInput({ e: 1 }))).toBe(0);
    expect(eccentricityOf(scaleInput({ e: 1.5 }))).toBe(0);
    expect(eccentricityOf(scaleInput({ e: 0.5 }))).toBe(0.5);
  });

  it('без d помечает расстояние условным и считает по d = 1', () => {
    const input = scaleInput({ st_rad: 1, R: 1, d: null });
    const model = makeScaleModel(input, 'overview');

    expect(model).not.toBeNull();
    if (model === null) return;

    expect(model.nominal).toBe(true);
    expect(isNominalDistance(input)).toBe(true);
    expect(model.unitsPerAU).toBeCloseTo(overviewPlanetDistance(40, 1), 12);
  });
});

describe('makeScaleModel — режим 1:1', () => {
  it('переводит астрономические единицы и сохраняет радиус планеты', () => {
    const model = makeScaleModel(scaleInput({ R: 1.2, st_rad: 1, d: 1 }), 'real');

    expect(model).not.toBeNull();
    if (model === null) return;

    expect(model.unitsPerAU).toBe(AU_IN_REARTH);
    expect(model.planetRadius).toBe(1.2);
    expect(model.starRadius).toBe(RSUN_IN_REARTH);
    expect(model.mapAU(1)).toBe(AU_IN_REARTH);
  });

  it('без d остаётся nominal, но модель строится', () => {
    const model = makeScaleModel(scaleInput({ st_rad: 1, d: null }), 'real');

    expect(model).not.toBeNull();
    expect(model?.nominal).toBe(true);
  });
});

describe('makeScaleModel — отсутствие данных', () => {
  it('без радиуса звезды модель не строится', () => {
    expect(makeScaleModel(scaleInput({ st_rad: null, L: null, st_teff: null }), 'overview')).toBe(
      null,
    );
    expect(makeScaleModel(scaleInput({ st_rad: null, L: null, st_teff: null }), 'real')).toBeNull();
  });

  it('R = null заменяется радиусом заглушки 1.0', () => {
    const model = makeScaleModel(scaleInput({ R: null, st_rad: 1 }), 'overview');

    expect(model?.planetRadius).toBe(1);
  });
});

describe('starRadiusSolar', () => {
  it('возвращает заданный st_rad', () => {
    expect(starRadiusSolar(scaleInput({ st_rad: 0.119 }))).toBe(0.119);
  });

  it('оценивает радиус по закону Стефана — Больцмана', () => {
    const radius = starRadiusSolar(scaleInput({ st_rad: null, L: 1, st_teff: 5772 }));

    expect(radius).toBeCloseTo(1, 12);
  });

  it('масштабируется по светимости и температуре', () => {
    const radius = starRadiusSolar(scaleInput({ st_rad: null, L: 4, st_teff: 5772 }));

    expect(radius).toBeCloseTo(2, 12);
  });

  it('возвращает null, если данных нет', () => {
    expect(starRadiusSolar(scaleInput({ st_rad: null, L: null, st_teff: null }))).toBeNull();
    expect(starRadiusSolar(scaleInput({ st_rad: null, L: 1, st_teff: null }))).toBeNull();
  });
});
