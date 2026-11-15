import { computeRotation, positionAU, type RotationSpec } from '@exo/shared';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';

import { SimClock } from '../SimClock';
import type { PlanetVisualHandle } from '../visuals/types';
import { CLOUD_DRIFT_RAD_PER_SEC, createSpinController } from './spinController';

/**
 * Тесты контроллера вращения (задача 26; п. 9.3, 11.5; U53–U55).
 *
 * Проверяются наклон оси, формулы режимов, приливной захват, независимость
 * от частоты кадров, дрейф облаков и освобождение.
 */

/** Создаёт минимальную планету для контроллера. */
function makeHandle(): PlanetVisualHandle {
  const root = new THREE.Group();
  const axisGroup = new THREE.Group();
  const surface = new THREE.Mesh(new THREE.SphereGeometry(1));
  const clouds = new THREE.Mesh(new THREE.SphereGeometry(1.012));
  const atmosphere = new THREE.Mesh(new THREE.SphereGeometry(1.02));

  root.add(axisGroup);
  axisGroup.add(surface, clouds, atmosphere);

  return {
    root,
    object: root,
    axisGroup,
    surface,
    clouds,
    atmosphere,
    setSunState: () => undefined,
    setQuality: () => undefined,
    setHints: () => undefined,
    attachSpin: () => undefined,
    update: () => undefined,
    dispose: () => undefined,
  };
}

/** Модель вращения по параметрам. */
function spec(
  input: {
    mode?: 'locked' | 'assumed';
    periodDays?: number;
    tiltDeg?: number;
    tiltAzimuthDeg?: number;
    theta0?: number;
  } = {},
): RotationSpec {
  return {
    mode: input.mode ?? 'assumed',
    periodDays: input.periodDays ?? 1,
    direction: 1,
    tiltDeg: input.tiltDeg ?? 12,
    tiltAzimuthDeg: input.tiltAzimuthDeg ?? 40,
    reason: 'default',
    theta0: input.theta0 ?? 0,
  };
}

/** Мировая ось Y меша с учётом родительских поворотов. */
function worldY(mesh: THREE.Object3D): THREE.Vector3 {
  const axis = new THREE.Vector3(0, 1, 0);
  let current: THREE.Object3D | null = mesh;

  while (current !== null) {
    axis.applyQuaternion(current.quaternion);
    current = current.parent;
  }

  return axis;
}

describe('createSpinController — наклон и ось', () => {
  it('задаёт qAz · qTilt и не меняет ось во времени', () => {
    const handle = makeHandle();
    const model = spec({ tiltDeg: 20, tiltAzimuthDeg: 35 });
    const sim = new SimClock(4);
    const controller = createSpinController(handle, model, sim);

    const expected = new THREE.Quaternion()
      .setFromAxisAngle(new THREE.Vector3(0, 1, 0), (35 * Math.PI) / 180)
      .multiply(
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), (20 * Math.PI) / 180),
      );

    expect(handle.axisGroup.quaternion.angleTo(expected)).toBeLessThan(1e-12);

    const initialAxis = worldY(handle.axisGroup);

    for (let step = 0; step < 1000; step += 1) {
      const dt = 0.001 + (step % 17) * 0.003;
      sim.advance(dt);
      controller.update(dt, { simDays: sim.days() });
    }

    expect(worldY(handle.axisGroup).angleTo(initialAxis)).toBeLessThan(1e-9);
    expect(worldY(handle.surface).angleTo(initialAxis)).toBeLessThan(1e-9);
  });

  it('сохраняет положительные равные масштабы и определитель +1', () => {
    const handle = makeHandle();
    const controller = createSpinController(handle, spec(), new SimClock(1));

    controller.update(0, { simDays: 0 });

    const matrix = new THREE.Matrix4().makeRotationFromQuaternion(handle.surface.quaternion);

    expect(matrix.determinant()).toBeCloseTo(1, 12);
    for (const object of [handle.surface, handle.clouds, handle.atmosphere]) {
      if (object === null) continue;
      expect(object.scale.x).toBeGreaterThan(0);
      expect(object.scale.y).toBe(object.scale.x);
      expect(object.scale.z).toBe(object.scale.x);
    }
  });
});

describe('createSpinController — углы', () => {
  it('assumed: за 24 часа поверхность делает полный оборот', () => {
    const handle = makeHandle();
    const sim = new SimClock(4);
    const controller = createSpinController(
      handle,
      spec({ mode: 'assumed', periodDays: 1, theta0: 1.2 }),
      sim,
    );

    for (let hour = 0; hour < 240; hour += 1) {
      sim.advance(0.1);
      controller.update(0.1, {});
    }

    const angle = new THREE.Quaternion()
      .setFromAxisAngle(new THREE.Vector3(0, 1, 0), 1.2)
      .angleTo(handle.surface.quaternion);

    expect(angle).toBeLessThan(1e-9);
  });

  it('locked: за P суток поверхность делает полный оборот', () => {
    const handle = makeHandle();
    const sim = new SimClock(4);
    const controller = createSpinController(
      handle,
      spec({ mode: 'locked', periodDays: 4, theta0: Math.PI }),
      sim,
    );

    for (let step = 0; step < 40; step += 1) sim.advance(0.1);

    controller.update(0, { simDays: 4 });

    const angle = new THREE.Quaternion()
      .setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI)
      .angleTo(handle.surface.quaternion);

    expect(angle).toBeLessThan(1e-9);
  });

  it('направление прямое: угол растёт', () => {
    const handle = makeHandle();
    const sim = new SimClock(1);
    const controller = createSpinController(
      handle,
      spec({ mode: 'assumed', periodDays: 1, theta0: 0 }),
      sim,
    );

    sim.advance(0.1);
    controller.update(0.1, {});
    const first = handle.surface.quaternion.clone();

    sim.advance(0.1);
    controller.update(0.1, {});
    const second = handle.surface.quaternion.clone();

    const angle = first.angleTo(second);

    expect(angle).toBeGreaterThan(0);
  });
});

