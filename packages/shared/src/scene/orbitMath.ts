import type { ResolvedPlanet } from '../types/solver';

import type { ScaleModel } from './scale';

/**
 * Кеплеровская геометрия орбиты 3D-сцены (задача 23; п. 11.3; U46, U49).
 *
 * Все функции чистые, единицы — астрономические единицы и сутки. Орбита
 * лежит в плоскости XZ сцены (U49): звезда находится в начале координат,
 * перицентр — на оси +X, движение идёт против часовой стрелки при взгляде
 * сверху. Положение планеты и линия орбиты считаются одной и той же парой
 * формул, поэтому планета всегда лежит на нарисованном эллипсе.
 */

/** Полный оборот [рад]. */
const TAU = Math.PI * 2;

/** Допуск сходимости метода Ньютона для уравнения Кеплера [рад]. */
export const KEPLER_EPSILON = 1e-12;

/** Максимальное число итераций метода Ньютона. */
export const KEPLER_MAX_ITERATIONS = 30;

/** Порог эксцентриситета, выше которого начальное приближение равно π. */
export const KEPLER_HIGH_ECCENTRICITY = 0.8;

/** Число точек эллипса при умеренном эксцентриситете. */
export const ELLIPSE_SAMPLES_DEFAULT = 360;

/** Число точек эллипса при высоком эксцентриситете. */
export const ELLIPSE_SAMPLES_HIGH = 720;

/** Точка в пространстве сцены: `[x, y, z]`. */
export type OrbitPoint = [number, number, number];

/** Причина недоступности орбиты (тексты — в `apps/web/src/i18n/ru.ts`). */
export type OrbitUnavailableReason = 'missing-axis' | 'nominal';

/** Результат проверки доступности орбиты. */
export interface OrbitAvailability {
  /** Орбиту можно построить и по ней можно двигать планету. */
  available: boolean;
  /** Причина недоступности; null — орбита доступна. */
  reason: OrbitUnavailableReason | null;
}

/** Приводит угол к диапазону `[0, 2π)`. */
export function normalizeAngle(angle: number): number {
  if (!Number.isFinite(angle)) return 0;

  const normalized = angle % TAU;

  return normalized < 0 ? normalized + TAU : normalized;
}

/** Проверяет, что значение эксцентриситета физично для эллипса. */
function isEllipticEccentricity(eccentricity: number): boolean {
  return Number.isFinite(eccentricity) && eccentricity >= 0 && eccentricity < 1;
}

/**
 * Решает уравнение Кеплера `M = E − e·sin E` методом Ньютона (п. 11.3).
 *
 * Средняя аномалия приводится к `[0, 2π)`. Начальное приближение — `E = M`
 * при `e < 0.8`, иначе `E = π` (для вытянутых орбит так сходится устойчивее).
 * Итерации прекращаются при `|ΔE| < 1e-12` или после 30 шагов.
 *
 * @param meanAnomalyM Средняя аномалия [рад]; любое конечное значение.
 * @param eccentricity Эксцентриситет; нефизичное значение считается нулём.
 * @returns Эксцентрическая аномалия [рад].
 */
export function solveKepler(meanAnomalyM: number, eccentricity: number): number {
  const e = isEllipticEccentricity(eccentricity) ? eccentricity : 0;
  const mean = normalizeAngle(meanAnomalyM);

  if (e === 0) return mean;

  let eccentricAnomaly = e < KEPLER_HIGH_ECCENTRICITY ? mean : Math.PI;

  for (let iteration = 0; iteration < KEPLER_MAX_ITERATIONS; iteration += 1) {
    const denominator = 1 - e * Math.cos(eccentricAnomaly);
    const correction = (eccentricAnomaly - e * Math.sin(eccentricAnomaly) - mean) / denominator;

    eccentricAnomaly -= correction;

    if (Math.abs(correction) < KEPLER_EPSILON) break;
  }

  return eccentricAnomaly;
}

/**
 * Положение планеты на орбите в плоскости XZ сцены (U49).
 *
 * Средняя аномалия `M = 2π·(simDays / P)`; при неизвестном периоде
 * `M = 0`, то есть планета стоит в перицентре (U46). Координаты:
 *
 *   x = a·(cos E − e)
 *   y = a·√(1 − e²)·sin E
 *   результат = [x, 0, −y]
 *
 * @param semiMajorAxisAU Большая полуось [а.е.].
 * @param eccentricity Эксцентриситет `[0, 1)`.
 * @param simDays Прошедшие модельные сутки.
 * @param periodDays Период обращения [сут] или null.
 * @returns Точка `[x, 0, z]` в астрономических единицах.
 */
