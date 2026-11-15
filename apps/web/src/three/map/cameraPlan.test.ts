import { describe, expect, it } from 'vitest';

import {
  FAR_PLANE_FACTOR,
  FOCUS_DURATION_MS,
  FOCUS_MAX_DISTANCE,
  FOCUS_MIN_DISTANCE,
  FLY_DISTANCE,
  FLY_DURATION_MS,
  MAX_CAMERA_DISTANCE_FACTOR,
  MIN_CAMERA_DISTANCE,
  NEAR_PLANE,
  OVERVIEW_ANGLE_DEG,
  OVERVIEW_DISTANCE_FACTOR,
  easeInOut,
  flyToSystem,
  focusPlan,
  overviewCameraPlan,
} from './cameraPlan';

/**
 * Тесты камеры 3D-карты (задача 21; п. 6.1, 10.8).
 *
 * Проверяются обзорный масштаб, пределы OrbitControls, clamp фокуса
 * и длительности перелётов.
 */

/** Длина вектора. */
function length(vector: { x: number; y: number; z: number }): number {
  return Math.hypot(vector.x, vector.y, vector.z);
}

describe('overviewCameraPlan', () => {
  it('ставит камеру на расстояние 2.2 * radiusP95', () => {
    const plan = overviewCameraPlan(100, 500);

    expect(plan.distance).toBeCloseTo(OVERVIEW_DISTANCE_FACTOR * 100, 12);
    expect(plan.target).toEqual({ x: 0, y: 0, z: 0 });
    expect(length(plan.position)).toBeCloseTo(220, 12);
  });

  it('смотрит на Галактику под углом 35°', () => {
    const plan = overviewCameraPlan(100, 500);
    const angle = (Math.asin(plan.position.y / plan.distance) * 180) / Math.PI;

    expect(angle).toBeCloseTo(OVERVIEW_ANGLE_DEG, 10);
  });

  it('задаёт near, far и пределы OrbitControls', () => {
    const plan = overviewCameraPlan(100, 500);

    expect(plan.near).toBe(NEAR_PLANE);
    expect(plan.far).toBe(FAR_PLANE_FACTOR * 500);
    expect(plan.controls.minDistance).toBe(MIN_CAMERA_DISTANCE);
    expect(plan.controls.maxDistance).toBe(MAX_CAMERA_DISTANCE_FACTOR * 500);
    expect(plan.controls.enableRotate).toBe(true);
    expect(plan.controls.enableZoom).toBe(true);
    expect(plan.controls.enablePan).toBe(true);
    expect(plan.controls.enableDamping).toBe(true);
  });
});

describe('focusPlan', () => {
  it('для 1000 пк ограничивает расстояние 60 пк', () => {
    const plan = focusPlan({ x: 1000, y: 0, z: 0 });

    expect(plan.distance).toBe(FOCUS_MAX_DISTANCE);
    expect(plan.durationMs).toBe(FOCUS_DURATION_MS);
    expect(length(plan.position)).toBeGreaterThan(0);
  });

  it('для 5 пк поднимает расстояние до 2 пк', () => {
    const plan = focusPlan({ x: 5, y: 0, z: 0 });

    expect(plan.distance).toBe(FOCUS_MIN_DISTANCE);
  });

  it('берёт 15 % расстояния внутри диапазона', () => {
    const plan = focusPlan({ x: 100, y: 0, z: 0 });

    expect(plan.distance).toBeCloseTo(15, 12);
  });

  it('наводит камеру на систему и держит заданное расстояние', () => {
    const target = { x: 50, y: 20, z: -10 };
    const plan = focusPlan(target);

    expect(plan.target).toEqual(target);
    expect(
      Math.hypot(
        plan.position.x - target.x,
        plan.position.y - target.y,
        plan.position.z - target.z,
      ),
    ).toBeCloseTo(plan.distance, 10);
  });

  it('без анимации при prefers-reduced-motion', () => {
    const plan = focusPlan({ x: 100, y: 0, z: 0 }, { reducedMotion: true });

    expect(plan.durationMs).toBe(0);
    expect(plan.animate).toBe(false);
  });
});

describe('flyToSystem', () => {
  it('летит к системе на 0.5 пк за 1200 мс', () => {
    const target = { x: 10, y: 5, z: -3 };
    const plan = flyToSystem(target);

    expect(plan.target).toEqual(target);
    expect(plan.distance).toBe(FLY_DISTANCE);
    expect(plan.durationMs).toBe(FLY_DURATION_MS);
    expect(
      Math.hypot(
        plan.position.x - target.x,
        plan.position.y - target.y,
        plan.position.z - target.z,
      ),
    ).toBeCloseTo(FLY_DISTANCE, 10);
  });

  it('отключает анимацию при prefers-reduced-motion', () => {
    const plan = flyToSystem({ x: 10, y: 0, z: 0 }, { reducedMotion: true });

    expect(plan.animate).toBe(false);
    expect(plan.durationMs).toBe(0);
  });
});

describe('easeInOut', () => {
  it('проходит через 0, 0.5 и 1', () => {
    expect(easeInOut(0)).toBe(0);
    expect(easeInOut(0.5)).toBe(0.5);
    expect(easeInOut(1)).toBe(1);
  });

  it('симметрична относительно середины', () => {
    expect(easeInOut(0.25)).toBeCloseTo(1 - easeInOut(0.75), 12);
  });
});
