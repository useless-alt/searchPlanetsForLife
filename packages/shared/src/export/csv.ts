import { CALC_MODE_PRESETS } from '../ranking/presets';
import type { Provenance } from '../types/provenance';
import type { HzBounds } from '../types/settings';
import type { CalcMode, ScoreBreakdown } from '../types/scoring';

/**
 * Экспорт таблицы Топ-50 в CSV (задача 20; 13.1, U42).
 *
 * Строки приходят уже в порядке отображения: режим, фильтры и сортировка
 * применены выше. Экспорт не зависит от переключателя «Показать
 * дополнительные данные» и всегда содержит все колонки.
 */

/** Кодировка UTF-8 с BOM: без неё Excel неверно определяет кириллицу (U42). */
export const CSV_BOM = '\uFEFF';

/**
 * Разделитель CSV (U42).
 *
 * Одна константа на весь экспорт: для русскоязычного Excel её можно
 * заменить на `;`, не трогая остальной код.
 */
export const CSV_DELIMITER = ',';

/** Перевод строки CRLF по RFC 4180. */
export const CSV_NEWLINE = '\r\n';

/** Заголовки колонок в порядке ТЗ. */
export const CSV_HEADERS: readonly string[] = [
  'Ранг',
  'Сдвиг от упрощённого ESI',
  'Планета',
  'Система',
  'Индекс',
  'Q_data',
  'R [R⊕]',
  'M [M⊕]',
  'T_s [K]',
  'e',
  'Кл.',
  'd [пк]',
  'Происхождение R',
  'Происхождение M',
  'Происхождение e',
  'ESI недр',
  'F_HZ',
  'P_rocky',
  'P_ecc',
  'P_star',
  'Недостаточно данных',
  'Режим',
  'Границы зоны обитаемости',
  'Снимок данных',
];

/** Поля строки, которые попадают в CSV. */
export interface CsvRow {
  /** Текущий ранг. */
  rank: number;
  /** Сдвиг относительно упрощённого ESI; null — нет базы сравнения. */
  delta: number | null;
  /** Имя планеты. */
  name: string;
  /** Имя родительской звезды. */
  hostname: string;
  /** Разложение балла текущего режима. */
  score: ScoreBreakdown;
  /** Коэффициент достоверности данных. */
  Q_data: number;
  /** Радиус планеты [R⊕]. */
  R: number | null;
  /** Масса планеты [M⊕]. */
  M: number | null;
  /** Температура поверхности [K]. */
  T_s: number | null;
  /** Эксцентриситет орбиты. */
  e: number | null;
  /** Спектральный класс звезды. */
  spectralClass: string | null;
  /** Расстояние до системы [пк]. */
  dist_pc: number | null;
  /** Происхождение R, M и e. */
  provenance: {
    R: Provenance | null;
    M: Provenance | null;
    e: Provenance | null;
  };
  /** Данных недостаточно (k < 3). */
  insufficient: boolean;
}

/** Настройки, попадающие в каждую строку CSV. */
export interface CsvMeta {
  /** Режим расчёта. */
  mode: CalcMode;
  /** Границы зоны обитаемости. */
  hzBounds: HzBounds;
  /** Время сборки снимка (ISO 8601); null — снимок ещё не загружен. */
  builtAt: string | null;
}

/** Русские названия происхождения значения (п. 4.3, 11.1; U15). */
export const CSV_PROVENANCE_LABELS: Record<Provenance, string> = {
  measured: 'Измерено',
  physics: 'Физика',
  model: 'Модель',
  estimate: 'Оценка',
};

/** Подпись границ зоны обитаемости. */
const HZ_LABELS: Record<HzBounds, string> = {
  conservative: 'Консервативная',
  optimistic: 'Оптимистичная',
};

/** Символы, с которых начинается формула в Excel, LibreOffice и Sheets. */
const FORMULA_PREFIXES = ['=', '+', '-', '@', '\t', '\r'] as const;

/**
 * Экранирует строковое поле по RFC 4180.
 *
 * Поле с разделителем, кавычкой или переводом строки заключается в кавычки,
 * внутренние кавычки удваиваются.
 */
export function escapeCsvField(value: string): string {
  if (
    value.includes(CSV_DELIMITER) ||
    value.includes('"') ||
    value.includes('\n') ||
    value.includes('\r')
  ) {
    return `"${value.replaceAll('"', '""')}"`;
  }

  return value;
}

/**
 * Текстовая ячейка: null → пусто, формула получает защитный апостроф.
 *
 * Защита нужна только строковым значениям: числа (`-5`) не должны получать
 * префикс, иначе Excel перестанет видеть в них число.
 */
export function csvTextCell(value: string | null): string {
  if (value === null) return '';

  const needsGuard = FORMULA_PREFIXES.some((prefix) => value.startsWith(prefix));
  const guarded = needsGuard ? `'${value}` : value;

  return escapeCsvField(guarded);
}

/** Числовая ячейка без форматирования: полная точность `String(x)`. */
export function csvNumberCell(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '';

  return String(value);
}

/** Ячейка с целым числом со знаком (сдвиг ранга). */
export function csvIntegerCell(value: number | null): string {
  return csvNumberCell(value);
}

/** Одна строка таблицы в виде массива ячеек. */
function rowCells(row: CsvRow, meta: CsvMeta): string[] {
  return [
    csvNumberCell(row.rank),
    csvIntegerCell(row.delta),
    csvTextCell(row.name),
    csvTextCell(row.hostname),
    csvNumberCell(row.score.index),
    csvNumberCell(row.Q_data),
    csvNumberCell(row.R),
    csvNumberCell(row.M),
    csvNumberCell(row.T_s),
    csvNumberCell(row.e),
    csvTextCell(row.spectralClass),
    csvNumberCell(row.dist_pc),
    csvTextCell(row.provenance.R === null ? null : CSV_PROVENANCE_LABELS[row.provenance.R]),
    csvTextCell(row.provenance.M === null ? null : CSV_PROVENANCE_LABELS[row.provenance.M]),
    csvTextCell(row.provenance.e === null ? null : CSV_PROVENANCE_LABELS[row.provenance.e]),
    csvNumberCell(row.score.ESI_interior),
    csvNumberCell(row.score.F_HZ),
    csvNumberCell(row.score.P_rocky),
    csvNumberCell(row.score.P_ecc),
    csvNumberCell(row.score.P_star),
    csvTextCell(row.insufficient ? 'да' : 'нет'),
    csvTextCell(CALC_MODE_PRESETS[meta.mode].label),
    csvTextCell(HZ_LABELS[meta.hzBounds]),
    csvTextCell(meta.builtAt),
  ];
}

/**
 * Собирает CSV целиком: BOM, заголовок и строки через CRLF.
 *
 * @param rows Строки в текущем порядке отображения.
 * @param meta Режим, границы HZ и время снимка.
 */
export function buildCsv(rows: readonly CsvRow[], meta: CsvMeta): string {
  const header = CSV_HEADERS.map(escapeCsvField).join(CSV_DELIMITER);
  const body = rows.map((row) => rowCells(row, meta).join(CSV_DELIMITER));
  const records = [header, ...body];

  return `${CSV_BOM}${records.join(CSV_NEWLINE)}`;
}
