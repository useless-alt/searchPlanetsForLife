import {
  PROVENANCE_ORDER,
  type ParamValue,
  type Provenance,
  type SourceId,
} from '../types/provenance';

/**
 * Конструктор значения параметра.
 *
 * Нечисловые и нефизичные значения (NaN, ±Infinity) приводятся к null —
 * в проекте отсутствие значения всегда означает null (п. 1.4).
 * При value === null происхождение и источник также обнуляются:
 * инвариант `value === null ⇒ provenance === null`.
 */
export function makeParam(
  value: number | null,
  provenance: Provenance | null,
  source: SourceId | null = null,
  sourceDate: string | null = null,
): ParamValue {
  const safeValue = value !== null && Number.isFinite(value) ? value : null;

  return {
    value: safeValue,
    provenance: safeValue === null ? null : provenance,
    source: safeValue === null ? null : source,
    sourceDate: safeValue === null ? null : sourceDate,
    fromBackup: false,
    alternatives: [],
  };
}

/** Отсутствующее значение: все поля пустые. */
export function nullParam(): ParamValue {
  return {
    value: null,
    provenance: null,
    source: null,
    sourceDate: null,
    fromBackup: false,
    alternatives: [],
  };
}

/**
 * Происхождение значения, вычисленного из других значений.
 *
 * Берётся худшее из происхождений значимых входов в порядке
 * measured < physics < model < estimate. Если среди входов нет model/estimate,
 * результат — 'physics' (в том числе когда значимых входов нет вовсе).
 */
export function derivedProvenance(inputs: readonly ParamValue[]): Provenance {
  let worst: Provenance | null = null;

  for (const input of inputs) {
    if (input.value === null || input.provenance === null) continue;
    if (worst === null || PROVENANCE_ORDER[input.provenance] > PROVENANCE_ORDER[worst]) {
      worst = input.provenance;
    }
  }

  if (worst === null) return 'physics';
  if (PROVENANCE_ORDER[worst] <= PROVENANCE_ORDER.physics) return 'physics';

  return worst;
}
