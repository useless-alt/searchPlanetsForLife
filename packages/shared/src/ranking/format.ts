/**
 * Форматирование значений интерфейса (п. 4.2).
 */

/**
 * Сдвиг ранга относительно классического ESI (U21).
 *
 *   `+8`  → `[+8]`,  `−12` → `[-12]`,  ноль → `[0]`.
 *
 * Нет базы для сравнения (`null`) — длинное тире.
 */
export function formatDelta(delta: number | null): string {
  if (delta === null) return '—';

  if (delta > 0) return `[+${delta}]`;
  if (delta < 0) return `[${delta}]`;

  return '[0]';
}
