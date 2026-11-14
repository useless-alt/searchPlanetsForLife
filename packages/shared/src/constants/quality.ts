/**
 * Коэффициент достоверности данных Q_data (п. 2.5).
 */

/** Стартовое значение Q_data. */
export const Q_BASE = 1.0;

/** Штраф за массу или радиус, восстановленные по модели Чен — Киппинг (Уровень Б). */
export const Q_PENALTY_LEVEL_B = 0.1;

/** Штраф за принятый нулевой эксцентриситет. */
export const Q_PENALTY_E_ASSUMED = 0.05;

/** Штраф за каждый исключённый субиндекс (Уровень В). */
export const Q_PENALTY_EXCLUDED_SUBINDEX = 0.05;

/** Нижний порог Q_data: итог не опускается ниже 0.75. */
export const Q_FLOOR = 0.75;

/** Период [сут], ниже которого штраф за e = 0 не применяется. */
export const Q_E_ASSUMED_PERIOD_EXEMPT_DAYS = 10;

/** Пороги бейджей достоверности (U8). */
export const Q_BADGE_THRESHOLDS = {
  high: 0.95,
  medium: 0.85,
} as const;

/** Названия бейджей достоверности (U8). */
export const Q_BADGE_LABELS = {
  high: 'Высокая',
  medium: 'Средняя',
  low: 'Оценочная',
} as const;

/** Минимум ползунка Q_data. */
export const Q_SLIDER_MIN = 0.75;

/** Максимум ползунка Q_data. */
export const Q_SLIDER_MAX = 1.0;
