import { describe, expect, it } from 'vitest';

import { icrsToGalactic, icrsToScene, type Vec3 } from './frames';

/**
 * Тесты систем координат 3D-карты (задача 21; п. 6.1, U44).
 *
 * Проверяются опорные точки Галактики, отбрасывание планет без координат
 * и сохранение длины вектора при повороте.
 */

/** Длина вектора. */
function length(vector: Vec3): number {
  return Math.hypot(vector.x, vector.y, vector.z);
}

describe('icrsToGalactic', () => {
  it('центр Галактики лежит на оси +X', () => {
    const point = icrsToGalactic(266.405, -28.936, 1);

    expect(point).not.toBeNull();
    expect(point?.x).toBeCloseTo(1, 3);
    expect(point?.y).toBeCloseTo(0, 3);
    expect(point?.z).toBeCloseTo(0, 3);
  });

  it('северный полюс Галактики лежит на оси +Z', () => {
    const point = icrsToGalactic(192.85948, 27.12825, 1);

    expect(point).not.toBeNull();
    expect(point?.z).toBeCloseTo(1, 3);
    expect(point?.x).toBeCloseTo(0, 3);
    expect(point?.y).toBeCloseTo(0, 3);
  });

  it('сохраняет длину вектора расстояния', () => {
    const point = icrsToGalactic(123.456, -45.6, 123.4);

    expect(point).not.toBeNull();
    if (point === null) return;

    expect(length(point)).toBeCloseTo(123.4, 6);
  });

  it('не размещает планету без расстояния или с нулевым расстоянием', () => {
    expect(icrsToGalactic(10, 20, null)).toBeNull();
    expect(icrsToGalactic(10, 20, 0)).toBeNull();
    expect(icrsToGalactic(10, 20, -5)).toBeNull();
  });

  it('не размещает планету без координат или с неконечными значениями', () => {
    expect(icrsToGalactic(null, 20, 10)).toBeNull();
    expect(icrsToGalactic(10, null, 10)).toBeNull();
    expect(icrsToGalactic(Number.NaN, 20, 10)).toBeNull();
    expect(icrsToGalactic(10, Number.POSITIVE_INFINITY, 10)).toBeNull();
    expect(icrsToGalactic(10, 20, Number.NaN)).toBeNull();
  });
});

describe('icrsToScene', () => {
  it('переводит галактические оси в сцену Three.js', () => {
    const galactic = icrsToGalactic(123.456, -45.6, 42);
    const scene = icrsToScene(123.456, -45.6, 42);

    expect(galactic).not.toBeNull();
    expect(scene).not.toBeNull();
    if (galactic === null || scene === null) return;

    expect(scene.x).toBeCloseTo(galactic.x, 12);
    expect(scene.y).toBeCloseTo(galactic.z, 12);
    expect(scene.z).toBeCloseTo(-galactic.y, 12);
  });

  it('помещает центр Галактики на ось +X сцены', () => {
    const point = icrsToScene(266.405, -28.936, 1);

    expect(point).not.toBeNull();
    expect(point?.x).toBeCloseTo(1, 3);
    expect(point?.y).toBeCloseTo(0, 3);
    expect(point?.z).toBeCloseTo(0, 3);
  });

  it('возвращает null для планеты без координат', () => {
    expect(icrsToScene(null, null, null)).toBeNull();
  });
});
