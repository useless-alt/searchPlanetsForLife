import type { Vec3 } from '@exo/shared';

/**
 * Чистые расчёты камеры 3D-карты Галактики (задача 21; п. 6.1, 10.8).
 *
 * Здесь нет Three.js и DOM: функции возвращают положения и длительности,
 * которые применяет `GalaxyRenderer`. Это позволяет проверить масштаб,
 * ограничения и перелёты без WebGL.
 */

/** Доля 95-го процентиля расстояний для обзорного положения. */
export const OVERVIEW_DISTANCE_FACTOR = 2.2;

/** Угол направления взгляда к плоскости Галактики [°]. */
export const OVERVIEW_ANGLE_DEG = 35;

/** Минимальное расстояние камеры OrbitControls [пк]. */
export const MIN_CAMERA_DISTANCE = 0.05;

/** Множитель `radiusMax` для дальнего предела камеры. */
export const MAX_CAMERA_DISTANCE_FACTOR = 4;

/** Множитель `radiusMax` для дальней плоскости отсечения. */
export const FAR_PLANE_FACTOR = 20;

/** Ближняя плоскость отсечения [пк]. */
export const NEAR_PLANE = 0.01;

/** Длительность анимации фокуса [мс]. */
export const FOCUS_DURATION_MS = 800;

/** Длительность перелёта к системе [мс]. */
export const FLY_DURATION_MS = 1200;

/** Доля расстояния до системы для фокуса. */
export const FOCUS_DISTANCE_FACTOR = 0.15;

/** Минимальное расстояние фокуса [пк]. */
export const FOCUS_MIN_DISTANCE = 2;

/** Максимальное расстояние фокуса [пк]. */
export const FOCUS_MAX_DISTANCE = 60;

/** Расстояние перелёта к системе [пк]. */
export const FLY_DISTANCE = 0.5;

/** Кривая анимации камеры. */
export type CameraEasing = 'ease-in-out';

/** Положение камеры и точка, на которую она смотрит. */
export interface CameraPose {
  /** Положение камеры в сцене [пк]. */
  position: Vec3;
  /** Цель камеры в сцене [пк]. */
  target: Vec3;
}

/** Настройки OrbitControls (п. 6.1, 10.8.3). */
export interface OrbitControlsPlan {
  /** Включено вращение. */
  enableRotate: boolean;
  /** Включено масштабирование. */
  enableZoom: boolean;
  /** Включено панорамирование. */
  enablePan: boolean;
  /** Включено демпфирование. */
  enableDamping: boolean;
  /** Коэффициент демпфирования. */
  dampingFactor: number;
  /** Минимальное расстояние [пк]. */
  minDistance: number;
  /** Максимальное расстояние [пк]. */
  maxDistance: number;
}

/** Обзорное положение камеры. */
export interface OverviewCameraPlan extends CameraPose {
  /** Расстояние от цели до камеры [пк]. */
  distance: number;
  /** Ближняя плоскость отсечения [пк]. */
  near: number;
  /** Дальняя плоскость отсечения [пк]. */
  far: number;
  /** Настройки OrbitControls. */
  controls: OrbitControlsPlan;
}

/** План анимации камеры. */
export interface CameraMovePlan extends CameraPose {
  /** Расстояние от цели до камеры [пк]. */
  distance: number;
  /** Длительность анимации [мс]; 0 — без анимации. */
  durationMs: number;
  /** Кривая анимации. */
  easing: CameraEasing;
  /** Нужно ли анимировать переход. */
  animate: boolean;
}

/** Параметры фокуса и перелёта. */
export interface CameraMoveOptions {
  /** `prefers-reduced-motion`: переход без анимации (U55). */
  reducedMotion?: boolean;
  /** Направление, с которого камера подходит к цели. */
  direction?: Vec3;
}

/** Ограничивает значение диапазоном. */
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Длина вектора. */
function length(vector: Vec3): number {
  return Math.hypot(vector.x, vector.y, vector.z);
}

