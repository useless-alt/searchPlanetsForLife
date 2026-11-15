import type { ParamValue } from '../types/provenance';

import type { ScaleModel } from './scale';

/**
 * Доступность слоя зоны обитаемости в 3D-сцене (задача 24; п. 11.4).
 *
 * Границы зоны не угадываются: слой строится только тогда, когда карточка
 * уже получила границы `d_in`/`d_out` из `computeHz` (задачи 5 и 19), а
 * масштаб сцены не условный. Иначе возвращается список недостающих величин
 * и готовая причина для подсказки переключателя.
 */

/** Минимальные поля детали, нужные для проверки доступности слоя. */
export interface HzAvailabilityDetail {
  /** Границы зоны из карточки; null — границы не рассчитаны. */
  hz: {
    /** Внутренняя граница [а.е.]. */
    d_in: number;
    /** Внешняя граница [а.е.]. */
    d_out: number;
  } | null;
  /** Разрешённые параметры планеты и звезды. */
  resolved: {
    /** Эффективная температура звезды [К]. */
    st_teff: Pick<ParamValue, 'value'>;
    /** Светимость звезды [L☉]. */
    L: Pick<ParamValue, 'value'>;
    /** Радиус звезды [R☉]. */
    st_rad: Pick<ParamValue, 'value'>;
    /** Большая полуось орбиты [а.е.]. */
    d: Pick<ParamValue, 'value'>;
  };
}

/** Результат проверки доступности слоя. */
export interface HzAvailability {
  /** Слой можно построить по готовым числам. */
  available: boolean;
  /** Человекочитаемые названия недостающих величин. */
  missing: string[];
  /** Причина недоступности; null — слой доступен. */
  reason: string | null;
}

/** Названия недостающих величин (п. 11.4). */
export const HZ_MISSING_LABELS = {
  /** Эффективная температура звезды. */
  st_teff: 'температура звезды',
  /** Светимость или радиус звезды. */
  L_or_st_rad: 'светимость или радиус звезды',
  /** Большая полуось орбиты. */
  d: 'большая полуось орбиты',
} as const;

/** Причина, когда все величины есть, но геометрия зоны невозможна. */
export const HZ_NOT_COMPUTED_REASON = 'границы зоны обитаемости не рассчитаны';

/** Проверяет, что значение задано и положительно. */
function positive(value: number | null): boolean {
  return value !== null && Number.isFinite(value) && value > 0;
}

/**
 * Проверяет доступность кольца зоны обитаемости.
 *
 * Доступность определяется теми же числами, что показывает карточка:
 * `detail.hz` уже содержит `d_in` и `d_out` для текущих `settings.hzBounds`.
 * Повторный расчёт границ здесь не выполняется.
 *
 * @param detail Деталь планеты с готовыми границами зоны.
 * @param scale Модель масштаба сцены.
 * @returns Доступность, недостающие величины и причина.
 */
export function hzAvailability(
  detail: HzAvailabilityDetail,
  scale: Pick<ScaleModel, 'nominal'>,
): HzAvailability {
  const missing: string[] = [];

  if (!positive(detail.resolved.st_teff.value)) {
    missing.push(HZ_MISSING_LABELS.st_teff);
  }

  if (!positive(detail.resolved.L.value) && !positive(detail.resolved.st_rad.value)) {
    missing.push(HZ_MISSING_LABELS.L_or_st_rad);
  }

  if (scale.nominal || !positive(detail.resolved.d.value)) {
    missing.push(HZ_MISSING_LABELS.d);
  }

  const hz = detail.hz;
  const boundsReady =
    hz !== null &&
    Number.isFinite(hz.d_in) &&
    Number.isFinite(hz.d_out) &&
    hz.d_in > 0 &&
    hz.d_out > hz.d_in;
  const available = boundsReady && !scale.nominal;

  if (available) {
    return { available: true, missing: [], reason: null };
  }

  return {
    available: false,
    missing,
    reason: missing.length > 0 ? `Не хватает: ${missing.join(', ')}` : HZ_NOT_COMPUTED_REASON,
  };
}
