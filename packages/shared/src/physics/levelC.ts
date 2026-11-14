import { K_MIN } from '../constants/solver';
import { ADAPTIVE_SUBINDICES, type SubindexId } from '../types/solver';
import type { ParamValue } from '../types/provenance';

/**
 * Уровень В каскадного решателя: адаптивное исключение невычислимых параметров.
 *
 * Функция ничего не подставляет — она определяет доступность субиндексов.
 * Фактические k и excluded пересчитываются в Задаче 5 по реально полученным
 * значениям субиндексов.
 */

/** Данные, по которым оценивается доступность субиндексов. */
export interface AvailabilityInput {
  /** Радиус планеты [R⊕]. */
  R: ParamValue;
  /** Масса планеты [M⊕]. */
  M: ParamValue;
  /** Средняя плотность [г/см³]. */
  rho: ParamValue;
  /** Поток излучения [S⊕]. */
  S: ParamValue;
  /** Равновесная температура [К]. */
  T_eq: ParamValue;
  /** Светимость звезды [L☉]. */
  L: ParamValue;
  /** Эффективная температура звезды [К]. */
  st_teff: ParamValue;
  /** Большая полуось орбиты [а.е.]. */
  d: ParamValue;
}

/** Результат оценки доступности субиндексов. */
export interface Availability {
  /** Доступность каждого субиндекса. */
  available: Record<SubindexId, boolean>;
  /** Число доступных субиндексов адаптивного режима. */
  k: number;
  /** Число субиндексов адаптивного режима (n = 4, U4). */
  n: number;
  /** Недоступные субиндексы адаптивного режима. */
  excluded_subindices: SubindexId[];
  /** k < K_MIN: данных недостаточно. */
  insufficient_data: boolean;
}

/**
 * Оценивает доступность субиндексов.
 *
 *   ESI_R  — нужен R;
 *   ESI_rho — нужна плотность;
 *   ESI_ve  — нужны M и R;
 *   ESI_S   — нужен поток излучения;
 *   ESI_T   — нужна равновесная температура;
 *   F_HZ    — нужны st_teff, L и d (отсутствующее e допустимо, принимается 0).
 */
export function computeAvailability(resolved: AvailabilityInput): Availability {
  const has = (param: ParamValue): boolean => param.value !== null;

  const available: Record<SubindexId, boolean> = {
    ESI_R: has(resolved.R),
    ESI_rho: has(resolved.rho),
    ESI_ve: has(resolved.M) && has(resolved.R),
    ESI_S: has(resolved.S),
    ESI_T: has(resolved.T_eq),
    F_HZ: has(resolved.st_teff) && has(resolved.L) && has(resolved.d),
  };

  const k = ADAPTIVE_SUBINDICES.filter((id) => available[id]).length;
  const excluded_subindices = ADAPTIVE_SUBINDICES.filter((id) => !available[id]);

  return {
    available,
    k,
    n: ADAPTIVE_SUBINDICES.length,
    excluded_subindices,
    insufficient_data: k < K_MIN,
  };
}
