import type { Vec3 } from '../galaxy/frames';

import {
  normalizeEccentricity,
  overviewPlanetDistance,
  type ScaleMode,
  type ScaleModel,
} from './scale';

/**
 * Чистые расчёты камеры 3D-сцены системы (задача 22; п. 9.1, 9.4, 10.9).
 *
 * Здесь нет Three.js и DOM: функции возвращают позу камеры, плоскости
 * отсечения и пределы OrbitControls. Это позволяет проверить обзорные
 * расстояния и ориентацию без WebGL.
 *
 * Направления по умолчанию выбраны так, чтобы звезда освещала планету
 * сбоку: вектор «камера − планета» строго перпендикулярен вектору
 * «звезда − планета». В обзоре камера поднята на 20°, у звезды — на 15°.
 */

/** Угол вертикального обзора камеры системы [°]. */
export const SYSTEM_CAMERA_FOV = 45;

/** Ближняя плоскость отсечения [единицы сцены]. */
export const SYSTEM_NEAR_PLANE = 0.01;

/** Дальняя плоскость отсечения: кратность протяжённости сцены. */
export const SYSTEM_FAR_FACTOR = 4;

/** Обзорное расстояние до планеты: кратность её радиуса. */
export const PLANET_OVERVIEW_DISTANCE_FACTOR = 6;

/** Расстояние до планеты в режиме 1:1: кратность её радиуса. */
export const PLANET_REAL_DISTANCE_FACTOR = 4;

/** Угол подъёма камеры над плоскостью орбиты у планеты [°]. */
export const PLANET_CAMERA_ANGLE_DEG = 20;

/** Минимальное обзорное расстояние до звезды: кратность её радиуса. */
export const STAR_OVERVIEW_MIN_FACTOR = 3.5;

/** Обзорное расстояние до звезды: кратность расстояния «звезда — планета». */
export const STAR_OVERVIEW_PLANET_FACTOR = 1.6;

/** Расстояние до звезды в режиме 1:1: кратность её радиуса. */
export const STAR_REAL_DISTANCE_FACTOR = 3;

/** Угол подъёма камеры над плоскостью орбиты у звезды [°]. */
export const STAR_CAMERA_ANGLE_DEG = 15;

/** Длительность перехода между целями камеры [мс] (п. 10.9). */
export const CAMERA_TRANSITION_MS = 900;

/** Минимальное расстояние OrbitControls: кратность радиуса цели. */
export const CAMERA_MIN_DISTANCE_FACTOR = 1.2;

/** Максимальное расстояние OrbitControls: кратность протяжённости сцены. */
export const CAMERA_MAX_DISTANCE_FACTOR = 4;

/** Цель камеры системы. */
export type SystemCameraTarget = 'planet' | 'star';

/** Положение камеры и точка, на которую она смотрит. */
export interface CameraPose {
  /** Положение камеры в сцене [единицы сцены]. */
  position: Vec3;
  /** Цель камеры в сцене [единицы сцены]. */
  target: Vec3;
}

/** Настройки OrbitControls сцены системы (п. 10.9). */
export interface SystemOrbitControlsPlan {
  /** Вращение включено. */
  enableRotate: boolean;
  /** Масштабирование включено. */
  enableZoom: boolean;
  /** Панорамирование отключено. */
  enablePan: boolean;
  /** Демпфирование включено. */
  enableDamping: boolean;
  /** Коэффициент демпфирования. */
  dampingFactor: number;
  /** Минимальное расстояние до цели. */
  minDistance: number;
  /** Максимальное расстояние до цели. */
  maxDistance: number;
}

/** Полный план камеры системы. */
export interface SystemCameraPlan extends CameraPose {
  /** Какая цель выбрана. */
  targetKind: SystemCameraTarget;
  /** Режим масштаба. */
  mode: ScaleMode;
  /** Расстояние от камеры до цели [единицы сцены]. */
  distance: number;
  /** Протяжённость сцены, по которой считается `far`. */
  extent: number;
  /** Ближняя плоскость отсечения. */
  near: number;
  /** Дальняя плоскость отсечения. */
  far: number;
  /** Настройки OrbitControls. */
  controls: SystemOrbitControlsPlan;
}

