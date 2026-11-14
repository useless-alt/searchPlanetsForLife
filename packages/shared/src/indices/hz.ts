import { KOPPA_COEFFICIENTS, T_STAR_REF } from '../constants/koppa';
import type { HzBounds } from '../types/settings';

/**
 * Зона обитаемости по модели Коппарапу (п. 2.3).
 *
 *   S_eff = S_sun + a·T* + b·T*² + c·T*³ + d·T*⁴,  T* = st_teff − T_STAR_REF
 *   d_in = sqrt(L / S_eff_in),  d_out = sqrt(L / S_eff_out)
 *   d_eff = d · (1 − e²)^(1/4)
 *   HZD = (2·d_eff − d_out − d_in) / (d_out − d_in)
 *   F_HZ = max(0, 1 − HZD²)
 *
 * Диапазон st_teff не ограничивается (U16).
 */

/** Корень четвёртой степени в поправке на эксцентриситет. */
const ECCENTRICITY_ROOT = 1 / 4;

/** Коэффициенты одной границы зоны обитаемости. */
interface KoppaCoefficients {
  S_sun: number;
  a: number;
  b: number;
  c: number;
  d: number;
}

/** Данные для расчёта зоны обитаемости. */
export interface HzInput {
  /** Эффективная температура звезды [К]. */
  st_teff: number | null;
  /** Светимость звезды [L☉]. */
  L: number | null;
  /** Большая полуось орбиты [а.е.]. */
  d: number | null;
  /** Эксцентриситет орбиты; при отсутствии принимается 0. */
  e: number | null;
  /** Выбор границ: консервативные или оптимистичные. */
  bounds: HzBounds;
}

/** Результат расчёта зоны обитаемости. */
export interface HzResult {
  /** Климатический балл F_HZ. */
  F_HZ: number | null;
  /** Положение в зоне обитаемости HZD. */
  HZD: number | null;
  /** Внутренняя граница зоны [а.е.]. */
  d_in: number | null;
  /** Внешняя граница зоны [а.е.]. */
  d_out: number | null;
  /** Эффективная дистанция с поправкой на эксцентриситет [а.е.]. */
  d_eff: number | null;
}

/** Полином Коппарапу для одной границы. */
function sEff(coefficients: KoppaCoefficients, tStar: number): number {
  const { S_sun, a, b, c, d } = coefficients;
  return S_sun + a * tStar + b * tStar ** 2 + c * tStar ** 3 + d * tStar ** 4;
}

/**
 * Рассчитывает зону обитаемости.
 *
 * Если хотя бы одно условие не выполнено (неположительный S_eff, неположительная
 * светимость, d_out ≤ d_in, отсутствующие данные), результат — null во всех полях.
 */
export function computeHz(input: HzInput): HzResult {
  const empty: HzResult = { F_HZ: null, HZD: null, d_in: null, d_out: null, d_eff: null };

  const { st_teff, L, d, e, bounds } = input;

  if (st_teff === null || !Number.isFinite(st_teff)) return empty;
  if (L === null || !Number.isFinite(L) || L <= 0) return empty;
  if (d === null || !Number.isFinite(d) || d <= 0) return empty;

  const tStar = st_teff - T_STAR_REF;
  const coefficients = KOPPA_COEFFICIENTS[bounds];

  const sIn = sEff(coefficients.inner, tStar);
  const sOut = sEff(coefficients.outer, tStar);
  if (!Number.isFinite(sIn) || !Number.isFinite(sOut) || sIn <= 0 || sOut <= 0) return empty;

  const dIn = Math.sqrt(L / sIn);
  const dOut = Math.sqrt(L / sOut);
  if (!Number.isFinite(dIn) || !Number.isFinite(dOut) || dOut <= dIn) return empty;

  const eccentricity = e === null || !Number.isFinite(e) ? 0 : e;
  const dEff = d * (1 - eccentricity ** 2) ** ECCENTRICITY_ROOT;
  if (!Number.isFinite(dEff)) return empty;

  const hzd = (2 * dEff - dOut - dIn) / (dOut - dIn);
  const fHz = Math.max(0, 1 - hzd ** 2);

  return { F_HZ: fHz, HZD: hzd, d_in: dIn, d_out: dOut, d_eff: dEff };
}
