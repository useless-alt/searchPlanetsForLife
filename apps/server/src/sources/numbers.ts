/**
 * Приведение значений каталогов к числам (задача 8).
 *
 * Правило ТЗ (раздел «ПАРСЕР ОТВЕТОВ»): все числа проходят через `num(v)`;
 * `null`, `''`, `'NaN'` и нефиничные значения дают `null`.
 * Подстановка «правдоподобных» значений запрещена (жёсткое правило 4).
 */

/**
 * Приводит значение к числу.
 *
 * @param value - исходное значение (число, строка, `null`, `undefined`).
 * @returns конечное число либо `null`, если значение нечисловое или нефиничное.
 */
export function toNum(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/**
 * Проверяет, что значение — конечное число.
 * Удобная обёртка над {@link toNum} для проверок в тестах и адаптерах.
 */
export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
