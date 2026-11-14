/**
 * Субиндексы ESI (п. 2.1).
 *
 *   ESI_i = (1 − |x_i − x_i0| / (x_i + x_i0))^w_i
 */

/** Ключ параметра в формуле ESI. */
export type EsiParamKey = 'R' | 'rho' | 'v_e' | 'S' | 'T_s';

/** Эталоны x_i0 (значение, дающее единицу). */
export const ESI_REFERENCE: Record<EsiParamKey, number> = {
  R: 1.0,
  rho: 5.51,
  v_e: 1.0,
  S: 1.0,
  T_s: 288,
};

/** Веса w_i. */
export const ESI_WEIGHT: Record<EsiParamKey, number> = {
  R: 0.57,
  rho: 1.07,
  v_e: 0.7,
  S: 1.07,
  T_s: 5.58,
};
