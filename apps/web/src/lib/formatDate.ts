/**
 * Форматирование дат интерфейса (задача 13).
 *
 * Единый формат «дд.мм.гггг чч:мм» в локали `ru-RU` и в локальном часовом
 * поясе: время резервной копии показывается пользователю вместе с датой,
 * поэтому часовой пояс должен совпадать с часовым поясом пользователя.
 */

/** Значение, если дату разобрать не удалось. */
const EMPTY = '—';

/** Форматтер даты и времени: русская локаль, 24-часовой формат. */
const FORMATTER = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/**
 * Форматирует дату и время по строке ISO 8601.
 *
 * @param iso Строка ISO 8601 (например, `2026-11-01T12:30:00.000Z`).
 * @returns «дд.мм.гггг чч:мм» либо «—», если строка некорректна.
 */
export function formatDateTime(iso: string | null | undefined): string {
  if (typeof iso !== 'string') return EMPTY;

  const trimmed = iso.trim();

  if (trimmed === '') return EMPTY;

  const date = new Date(trimmed);

  if (Number.isNaN(date.getTime())) return EMPTY;

  const parts = FORMATTER.formatToParts(date);

  /** Значение части даты по её типу. */
  function part(type: 'day' | 'month' | 'year' | 'hour' | 'minute'): string {
    return parts.find((item) => item.type === type)?.value ?? '';
  }

  return `${part('day')}.${part('month')}.${part('year')} ${part('hour')}:${part('minute')}`;
}
