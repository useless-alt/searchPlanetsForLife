import type { Provenance } from '@exo/shared';

/**
 * Форматирование значений таблицы (задача 16; п. 4.2, 10.5).
 *
 * Правила из ТЗ:
 * - нет значения или число не конечное → «—»;
 * - числа разной величины получают разное число знаков после точки,
 *   чтобы колонка читалась как приборная шкала;
 * - вычисленные и оценённые значения помечаются префиксом `~`
 *   (происхождение `model` или `estimate`), измеренные и физические — нет.
 */

/** Отсутствующее значение. */
export const EMPTY_VALUE = '—';

/** Конечное ли число (null, NaN и Infinity не форматируются). */
function isFiniteNumber(value: number | null): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Число с переменным числом знаков после точки (п. 4.2).
 *
 * |x| ≥ 100 → 0 знаков, ≥ 10 → 1, ≥ 0.01 → 2, иначе экспоненциальная запись.
 * Ноль показывается как `0.00`: это значение эксцентриситета и других
 * величин, где два знака после точки обязательны.
 */
export function formatNum(value: number | null): string {
  if (!isFiniteNumber(value)) return EMPTY_VALUE;

  if (value === 0) return '0.00';

  const abs = Math.abs(value);

  if (abs >= 100) return value.toFixed(0);
  if (abs >= 10) return value.toFixed(1);
  if (abs >= 0.01) return value.toFixed(2);

  return value.toExponential(1);
}

/** Доля 0..1 в проценты с одним знаком: `0.577` → `57.7%` (точка — разделитель). */
export function formatPercent(value: number | null): string {
  if (!isFiniteNumber(value)) return EMPTY_VALUE;

  return `${(value * 100).toFixed(1)}%`;
}

/** Температура: целое число кельвинов. */
export function formatTemp(value: number | null): string {
  if (!isFiniteNumber(value)) return EMPTY_VALUE;

  return String(Math.round(value));
}

/** Расстояние: ≥ 100 → 0 знаков, ≥ 10 → 1, иначе 2. */
export function formatDist(value: number | null): string {
  if (!isFiniteNumber(value)) return EMPTY_VALUE;

  const abs = Math.abs(value);

  if (abs >= 100) return value.toFixed(0);
  if (abs >= 10) return value.toFixed(1);

  return value.toFixed(2);
}

/**
 * Пометка расчётного значения (п. 4.2).
 *
 * `model` и `estimate` получают префикс `~`; `physics` и `measured` — нет.
 * Отсутствующее значение остаётся длинным тире без префикса.
 */
export function approx(text: string, provenance: Provenance | null | undefined): string {
  if (text === EMPTY_VALUE) return text;

  return provenance === 'model' || provenance === 'estimate' ? `~${text}` : text;
}
