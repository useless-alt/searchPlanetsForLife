/**
 * Сведения о спектральном файле Exo.MAST (задача 28; п. 7.3, 10.7.5).
 *
 * Сервер скачивает текстовый файл и разбирает его этим модулем; клиент
 * показывает только числа и первые строки заголовка. Модуль чистый:
 * ни сети, ни DOM.
 */

/** Вид спектра по имени файла. */
export type SpectrumKind = 'transmission' | 'emission' | 'other';

/** Краткие сведения о спектре. */
export interface SpectrumMeta {
  /** Имя файла, как оно пришло в списке Exo.MAST. */
  file: string;
  /** Вид спектра. */
  kind: SpectrumKind;
  /** Число строк с хотя бы одним числом. */
  dataLines: number;
  /** Максимальное число числовых полей в строке. */
  columns: number;
  /** Минимум по первому столбцу; null — чисел в первом столбце нет. */
  firstColumnMin: number | null;
  /** Максимум по первому столбцу; null — чисел в первом столбце нет. */
  firstColumnMax: number | null;
  /** До 3 первых непустых строк заголовка (без `#`). */
  headerLines: string[];
}

/** Максимальное число строк заголовка. */
export const SPECTRUM_HEADER_LIMIT = 3;

/** Максимальная длина строки заголовка. */
export const SPECTRUM_HEADER_MAX_LENGTH = 200;

/** Ошибка разбора спектра; `reason` совпадает с `FetchErrorReason`. */
export class SpectrumParseError extends Error {
  /** Машиночитаемая причина. */
  readonly reason = 'invalid_json' as const;

  constructor(message: string) {
    super(message);
    this.name = 'SpectrumParseError';
    Object.setPrototypeOf(this, SpectrumParseError.prototype);
  }
}

/** Проверяет, что строка — конечное число (пустая строка не число). */
function isNumericField(field: string): boolean {
  if (field === '') return false;
  const value = Number(field);
  return Number.isFinite(value);
}

/** Разбивает строку данных на поля. */
function splitFields(line: string): string[] {
  return line.split(/[\s,;\t]+/).filter((field) => field !== '');
}

/** Определяет вид спектра по имени файла. */
export function spectrumKind(file: string): SpectrumKind {
  const name = file.toLowerCase();
  if (name.includes('transmission')) return 'transmission';
  if (name.includes('emission')) return 'emission';
  return 'other';
}

/**
 * Разбирает текстовый спектр.
 *
 * - строки, начинающиеся с `#`, — заголовок: берутся первые три непустых,
 *   обрезаются до 200 символов, `#` отбрасывается;
 * - остальные непустые строки делятся по `[\s,;\t]+`;
 * - строка без единого числа пропускается;
 * - `columns` — максимум числовых полей в строке, `dataLines` — число
 *   строк хотя бы с одним числом;
 * - `firstColumnMin`/`Max` — по первому столбцу (null, если чисел нет).
 *
 * @param text Содержимое файла.
 * @param file Имя файла (влияет на `kind`).
 * @throws {SpectrumParseError} файл бинарный (содержит `\u0000`).
 */
export function parseSpectrum(text: string, file: string): SpectrumMeta {
  if (text.includes('\u0000')) {
    throw new SpectrumParseError(`Спектр «${file}» содержит двоичные данные`);
  }

  const headerLines: string[] = [];
  let dataLines = 0;
  let columns = 0;
  let firstColumnMin: number | null = null;
  let firstColumnMax: number | null = null;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === '') continue;

    if (line.startsWith('#')) {
      if (headerLines.length >= SPECTRUM_HEADER_LIMIT) continue;

      const header = line.replace(/^#+\s*/, '').trim();
      if (header !== '') headerLines.push(header.slice(0, SPECTRUM_HEADER_MAX_LENGTH));
      continue;
    }

    const fields = splitFields(line);
    const numbers = fields.filter((field) => isNumericField(field));

    if (numbers.length === 0) continue;

    dataLines += 1;
    if (numbers.length > columns) columns = numbers.length;

    const first = Number(fields[0]);

    if (Number.isFinite(first)) {
      firstColumnMin = firstColumnMin === null ? first : Math.min(firstColumnMin, first);
      firstColumnMax = firstColumnMax === null ? first : Math.max(firstColumnMax, first);
    }
  }

  return {
    file,
    kind: spectrumKind(file),
    dataLines,
    columns,
    firstColumnMin,
    firstColumnMax,
    headerLines,
  };
}
