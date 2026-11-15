import { describe, expect, it } from 'vitest';

import { makeParam, nullParam } from '../physics/provenance';
import type { ParamValue } from '../types/provenance';

import {
  CAMERA_MAX_DISTANCE_FACTOR,
  CAMERA_MIN_DISTANCE_FACTOR,
  CAMERA_TRANSITION_MS,
  SYSTEM_FAR_FACTOR,
  systemCameraPlan,
} from './cameraPlan';
import { makeScaleModel, type ScaleInput, type ScaleModel } from './scale';

/**
 * Тесты камеры сцены системы (задача 22; п. 9.1, 9.4, 10.9).
 *
 * Проверяются расстояния из таблицы, перпендикулярность направления
 * «камера — планета» направлению на звезду, пределы OrbitControls
 * и дальняя плоскость отсечения.
 */

/** Проверяет абсолютный допуск. */
function expectClose(actual: number, expected: number, tolerance: number): void {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tolerance);
}

/** Измеренное значение. */
function value(number: number | null): ParamValue {
  return number === null ? nullParam() : makeParam(number, 'measured');
}

/** Минимальный набор полей планеты. */
function scaleInput(overrides: {
  R?: number | null;
  d?: number | null;
  e?: number | null;
  st_rad?: number | null;
}): ScaleInput {
  return {
    R: value(overrides.R ?? 1),
    d: value(overrides.d === undefined ? 1 : overrides.d),
    e: value(overrides.e ?? 0),
    L: nullParam(),
    st_rad: value(overrides.st_rad ?? 1),
    st_teff: nullParam(),
  };
}

/** Строит модель или роняет тест. */
function requireModel(input: ScaleInput, mode: 'real' | 'overview'): ScaleModel {
  const model = makeScaleModel(input, mode);

  expect(model).not.toBeNull();
  if (model === null) throw new Error('модель не построена');

  return model;
}

/** Длина вектора. */
function length(vector: { x: number; y: number; z: number }): number {
  return Math.hypot(vector.x, vector.y, vector.z);
}

describe('systemCameraPlan — планета', () => {
  it('в обзоре ставит камеру на 6 радиусов планеты', () => {
    const model = requireModel(scaleInput({ st_rad: 1, d: 1, e: 0.0167 }), 'overview');
    const plan = systemCameraPlan({
      target: 'planet',
      mode: 'overview',
      model,
      dAU: 1,
      e: 0.0167,
    });
    const offset = {
      x: plan.position.x - plan.target.x,
      y: plan.position.y - plan.target.y,
      z: plan.position.z - plan.target.z,
    };

    expect(plan.distance).toBeCloseTo(6, 12);
    expect(length(offset)).toBeCloseTo(6, 12);
  });

  it('в 1:1 ставит камеру на 4 радиуса планеты', () => {
    const model = requireModel(scaleInput({ R: 1.5, st_rad: 1, d: 1 }), 'real');
    const plan = systemCameraPlan({
      target: 'planet',
      mode: 'real',
      model,
      dAU: 1,
      e: 0,
    });

    expect(plan.distance).toBeCloseTo(4 * 1.5, 12);
  });

  it('направление на камеру перпендикулярно направлению на звезду', () => {
    const model = requireModel(scaleInput({ st_rad: 1, d: 1, e: 0.2 }), 'overview');
    const plan = systemCameraPlan({
      target: 'planet',
      mode: 'overview',
      model,
      dAU: 1,
      e: 0.2,
      planetPosition: { x: model.unitsPerAU, y: 0, z: 0 },
    });
    const cameraMinusPlanet = {
      x: plan.position.x - plan.target.x,
      y: plan.position.y - plan.target.y,
      z: plan.position.z - plan.target.z,
    };
    const starMinusPlanet = {
      x: -plan.target.x,
      y: -plan.target.y,
      z: -plan.target.z,
    };
    const dot =
      cameraMinusPlanet.x * starMinusPlanet.x +
      cameraMinusPlanet.y * starMinusPlanet.y +
      cameraMinusPlanet.z * starMinusPlanet.z;

    expect(Math.abs(dot)).toBeLessThanOrEqual(1e-9);
  });
});

describe('systemCameraPlan — звезда', () => {
  it('TRAPPIST-1 d в обзоре: около 59.1 единицы сцены', () => {
    const model = requireModel(scaleInput({ R: 0.77, st_rad: 0.119, d: 0.0222, e: 0 }), 'overview');
    const plan = systemCameraPlan({
      target: 'star',
      mode: 'overview',
      model,
      dAU: 0.0222,
      e: 0,
    });

    expectClose(plan.distance, 59.1, 0.05);
    expect(plan.position.x).toBeCloseTo(0, 12);
    expect(plan.position.z).toBeLessThan(0);
  });

  it('в 1:1 ставит камеру на 3 радиуса звезды', () => {
    const model = requireModel(scaleInput({ st_rad: 1, d: 1 }), 'real');
    const plan = systemCameraPlan({
      target: 'star',
      mode: 'real',
      model,
      dAU: 1,
      e: 0,
    });

    expect(plan.distance).toBeCloseTo(3 * model.starRadius, 12);
  });
});

describe('systemCameraPlan — плоскости и контролы', () => {
  it('far не меньше 4 · extent, включая зону обитаемости', () => {
    const model = requireModel(scaleInput({ st_rad: 1, d: 1 }), 'overview');
    const plan = systemCameraPlan({
      target: 'planet',
      mode: 'overview',
      model,
      dAU: 1,
      e: 0,
      hzOutAU: 0.5,
    });
    const orbitExtent = model.unitsPerAU;
    const hzExtent = model.unitsPerAU * 0.5;
    const starExtent = model.starRadius * 3;
    const extent = Math.max(orbitExtent, hzExtent, starExtent);

    expect(plan.extent).toBeCloseTo(extent, 12);
    expect(plan.far).toBeCloseTo(SYSTEM_FAR_FACTOR * extent, 12);
    expect(plan.far).toBeGreaterThanOrEqual(4 * plan.extent);
  });

  it('настраивает OrbitControls по п. 10.9', () => {
    const model = requireModel(scaleInput({ st_rad: 1, d: 1 }), 'overview');
    const plan = systemCameraPlan({
      target: 'planet',
      mode: 'overview',
      model,
      dAU: 1,
      e: 0,
    });

    expect(plan.controls.enableRotate).toBe(true);
    expect(plan.controls.enableZoom).toBe(true);
    expect(plan.controls.enablePan).toBe(false);
    expect(plan.controls.enableDamping).toBe(true);
    expect(plan.controls.minDistance).toBeCloseTo(
      CAMERA_MIN_DISTANCE_FACTOR * model.planetRadius,
      12,
    );
    expect(plan.controls.maxDistance).toBeCloseTo(CAMERA_MAX_DISTANCE_FACTOR * plan.extent, 12);
    expect(CAMERA_TRANSITION_MS).toBe(900);
  });
});