/** Единичный вектор; нулевой вектор заменяется обзорным направлением. */
function normalize(vector: Vec3): Vec3 {
  const magnitude = length(vector);

  if (magnitude === 0) return { ...OVERVIEW_DIRECTION };

  return {
    x: vector.x / magnitude,
    y: vector.y / magnitude,
    z: vector.z / magnitude,
  };
}

/** Направление обзора: 35° над плоскостью Галактики (XZ сцены). */
const OVERVIEW_DIRECTION: Vec3 = {
  x: 0,
  y: Math.sin((OVERVIEW_ANGLE_DEG * Math.PI) / 180),
  z: Math.cos((OVERVIEW_ANGLE_DEG * Math.PI) / 180),
};

/** Вычисляет обзорное положение камеры над центром Галактики. */
export function overviewCameraPlan(radiusP95: number, radiusMax: number): OverviewCameraPlan {
  const distance = OVERVIEW_DISTANCE_FACTOR * radiusP95;

  return {
    target: { x: 0, y: 0, z: 0 },
    position: {
      x: OVERVIEW_DIRECTION.x * distance,
      y: OVERVIEW_DIRECTION.y * distance,
      z: OVERVIEW_DIRECTION.z * distance,
    },
    distance,
    near: NEAR_PLANE,
    far: FAR_PLANE_FACTOR * radiusMax,
    controls: {
      enableRotate: true,
      enableZoom: true,
      enablePan: true,
      enableDamping: true,
      dampingFactor: 0.08,
      minDistance: MIN_CAMERA_DISTANCE,
      maxDistance: MAX_CAMERA_DISTANCE_FACTOR * radiusMax,
    },
  };
}

/**
 * Положение камеры при фокусе на системе (п. 10.8.5).
 *
 * Цель — сама система, расстояние `clamp(0.15 * |position|, 2, 60)` пк.
 * Без `direction` камера подходит со стороны Земли (по радиус-вектору).
 */
export function focusPlan(position: Vec3, options: CameraMoveOptions = {}): CameraMovePlan {
  const distance = clamp(
    FOCUS_DISTANCE_FACTOR * length(position),
    FOCUS_MIN_DISTANCE,
    FOCUS_MAX_DISTANCE,
  );
  const direction = normalize(options.direction ?? position);
  const reducedMotion = options.reducedMotion ?? false;

  return {
    target: { ...position },
    position: {
      x: position.x + direction.x * distance,
      y: position.y + direction.y * distance,
      z: position.z + direction.z * distance,
    },
    distance,
    durationMs: reducedMotion ? 0 : FOCUS_DURATION_MS,
    easing: 'ease-in-out',
    animate: !reducedMotion,
  };
}

/**
 * План перелёта к системе (п. 10.8.6): 0.5 пк за 1200 мс.
 *
 * @param position Позиция системы в сцене [пк].
 * @param options Направление подлёта и режим уменьшенного движения.
 */
export function flyToSystem(position: Vec3, options: CameraMoveOptions = {}): CameraMovePlan {
  const direction = normalize(options.direction ?? position);
  const reducedMotion = options.reducedMotion ?? false;

  return {
    target: { ...position },
    position: {
      x: position.x + direction.x * FLY_DISTANCE,
      y: position.y + direction.y * FLY_DISTANCE,
      z: position.z + direction.z * FLY_DISTANCE,
    },
    distance: FLY_DISTANCE,
    durationMs: reducedMotion ? 0 : FLY_DURATION_MS,
    easing: 'ease-in-out',
    animate: !reducedMotion,
  };
}

/** Псевдоним `flyToSystem` для явного имени плана в рендерере. */
export const flyToSystemPlan = flyToSystem;

/**
 * Кривая ease-in-out для анимации камеры.
 *
 * @param progress Прогресс 0…1.
 * @returns Сглаженный прогресс 0…1.
 */
export function easeInOut(progress: number): number {
  const t = clamp(progress, 0, 1);

  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}
