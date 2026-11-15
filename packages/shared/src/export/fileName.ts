import type { CalcMode } from '../types/scoring';

/**
 * Имя файла экспорта CSV (задача 20; 13.1).
 *
 * Формат: `top50_<mode>_<YYYY-MM-DD>.csv`, дата — локальная дата
 * пользователя. Локальное время важно: файл, скачанный вечером, не должен
 * получать завтрашнюю дату из-за часового пояса.
 */

/** Дополняет число нулём до двух цифр. */
function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

/**
 * Имя CSV-файла для режима и даты.
 *
 * @param mode Режим расчёта (`adaptive` | `rhi` | `classic_esi` | `strict`).
 * @param date Дата скачивания; по умолчанию текущая.
 */
export function csvFileName(mode: CalcMode, date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = pad2(date.getMonth() + 1);
  const day = pad2(date.getDate());

  return `top50_${mode}_${year}-${month}-${day}.csv`;
}