/** Входные данные плана камеры. */
export interface SystemCameraPlanInput {
  /** Цель камеры. */
  target: SystemCameraTarget;
  /** Режим масштаба. */
  mode: ScaleMode;
  /** Модель масштаба сцены. */
  model: ScaleModel;
  /** Большая полуось сцены [а.е.] (условная 1 при `d = null`). */
  dAU: number;
  /** Эксцентриситет орбиты. */
  e: number;
  /**
   * Текущее положение планеты в сцене [единицы сцены].
   * По умолчанию — перицентр на оси +X.
   */
  planetPosition?: Vec3;
  /** Внешняя граница зоны обитаемости [а.е.]; null — зона недоступна. */
  hzOutAU?: number | null;
}

/** Входные данные без цели — для отдельных функций планеты и звезды. */
export type CameraPlacementInput = Omit<SystemCameraPlanInput, 'target'>;

/** Ограничивает значение диапазоном. */
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Длина вектора. */
function length(vector: Vec3): number {
  return Math.hypot(vector.x, vector.y, vector.z);
}

/** Единичный вектор; нулевой вектор заменяется направлением `fallback`. */
function normalize(vector: Vec3, fallback: Vec3): Vec3 {
  const magnitude = length(vector);

  if (!Number.isFinite(magnitude) || magnitude === 0) return { ...fallback };

  return {
    x: vector.x / magnitude,
    y: vector.y / magnitude,
    z: vector.z / magnitude,
  };
}

/** Векторное произведение. */
function cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

/** Единичный вектор оси Y. */
const Y_AXIS: Vec3 = { x: 0, y: 1, z: 0 };

/** Запасное направление, если планета совпала с началом координат. */
const FALLBACK_DIRECTION: Vec3 = { x: 1, y: 0, z: 0 };

/** Переводит угол [°] в радианы. */
function radians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * Положение планеты по умолчанию: перицентр на оси +X (U49).
 *
 * @param input Данные плана.
 */
export function defaultPlanetPosition(input: CameraPlacementInput): Vec3 {
  const distanceAU = Number.isFinite(input.dAU) && input.dAU > 0 ? input.dAU : 1;

  return { x: distanceAU * input.model.unitsPerAU, y: 0, z: 0 };
}

/**
 * Направление от цели к камере под заданным углом над плоскостью XZ.
 *
 * `perp` — единичный перпендикуляр к направлению на второе тело.
 */
function elevatedDirection(axis: Vec3, angleDeg: number): Vec3 {
  const perpendicular = normalize(cross(Y_AXIS, axis), FALLBACK_DIRECTION);
  const angle = radians(angleDeg);
  const horizontal = Math.cos(angle);
  const vertical = Math.sin(angle);

  return {
    x: perpendicular.x * horizontal,
    y: vertical,
    z: perpendicular.z * horizontal,
  };
}

/**
 * Протяжённость сцены для дальней плоскости отсечения (п. 9.1):
 *
 *   extent = max(unitsPerAU · d · (1 + e),
 *                unitsPerAU · d_out  — если зона доступна,
 *                starRadius · 3)
 *
 * @param input Данные плана.
 */
export function cameraExtent(input: CameraPlacementInput): number {
  const distanceAU = Number.isFinite(input.dAU) && input.dAU > 0 ? input.dAU : 1;
  const eccentricity = normalizeEccentricity(input.e);
  const orbitExtent = input.model.unitsPerAU * distanceAU * (1 + eccentricity);
  const hzOut = input.hzOutAU;

  const hzExtent =
    hzOut !== null && hzOut !== undefined && Number.isFinite(hzOut) && hzOut > 0
      ? input.model.unitsPerAU * hzOut
      : 0;

  return Math.max(orbitExtent, hzExtent, input.model.starRadius * 3);
}

/** Собирает OrbitControls по расстоянию до цели и протяжённости сцены. */
function controlsPlan(targetRadius: number, extent: number): SystemOrbitControlsPlan {
  return {
    enableRotate: true,
    enableZoom: true,
    enablePan: false,
    enableDamping: true,
    dampingFactor: 0.08,
    minDistance: CAMERA_MIN_DISTANCE_FACTOR * targetRadius,
    maxDistance: CAMERA_MAX_DISTANCE_FACTOR * extent,
  };
}

/** Собирает полный план из позы и служебных полей. */
function buildPlan(
  input: SystemCameraPlanInput,
  targetKind: SystemCameraTarget,
  pose: CameraPose,
  distance: number,
  targetRadius: number,
): SystemCameraPlan {
  const extent = cameraExtent(input);

  return {
    ...pose,
    targetKind,
    mode: input.mode,
    distance,
    extent,
    near: SYSTEM_NEAR_PLANE,
    far: SYSTEM_FAR_FACTOR * extent,
    controls: controlsPlan(targetRadius, extent),
  };
}

