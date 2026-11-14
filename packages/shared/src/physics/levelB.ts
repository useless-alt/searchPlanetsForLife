import {
  CHEN_M_BREAKPOINT,
  CHEN_M_HIGH_COEFFICIENT,
  CHEN_M_HIGH_EXPONENT,
  CHEN_M_LOW_EXPONENT,
  CHEN_M_MAX,
  CHEN_R_BREAKPOINT,
  CHEN_R_HIGH_COEFFICIENT,
  CHEN_R_HIGH_EXPONENT,
  CHEN_R_LOW_EXPONENT,
} from '../constants/solver';
import type { ParamValue } from '../types/provenance';

import { makeParam, nullParam } from './provenance';

/**
 * Уровень Б каскадного решателя: закон Чен — Киппинг (2017), погрешность ~15–25 %.
 *
 * Восстанавливается только то, чего нет в каталоге: если известны и радиус,
 * и масса, Уровень Б не запускается. Восстановленное значение получает
 * происхождение 'model' (жёлтый цвет в карточке) и не имеет источника.
 */

/** Масса планеты по её радиусу [M⊕]. */
export function restoreMassFromRadius(R: ParamValue): ParamValue {
  const radius = R.value;
  if (radius === null || !Number.isFinite(radius) || radius <= 0) return nullParam();

  const mass =
    radius < CHEN_R_BREAKPOINT
      ? radius ** CHEN_R_LOW_EXPONENT
      : CHEN_R_HIGH_COEFFICIENT * radius ** CHEN_R_HIGH_EXPONENT;

  if (!Number.isFinite(mass) || mass <= 0) return nullParam();

  return makeParam(mass, 'model');
}

/**
 * Радиус планеты по её массе [R⊕].
 *
 * При M ≥ 132 M⊕ закон не определён — значение отсутствует (U5).
 */
export function restoreRadiusFromMass(M: ParamValue): ParamValue {
  const mass = M.value;
  if (mass === null || !Number.isFinite(mass) || mass <= 0) return nullParam();
  if (mass >= CHEN_M_MAX) return nullParam();

  const radius =
    mass < CHEN_M_BREAKPOINT
      ? mass ** CHEN_M_LOW_EXPONENT
      : CHEN_M_HIGH_COEFFICIENT * mass ** CHEN_M_HIGH_EXPONENT;

  if (!Number.isFinite(radius) || radius <= 0) return nullParam();

  return makeParam(radius, 'model');
}
