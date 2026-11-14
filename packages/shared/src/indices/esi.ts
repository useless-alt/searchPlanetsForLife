import { ESI_REFERENCE, ESI_WEIGHT } from '../constants/esi';
import { GREENHOUSE_DELTA_K } from '../constants/solver';
import type { ResolvedPlanet } from '../types/solver';

/**
 * Субиндексы ESI (п. 2.1).
 *
 *   ESI_i = (1 − |x_i − x_i0| / (x_i + x_i0))^w_i
 *
 * Значения эталонов и весов — в constants/esi.ts. Округление — только в UI.
 */

/** Значения всех субиндексов и производных величин планеты. */
export interface EsiValues {
  /** Вторая космическая скорость (sqrt(M / R)). */
  v_e: number | null;
  /** Температура поверхности [К] (T_eq + 33). */
  T_s: number | null;
  /** Субиндекс радиуса. */
  ESI_R: number | null;
  /** Субиндекс плотности. */
  ESI_rho: number | null;
  /** Субиндекс второй космической скорости. */
  ESI_ve: number | null;
  /** Субиндекс потока излучения. */
  ESI_S: number | null;
  /** Субиндекс температуры поверхности. */
  ESI_T: number | null;
}

/**
 * Субиндекс ESI по одному параметру.
 *
 * Отсутствующее или неположительное значение даёт null; невычислимое
 * значение не подменяется нулём.
 */
export function esiParam(x: number | null, x0: number, w: number): number | null {
  if (x === null || !Number.isFinite(x) || x <= 0) return null;
  if (!Number.isFinite(x0) || x0 <= 0 || !Number.isFinite(w)) return null;

  const base = 1 - Math.abs(x - x0) / (x + x0);
  if (base < 0) return null;

  const value = base ** w;
  return Number.isFinite(value) ? value : null;
}

/**
 * Считает субиндексы планеты: ESI_R, ESI_rho, ESI_ve, ESI_S, ESI_T,
 * а также производные величины v_e и T_s.
 */
export function computeSubindices(planet: ResolvedPlanet): EsiValues {
  const R = planet.R.value;
  const M = planet.M.value;
  const rho = planet.rho.value;
  const S = planet.S.value;
  const T_eq = planet.T_eq.value;

  const v_e = R !== null && M !== null && R > 0 && M > 0 ? Math.sqrt(M / R) : null;
  const T_s = T_eq !== null && Number.isFinite(T_eq) ? T_eq + GREENHOUSE_DELTA_K : null;

  return {
    v_e,
    T_s,
    ESI_R: esiParam(R, ESI_REFERENCE.R, ESI_WEIGHT.R),
    ESI_rho: esiParam(rho, ESI_REFERENCE.rho, ESI_WEIGHT.rho),
    ESI_ve: esiParam(v_e, ESI_REFERENCE.v_e, ESI_WEIGHT.v_e),
    ESI_S: esiParam(S, ESI_REFERENCE.S, ESI_WEIGHT.S),
    ESI_T: esiParam(T_s, ESI_REFERENCE.T_s, ESI_WEIGHT.T_s),
  };
}

/**
 * Геофизическое подобие планеты: ESI_interior = (ESI_R·ESI_ρ·ESI_ve)^(1/3).
 *
 * Температура в формулу не входит.
 */
export function computeEsiInterior(values: EsiValues): number | null {
  const { ESI_R, ESI_rho, ESI_ve } = values;
  if (ESI_R === null || ESI_rho === null || ESI_ve === null) return null;

  const product = ESI_R * ESI_rho * ESI_ve;
  if (!Number.isFinite(product) || product <= 0) return null;

  return Math.cbrt(product);
}