describe('createSpinController — приливной захват', () => {
  it('для круговой орбиты меридиан смотрит на звезду в пределах 3.1°', () => {
    const handle = makeHandle();
    const model = computeRotation({
      id: 'locked',
      P: {
        value: 4,
        provenance: null,
        source: null,
        sourceDate: null,
        fromBackup: false,
        alternatives: [],
      },
      R: {
        value: 1,
        provenance: null,
        source: null,
        sourceDate: null,
        fromBackup: false,
        alternatives: [],
      },
      st_teff: {
        value: 3500,
        provenance: null,
        source: null,
        sourceDate: null,
        fromBackup: false,
        alternatives: [],
      },
    });
    const sim = new SimClock(4);
    const controller = createSpinController(handle, model, sim);

    for (let index = 0; index < 200; index += 1) {
      const simDays = (index * 0.137) % 4;

      controller.update(0, { simDays });

      const position = positionAU(1, 0, simDays, 4);
      const toStar = new THREE.Vector3(-position[0], -position[1], -position[2]).normalize();
      const meridian = new THREE.Vector3(1, 0, 0)
        .applyQuaternion(handle.surface.quaternion)
        .applyQuaternion(handle.axisGroup.quaternion)
        .normalize();
      const angle = meridian.angleTo(toStar);

      expect(angle).toBeLessThanOrEqual((3.1 * Math.PI) / 180);
    }
  });
});

describe('createSpinController — независимость от FPS', () => {
  it('угол после 10 с одинаков при разных шагах', () => {
    const angles: number[] = [];

    for (const stepMs of [8, 16, 33, 90]) {
      const handle = makeHandle();
      const sim = new SimClock(4);
      const controller = createSpinController(
        handle,
        spec({ mode: 'assumed', periodDays: 1, theta0: 0.3 }),
        sim,
      );
      const step = stepMs / 1000;
      const steps = Math.round(7.92 / step);

      for (let index = 0; index < steps; index += 1) {
        sim.advance(step);
        controller.update(step, {});
      }

      angles.push(handle.surface.quaternion.angleTo(new THREE.Quaternion()));
    }

    for (const angle of angles) expect(angle).toBeCloseTo(angles[0] ?? 0, 9);
  });

  it('шаг 500 мс ограничивается 100 мс', () => {
    const clock = new SimClock(4);

    clock.advance(0.5);

    expect(clock.elapsedSeconds).toBeCloseTo(0.1, 12);
    expect(clock.spinHours()).toBeCloseTo(0.1, 12);
  });
});

describe('createSpinController — облака и сброс', () => {
  it('облака отстают от поверхности на 0.03·elapsedSec', () => {
    for (const mode of ['locked', 'assumed'] as const) {
      const handle = makeHandle();
      const sim = new SimClock(4);
      const controller = createSpinController(
        handle,
        spec({ mode, periodDays: mode === 'locked' ? 4 : 1 }),
        sim,
      );

      for (let step = 0; step < 50; step += 1) sim.advance(0.1);
      controller.update(0, { simDays: sim.days() });

      const relative = handle.surface.quaternion
        .clone()
        .invert()
        .multiply(handle.clouds?.quaternion ?? new THREE.Quaternion());
      const drift = 2 * Math.acos(Math.min(1, Math.abs(relative.w)));

      expect(drift).toBeCloseTo(CLOUD_DRIFT_RAD_PER_SEC * sim.elapsedSec, 9);
      expect(CLOUD_DRIFT_RAD_PER_SEC).toBe(0.03);
    }
  });

  it('reset возвращает theta0 и убирает дрейф облаков', () => {
    const handle = makeHandle();
    const sim = new SimClock(4);
    const controller = createSpinController(
      handle,
      spec({ mode: 'assumed', periodDays: 1, theta0: 0.7 }),
      sim,
    );

    sim.advance(5);
    controller.update(0, {});
    controller.reset();

    const theta = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.7);

    expect(handle.surface.quaternion.angleTo(theta)).toBeLessThan(1e-12);
    expect(handle.clouds?.quaternion.angleTo(theta)).toBeLessThan(1e-12);
  });

  it('dispose прекращает изменения, update становится no-op', () => {
    const handle = makeHandle();
    const sim = new SimClock(4);
    const controller = createSpinController(handle, spec(), sim);

    sim.advance(1);
    controller.update(0, {});
    const surface = handle.surface.quaternion.clone();
    const clouds = handle.clouds?.quaternion.clone();

    controller.dispose();
    sim.advance(5);
    controller.update(0, {});
    controller.reset();

    expect(handle.surface.quaternion.angleTo(surface)).toBeLessThan(1e-7);
    if (clouds !== undefined) {
      expect(handle.clouds?.quaternion.angleTo(clouds)).toBeLessThan(1e-7);
    }
  });
});
