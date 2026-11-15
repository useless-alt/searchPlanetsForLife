import type { ResolvedPlanet } from '../types/solver';

import { fnv1a32, mulberry32 } from './hash';
import type { PlanetStyle } from './worldStyle';

/**
 * Модель вращения планеты (задача 26; п. 9.3, 11.5; U53–U55).
 *
 * В каталогах нет периода вращения, поэтому он выводится из орбиты и типа
 * мира. Все числа детерминированы: одинаковый `id` и данные всегда дают
 * одинаковый наклон, азимут и начальную фазу.
 */

/** Режим вращения. */
export type RotationMode = 'locked' | 'assumed';

/** Причина выбранного режима. */
export type RotationReason = 'close_orbit' | 'red_dwarf' | 'default';

/** Готовая модель вращения. */
export interface RotationSpec {
  /** Приливной захват или условное вращение. */
  mode: RotationMode;
  /** Период вращения [сут]. */
  periodDays: number;
  /** Направление: +1 — прямое вращение. */
  direction: 1;
  /** Наклон оси [°]. */
  tiltDeg: number;
  /** Азимут наклона [°]. */
  tiltAzimuthDeg: number;
  /** Причина режима. */
  reason: RotationReason;
  /** Начальный угол поверхности [рад]. */
  theta0: number;
}

/** Полный оборот [рад]. */
const TAU = Math.PI * 2;

/** Порог «близкой орбиты» [сут] (U53). */
export const LOCKED_CLOSE_ORBIT_DAYS = 10;

/** Порог красного карлика [K] (U53). */
export const RED_DWARF_TEFF = 3900;

/** Порог красного карлика по периоду [сут] (U53). */
export const RED_DWARF_MAX_PERIOD_DAYS = 60;

/** Границы наклонов [°]. */
export const TILT_RANGES = {
  locked: [0, 3],
  rocky: [5, 30],
  miniNeptune: [5, 25],
  gasGiant: [1, 27],
} as const satisfies Record<string, readonly [number, number]>;

/** Класс мира для выбора диапазона наклона. */
type TiltGroup = 'locked' | 'rocky' | 'miniNeptune' | 'gasGiant';

/** Известный период? */
function knownPeriod(value: number | null): value is number {
  return value !== null && Number.isFinite(value) && value > 0;
}

/** Радиус с безопасным значением по умолчанию. */
function safeRadius(value: number | null): number {
  return value !== null && Number.isFinite(value) && value > 0 ? value : 1;
}

/** Класс для диапазона наклона. */
function tiltGroup(
  resolved: Pick<ResolvedPlanet, 'R'>,
  styleOrSeed: PlanetStyle | number | null | undefined,
  locked: boolean,
): TiltGroup {
  if (locked) return 'locked';

  if (styleOrSeed !== null && typeof styleOrSeed === 'object') {
    switch (styleOrSeed.kind) {
      case 'mini_neptune':
        return 'miniNeptune';
      case 'gas_giant':
        return 'gasGiant';
      default:
        return 'rocky';
    }
  }

  const radius = safeRadius(resolved.R.value);

  if (radius > 6) return 'gasGiant';
  if (radius > 1.65) return 'miniNeptune';

  return 'rocky';
}

/** Период условного вращения [сут]. */
export function assumedRotationPeriodDays(radius: number | null): number {
  const value = safeRadius(radius);

  if (value > 6) return 10 / 24;
  if (value > 1.65) return 16 / 24;

  return 1;
}

/** Равномерное значение в диапазоне. */
function between(random: number, range: readonly [number, number]): number {
  return range[0] + (range[1] - range[0]) * random;
}

/**
 * Строит модель вращения планеты.
 *
 * @param resolved Разрешённые параметры (`id`, `P`, `R`, `st_teff`).
 * @param styleOrSeed Стиль планеты или явный seed для процедурных значений.
 */
export function computeRotation(
  resolved: Pick<ResolvedPlanet, 'id' | 'P' | 'R' | 'st_teff'>,
  styleOrSeed?: PlanetStyle | number | null,
): RotationSpec {
  const period = resolved.P.value;
  const teff = resolved.st_teff.value;
  const hasCloseOrbit = knownPeriod(period) && period < LOCKED_CLOSE_ORBIT_DAYS;
  const hasRedDwarfLock =
    !hasCloseOrbit &&
    teff !== null &&
    Number.isFinite(teff) &&
    teff < RED_DWARF_TEFF &&
    knownPeriod(period) &&
    period < RED_DWARF_MAX_PERIOD_DAYS;
  const mode: RotationMode = hasCloseOrbit || hasRedDwarfLock ? 'locked' : 'assumed';
  const reason: RotationReason = hasCloseOrbit
    ? 'close_orbit'
    : hasRedDwarfLock
      ? 'red_dwarf'
      : 'default';
  const periodDays = knownPeriod(period)
    ? mode === 'locked'
      ? period
      : assumedRotationPeriodDays(resolved.R.value)
    : assumedRotationPeriodDays(resolved.R.value);

  const seed = typeof styleOrSeed === 'number' ? styleOrSeed >>> 0 : fnv1a32(`${resolved.id}:spin`);
  const random = mulberry32(seed);
  const group = tiltGroup(resolved, styleOrSeed, mode === 'locked');
  const tilt = between(random(), TILT_RANGES[group]);
  // Для приливного захвата азимут наклона 0: нулевой меридиан должен
  // смотреть на звезду без дополнительного поворота вокруг оси Y.
  const azimuth = mode === 'locked' ? 0 : 360 * random();
  const theta0 = mode === 'locked' ? Math.PI : TAU * random();

  return {
    mode,
    periodDays,
    direction: 1,
    tiltDeg: tilt,
    tiltAzimuthDeg: azimuth,
    reason,
    theta0,
  };
}

/**
 * Угол поверхности на заданный момент.
 *
 * `locked` использует модельные сутки орбиты, `assumed` — часы вращения.
 *
 * @param spec Модель вращения.
 * @param simDays Прошедшие модельные сутки.
 * @param spinHours Накопленные часы вращения.
 */
export function rotationAngle(spec: RotationSpec, simDays: number, spinHours: number): number {
  if (spec.mode === 'locked') {
    return spec.theta0 + (TAU * simDays) / spec.periodDays;
  }

  return spec.theta0 + (TAU * spinHours) / (24 * spec.periodDays);
}

/** Псевдоним `rotationAngle` по имени из спецификации. */
export const spinAngle = rotationAngle;
