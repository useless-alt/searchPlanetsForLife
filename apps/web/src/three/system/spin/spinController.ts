import { rotationAngle, type RotationSpec } from '@exo/shared';
import * as THREE from 'three';

import type { SimClock } from '../SimClock';
import type { PlanetVisualHandle, SpinController, SpinCtx } from '../visuals/types';

/**
 * Контроллер вращения планеты (задача 26; п. 9.3, 11.5; U53–U55).
 *
 * Угол считается из накопленного времени часов, а не из `dt`, поэтому
 * результат не зависит от частоты кадров. Наклон оси задаётся один раз
 * кватернионами `qAz · qTilt`; поверхность и облака вращаются вокруг
 * локальной оси Y. Таймеров и подписок контроллер не создаёт.
 */

/** Дрейф облаков относительно поверхности [рад/с]. */
export const CLOUD_DRIFT_RAD_PER_SEC = 0.03;

/** Переводит градусы в радианы. */
function radians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/** Ось вращения поверхности в локальной системе. */
const Y_AXIS = new THREE.Vector3(0, 1, 0);

/** Ось наклона. */
const X_AXIS = new THREE.Vector3(1, 0, 0);

/** Создаёт контроллер вращения для построенной планеты. */
export function createSpinController(
  handle: PlanetVisualHandle,
  spec: RotationSpec,
  sim: SimClock,
): SpinController {
  let surface: THREE.Mesh | null = handle.surface;
  let clouds: THREE.Mesh | null = handle.clouds;
  let disposed = false;

  // Наклон оси фиксирован в пространстве: qAz · qTilt.
  const azimuth = new THREE.Quaternion().setFromAxisAngle(Y_AXIS, radians(spec.tiltAzimuthDeg));
  const tilt = new THREE.Quaternion().setFromAxisAngle(X_AXIS, radians(spec.tiltDeg));

  handle.axisGroup.quaternion.copy(azimuth.multiply(tilt));

  const setAngles = (simDays: number, spinHours: number, elapsedSec: number): void => {
    if (surface !== null) {
      surface.quaternion.setFromAxisAngle(Y_AXIS, rotationAngle(spec, simDays, spinHours));
    }

    if (clouds !== null) {
      const surfaceAngle = rotationAngle(spec, simDays, spinHours);

      clouds.quaternion.setFromAxisAngle(
        Y_AXIS,
        surfaceAngle + CLOUD_DRIFT_RAD_PER_SEC * elapsedSec,
      );
    }
  };

  // Новый контроллер стартует с theta0, без накопленного дрейфа.
  setAngles(0, 0, 0);

  return {
    update(_dtSec: number, ctx: SpinCtx): void {
      if (disposed) return;

      setAngles(ctx.simDays ?? sim.days(), sim.spinHours(), sim.elapsedSec);
    },
    reset(): void {
      if (disposed) return;

      if (surface !== null) surface.quaternion.setFromAxisAngle(Y_AXIS, spec.theta0);
      if (clouds !== null) clouds.quaternion.setFromAxisAngle(Y_AXIS, spec.theta0);
    },
    dispose(): void {
      disposed = true;
      surface = null;
      clouds = null;
    },
  };
}
