import type { ResolvedPlanet } from '../types/solver';

import {
  AU_IN_REARTH,
  OV_PERI_CLEAR,
  OV_PLANET_RADIUS,
  OV_RATIO_MAX,
  OV_RATIO_MIN,
  RSUN_IN_REARTH,
} from './constants';
import { finitePositive, starRadiusSolar } from './starRadius';

/**
 * Модель масштаба 3D-сцены системы (задача 22; п. 9.1, 9.4; U46–U50).
 *
 * Два режима:
 *
 * - `real` — 1:1, единица сцены равна радиусу Земли. Планета и звезда имеют
 *   настоящие размеры, расстояния переводятся через `AU_IN_REARTH`.
 * - `overview` — обзорный режим с логарифмическим сжатием расстояний.
 *   Радиус планеты-заглушки равен 1, отношение радиусов звезды и планеты
 *   ограничено диапазоном `OV_RATIO_MIN…OV_RATIO_MAX`, а перицентр орбиты
 *   гарантированно не пересекает звезду.
 */

/** Режим масштаба сцены (п. 9.1, 9.4). */
export type ScaleMode = 'real' | 'overview';

/** Минимальный набор полей планеты для модели масштаба. */
export type ScaleInput = Pick<ResolvedPlanet, 'R' | 'd' | 'e' | 'L' | 'st_rad' | 'st_teff'>;

/** Готовая модель масштаба сцены. */
export interface ScaleModel {
  /** Выбранный режим. */
  mode: ScaleMode;
  /** Радиус планеты в единицах сцены. */
  planetRadius: number;
  /** Радиус звезды в единицах сцены. */
  starRadius: number;
  /** Сколько единиц сцены приходится на одну астрономическую единицу. */
  unitsPerAU: number;
  /** Расстояние до планеты условное: `d` отсутствует и принято равным 1 а.е. */
  nominal: boolean;
  /** Переводит расстояние из астрономических единиц в единицы сцены. */
  mapAU(radiusAU: number): number;
}

/** Ограничивает значение диапазоном. */
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Приводит эксцентриситет к допустимому диапазону `[0, 1)` (п. 9.1).
 *
 * Отсутствующее или нефизичное значение считается нулём: орбита круглая.
 *
 * @param value Эксцентриситет или null.
 * @returns Значение в диапазоне `[0, 1)`.
 */
export function normalizeEccentricity(value: number | null): number {
  if (value === null || !Number.isFinite(value) || value < 0 || value >= 1) return 0;

  return value;
}

/**
 * Эксцентриситет планеты в допустимом диапазоне `[0, 1)`.
 *
 * @param input Поля планеты.
 */
export function eccentricityOf(input: Pick<ScaleInput, 'e'>): number {
  return normalizeEccentricity(input.e?.value ?? null);
}

/**
 * Большая полуось орбиты для расчёта сцены [а.е.].
 *
 * Если `d` отсутствует, возвращается 1 а.е. и модель помечается `nominal`
 * (п. 9.1): положение планеты условное, орбита и зона обитаемости недоступны.
 *
 * @param input Поля планеты.
 */
export function distanceAUOf(input: Pick<ScaleInput, 'd'>): number {
  return finitePositive(input.d) ?? 1;
}

/**
 * Признак условного расстояния: `d` отсутствует или нефизично.
 *
 * @param input Поля планеты.
 */
export function isNominalDistance(input: Pick<ScaleInput, 'd'>): boolean {
  return finitePositive(input.d) === null;
}

/**
 * Логарифмический зазор между звездой и планетой в обзоре [единицы сцены]
 * (U48):
 *
 *   gap(d) = 4 + 6 · log10(1 + 10 · d)
 *
 * @param distanceAU Большая полуось [а.е.].
 */
export function overviewGap(distanceAU: number): number {
  const safeDistance = Number.isFinite(distanceAU) && distanceAU > 0 ? distanceAU : 1;

  return 4 + 6 * Math.log10(1 + 10 * safeDistance);
}

/**
 * Расстояние «звезда — планета» в обзорном режиме [единицы сцены]:
 * `D = starRadius + gap(d)` (U48).
 *
 * @param starRadius Радиус звезды в единицах сцены.
 * @param distanceAU Большая полуось [а.е.].
 */
export function overviewPlanetDistance(starRadius: number, distanceAU: number): number {
  return starRadius + overviewGap(distanceAU);
}

/**
 * Строит модель масштаба сцены (п. 9.1, 9.4; U48, U50).
 *
 * Если радиус звезды нельзя определить ни из `st_rad`, ни по закону
 * Стефана — Больцмана, модель не строится и возвращается null.
 *
 * @param input Разрешённые поля планеты.
 * @param mode Режим масштаба.
 * @returns Модель или null, если нет радиуса звезды.
 */
export function makeScaleModel(input: ScaleInput, mode: ScaleMode): ScaleModel | null {
  const starSolar = starRadiusSolar(input);

  if (starSolar === null) return null;

  const planetRadiusReal = finitePositive(input.R) ?? OV_PLANET_RADIUS;
  const distanceAU = distanceAUOf(input);
  const nominal = isNominalDistance(input);
  const eccentricity = eccentricityOf(input);

  if (mode === 'real') {
    const unitsPerAU = AU_IN_REARTH;
    const starRadius = starSolar * RSUN_IN_REARTH;

    if (!Number.isFinite(starRadius) || starRadius <= 0) return null;

    return {
      mode,
      planetRadius: planetRadiusReal,
      starRadius,
      unitsPerAU,
      nominal,
      mapAU(radiusAU: number): number {
        return unitsPerAU * radiusAU;
      },
    };
  }

  // В обзоре размер планеты нормализован, поэтому отношение радиусов
  // совпадает с радиусом звезды в единицах сцены.
  const ratio = clamp((starSolar * RSUN_IN_REARTH) / planetRadiusReal, OV_RATIO_MIN, OV_RATIO_MAX);
  const starRadius = ratio;
  const planetDistance = overviewPlanetDistance(starRadius, distanceAU);

  // Два ограничения: планета не должна «сидеть» в звезде (D/d) и перицентр
  // эллипса не должен задевать звезду (U48). Второе слагаемое при e = 0
  // совпадает с первым с точностью до OV_PERI_CLEAR.
  const unitsPerAU = Math.max(
    planetDistance / distanceAU,
    (starRadius + OV_PERI_CLEAR) / (distanceAU * (1 - eccentricity)),
  );

  if (!Number.isFinite(unitsPerAU) || unitsPerAU <= 0) return null;

  return {
    mode,
    planetRadius: OV_PLANET_RADIUS,
    starRadius,
    unitsPerAU,
    nominal,
    mapAU(radiusAU: number): number {
      return unitsPerAU * radiusAU;
    },
  };
}

/**
 * Проверяет, что модель масштаба конечна и пригодна для отрисовки.
 *
 * @param model Модель или null.
 */
export function isScaleModelFinite(model: ScaleModel | null): model is ScaleModel {
  if (model === null) return false;

  return (
    Number.isFinite(model.planetRadius) &&
    model.planetRadius > 0 &&
    Number.isFinite(model.starRadius) &&
    model.starRadius > 0 &&
    Number.isFinite(model.unitsPerAU) &&
    model.unitsPerAU > 0
  );
}