/**
 * План камеры у планеты (п. 10.9.3, 10.9.4).
 *
 * В обзоре расстояние равно `6 · R`, в 1:1 — `4 · R`. Камера поднята на 20°
 * над плоскостью орбиты, а её горизонтальное направление перпендикулярно
 * направлению на звезду.
 *
 * @param input Данные плана без цели.
 */
export function planetCameraPlan(input: CameraPlacementInput): SystemCameraPlan {
  const planetPosition = input.planetPosition ?? defaultPlanetPosition(input);
  const starPosition: Vec3 = { x: 0, y: 0, z: 0 };
  const toStar = normalize(
    {
      x: starPosition.x - planetPosition.x,
      y: starPosition.y - planetPosition.y,
      z: starPosition.z - planetPosition.z,
    },
    FALLBACK_DIRECTION,
  );
  const direction = elevatedDirection(toStar, PLANET_CAMERA_ANGLE_DEG);
  const distance =
    (input.mode === 'real' ? PLANET_REAL_DISTANCE_FACTOR : PLANET_OVERVIEW_DISTANCE_FACTOR) *
    input.model.planetRadius;

  return buildPlan(
    { ...input, target: 'planet' },
    'planet',
    {
      position: {
        x: planetPosition.x + direction.x * distance,
        y: planetPosition.y + direction.y * distance,
        z: planetPosition.z + direction.z * distance,
      },
      target: { ...planetPosition },
    },
    distance,
    input.model.planetRadius,
  );
}

/**
 * План камеры у звезды (п. 10.9.5, 10.9.6).
 *
 * В обзоре расстояние равно `max(3.5 · R★, 1.6 · D)`, в 1:1 — `3 · R★`.
 * Камера поднята на 15° над плоскостью орбиты.
 *
 * @param input Данные плана без цели.
 */
export function starCameraPlan(input: CameraPlacementInput): SystemCameraPlan {
  const planetPosition = input.planetPosition ?? defaultPlanetPosition(input);
  const toPlanet = normalize(planetPosition, FALLBACK_DIRECTION);
  const direction = elevatedDirection(toPlanet, STAR_CAMERA_ANGLE_DEG);
  const distanceAU = Number.isFinite(input.dAU) && input.dAU > 0 ? input.dAU : 1;
  const distance =
    input.mode === 'real'
      ? STAR_REAL_DISTANCE_FACTOR * input.model.starRadius
      : Math.max(
          STAR_OVERVIEW_MIN_FACTOR * input.model.starRadius,
          STAR_OVERVIEW_PLANET_FACTOR * overviewPlanetDistance(input.model.starRadius, distanceAU),
        );

  return buildPlan(
    { ...input, target: 'star' },
    'star',
    {
      position: {
        x: direction.x * distance,
        y: direction.y * distance,
        z: direction.z * distance,
      },
      target: { x: 0, y: 0, z: 0 },
    },
    distance,
    input.model.starRadius,
  );
}

/**
 * План камеры для текущей цели (п. 10.9; U47).
 *
 * @param input Цель, режим, модель и положение планеты.
 */
export function systemCameraPlan(input: SystemCameraPlanInput): SystemCameraPlan {
  return input.target === 'star' ? starCameraPlan(input) : planetCameraPlan(input);
}

/**
 * Линейно интерполирует позу камеры.
 *
 * @param from Начальная поза.
 * @param to Конечная поза.
 * @param progress Прогресс 0…1.
 */
export function interpolateCameraPose(
  from: CameraPose,
  to: CameraPose,
  progress: number,
): CameraPose {
  const t = clamp(progress, 0, 1);

  return {
    position: {
      x: from.position.x + (to.position.x - from.position.x) * t,
      y: from.position.y + (to.position.y - from.position.y) * t,
      z: from.position.z + (to.position.z - from.position.z) * t,
    },
    target: {
      x: from.target.x + (to.target.x - from.target.x) * t,
      y: from.target.y + (to.target.y - from.target.y) * t,
      z: from.target.z + (to.target.z - from.target.z) * t,
    },
  };
}

/**
 * Кривая ease-in-out для перехода камеры.
 *
 * @param progress Прогресс 0…1.
 */
export function easeInOut(progress: number): number {
  const t = clamp(progress, 0, 1);

  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}