export function positionAU(
  semiMajorAxisAU: number,
  eccentricity: number,
  simDays: number,
  periodDays: number | null,
): OrbitPoint {
  if (!Number.isFinite(semiMajorAxisAU) || semiMajorAxisAU <= 0) return [0, 0, 0];

  const a = semiMajorAxisAU;
  const e = isEllipticEccentricity(eccentricity) ? eccentricity : 0;
  const hasPeriod = periodDays !== null && Number.isFinite(periodDays) && periodDays > 0;
  const days = Number.isFinite(simDays) ? simDays : 0;
  const meanAnomaly = hasPeriod ? TAU * (days / periodDays) : 0;
  const eccentricAnomaly = solveKepler(meanAnomaly, e);
  const x = a * (Math.cos(eccentricAnomaly) - e);
  const y = a * Math.sqrt(1 - e * e) * Math.sin(eccentricAnomaly);

  return [finiteOrZero(x), 0, finiteOrZero(-y)];
}

/** Заменяет нечисловое значение нулём (инвариант shared, п. 1.4). */
function finiteOrZero(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

/**
 * Число точек контура эллипса для заданного эксцентриситета.
 *
 * При `e ≤ 0.8` хватает 360 точек, при большей вытянутости — 720.
 *
 * @param eccentricity Эксцентриситет.
 */
export function ellipseSampleCount(eccentricity: number): number {
  return eccentricity > KEPLER_HIGH_ECCENTRICITY ? ELLIPSE_SAMPLES_HIGH : ELLIPSE_SAMPLES_DEFAULT;
}

/**
 * Замкнутый контур эллипса по эксцентрической аномалии.
 *
 * Точки `E_k = 2πk/n` для `k = 0…n−1`; последняя точка не повторяет первую
 * (замыкание выполняет потребитель). Фокус — звезда — в начале координат,
 * перицентр на +X, поэтому центр эллипса смещён на `−a·e` по X.
 *
 * @param semiMajorAxisAU Большая полуось [а.е.].
 * @param eccentricity Эксцентриситет `[0, 1)`.
 * @param count Число точек; по умолчанию зависит от эксцентриситета.
 * @returns Точки `[x, 0, z]` в астрономических единицах.
 */
export function sampleEllipse(
  semiMajorAxisAU: number,
  eccentricity: number,
  count?: number,
): OrbitPoint[] {
  if (!Number.isFinite(semiMajorAxisAU) || semiMajorAxisAU <= 0) return [];

  const e = isEllipticEccentricity(eccentricity) ? eccentricity : 0;
  const requested = count ?? ellipseSampleCount(e);

  if (!Number.isFinite(requested) || requested < 3) return [];

  const n = Math.floor(requested);
  const points: OrbitPoint[] = [];
  const minorFactor = Math.sqrt(1 - e * e);

  for (let index = 0; index < n; index += 1) {
    const eccentricAnomaly = (TAU * index) / n;
    const x = semiMajorAxisAU * (Math.cos(eccentricAnomaly) - e);
    const y = semiMajorAxisAU * minorFactor * Math.sin(eccentricAnomaly);

    points.push([finiteOrZero(x), 0, finiteOrZero(-y)]);
  }

  return points;
}

/**
 * Проверяет, можно ли показать орбиту и двигать по ней планету (п. 11.3).
 *
 * Орбита доступна, если большая полуось `d` конечна и положительна,
 * эксцентриситет лежит в `[0, 1)` (отсутствующий считается нулевым — орбита
 * круглая, как в модели масштаба) и расстояние в модели не условное
 * (`scale.nominal = false`).
 *
 * @param resolved Разрешённые параметры планеты.
 * @param scale Модель масштаба (достаточно признака `nominal`).
 */
export function orbitAvailability(
  resolved: Pick<ResolvedPlanet, 'd' | 'e'>,
  scale: Pick<ScaleModel, 'nominal'>,
): OrbitAvailability {
  const distance = resolved.d.value;
  const eccentricity = resolved.e.value ?? 0;

  if (distance === null || !Number.isFinite(distance) || distance <= 0) {
    return { available: false, reason: 'missing-axis' };
  }

  if (!isEllipticEccentricity(eccentricity)) {
    return { available: false, reason: 'missing-axis' };
  }

  if (scale.nominal) {
    return { available: false, reason: 'nominal' };
  }

  return { available: true, reason: null };
}
