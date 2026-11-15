import type { FilterState, Range, SpectralClass } from '@exo/shared';

import { ru, type RuKey } from '../../i18n/ru';

/**
 * Валидация панели фильтров (задача 15; п. 13.3).
 *
 * Черновик хранит границы как текст: запятая — десятичный разделитель,
 * пустая строка — «без ограничения». В `FilterState` попадают только
 * проверенные числа, поэтому недопустимое значение не может изменить
 * ранжирование.
 */

/** Диапазон в виде текста черновика. */
export interface RangeDraft {
  /** Нижняя граница (текст поля). */
  min: string;
  /** Верхняя граница (текст поля). */
  max: string;
}

/** Черновик панели фильтров. */
export interface FilterDraft {
  /** Выбранные спектральные классы. */
  spectralClasses: SpectralClass[];
  /** Радиус планеты [R⊕]. */
  radius: RangeDraft;
  /** Температура поверхности [K]. */
  T_s: RangeDraft;
  /** Эксцентриситет орбиты. */
  e: RangeDraft;
}

/** Код ошибки поля. */
export type FilterErrorCode = 'notNumber' | 'negative' | 'eccentricity' | 'minAboveMax';

/** Ошибки одной пары «Мин — Макс». */
export interface RangeErrors {
  /** Ошибка нижней границы. */
  min: FilterErrorCode | null;
  /** Ошибка верхней границы. */
  max: FilterErrorCode | null;
  /** Ошибка соотношения границ. */
  range: FilterErrorCode | null;
}

/** Ошибки всех диапазонов черновика. */
export interface DraftErrors {
  /** Радиус планеты. */
  radius: RangeErrors;
  /** Температура поверхности. */
  T_s: RangeErrors;
  /** Эксцентриситет. */
  e: RangeErrors;
}

/** Разобранная граница. */
export interface ParsedBound {
  /** Значение; null — поле пустое. */
  value: number | null;
  /** Код ошибки; null — ошибки нет. */
  error: FilterErrorCode | null;
}

/** Результат проверки черновика. */
export interface DraftValidation {
  /** Все поля допустимы. */
  valid: boolean;
  /** Ошибки по полям (для подписей под полями). */
  errors: DraftErrors;
  /** Проверенные диапазоны для `setFilters`. */
  values: {
    radius: Range;
    T_s: Range;
    e: Range;
  };
}

/** Вид диапазона: влияет только на текст ошибки. */
type RangeKind = 'radius' | 'T_s' | 'e';

/** Ключи текстов ошибок в словаре `ru`. */
const ERROR_KEYS: Record<FilterErrorCode, RuKey> = {
  notNumber: 'filters.error.notNumber',
  negative: 'filters.error.negative',
  eccentricity: 'filters.error.eccentricity',
  minAboveMax: 'filters.error.minAboveMax',
};

/** Текст ошибки поля из словаря. */
export function filterErrorMessage(code: FilterErrorCode): string {
  return ru[ERROR_KEYS[code]];
}

/** Текст поля из числа: null — пустая строка. */
function formatBound(value: number | null): string {
  return value === null || !Number.isFinite(value) ? '' : String(value);
}

/** Снимок фильтров для черновика. */
export function draftFromFilters(filters: FilterState): FilterDraft {
  return {
    spectralClasses: [...filters.spectralClasses],
    radius: { min: formatBound(filters.radius.min), max: formatBound(filters.radius.max) },
    T_s: { min: formatBound(filters.T_s.min), max: formatBound(filters.T_s.max) },
    e: { min: formatBound(filters.e.min), max: formatBound(filters.e.max) },
  };
}

/**
 * Разбирает одну границу диапазона.
 *
 * Пробелы удаляются, запятая трактуется как десятичная. Допустима только
 * запись `число` или `число,дробь`; пустая строка — `null`.
 */
export function parseDraftBound(raw: string, kind: RangeKind): ParsedBound {
  const compact = raw.replace(/\s+/g, '').replace(',', '.');

  if (compact === '') return { value: null, error: null };
  if (!/^-?\d+(?:\.\d+)?$/.test(compact)) return { value: null, error: 'notNumber' };

  const value = Number(compact);
  if (!Number.isFinite(value)) return { value: null, error: 'notNumber' };

  if (kind === 'e') {
    if (value < 0 || value > 1) return { value: null, error: 'eccentricity' };
  } else if (value < 0) {
    return { value: null, error: 'negative' };
  }

  return { value, error: null };
}

/** Разбирает пару границ и проверяет их порядок. */
function parseRange(draft: RangeDraft, kind: RangeKind): { range: Range; errors: RangeErrors } {
  const min = parseDraftBound(draft.min, kind);
  const max = parseDraftBound(draft.max, kind);
  const errors: RangeErrors = { min: min.error, max: max.error, range: null };

  if (min.value !== null && max.value !== null && min.value > max.value) {
    errors.range = 'minAboveMax';
  }

  return { range: { min: min.value, max: max.value }, errors };
}

/** Проверяет весь черновик и возвращает готовые диапазоны. */
export function validateDraft(draft: FilterDraft): DraftValidation {
  const radius = parseRange(draft.radius, 'radius');
  const tSurface = parseRange(draft.T_s, 'T_s');
  const eccentricity = parseRange(draft.e, 'e');

  const errors: DraftErrors = {
    radius: radius.errors,
    T_s: tSurface.errors,
    e: eccentricity.errors,
  };

  const valid = [radius.errors, tSurface.errors, eccentricity.errors].every(
    (range) => range.min === null && range.max === null && range.range === null,
  );

  return {
    valid,
    errors,
    values: { radius: radius.range, T_s: tSurface.range, e: eccentricity.range },
  };
}

/** Есть ли ошибки в диапазоне. */
export function hasRangeErrors(errors: RangeErrors): boolean {
  return errors.min !== null || errors.max !== null || errors.range !== null;
}

/** Совпадают ли наборы классов без учёта порядка. */
function sameClasses(a: readonly SpectralClass[], b: readonly SpectralClass[]): boolean {
  return a.length === b.length && a.every((cls) => b.includes(cls));
}

/** Совпадает ли граница черновика с числом фильтра. */
function sameBound(raw: string, expected: number | null, kind: RangeKind): boolean {
  const parsed = parseDraftBound(raw, kind);

  if (parsed.error !== null) return false;

  return Object.is(parsed.value, expected);
}

/**
 * Отличается ли черновик от применённых фильтров.
 *
 * Сравниваются значения, а не текст: «1,5» и «1.5» — одна и та же граница.
 * Недопустимая запись считается изменением, но применить её нельзя.
 */
export function isDraftDirty(draft: FilterDraft, filters: FilterState): boolean {
  return (
    !sameClasses(draft.spectralClasses, filters.spectralClasses) ||
    !sameBound(draft.radius.min, filters.radius.min, 'radius') ||
    !sameBound(draft.radius.max, filters.radius.max, 'radius') ||
    !sameBound(draft.T_s.min, filters.T_s.min, 'T_s') ||
    !sameBound(draft.T_s.max, filters.T_s.max, 'T_s') ||
    !sameBound(draft.e.min, filters.e.min, 'e') ||
    !sameBound(draft.e.max, filters.e.max, 'e')
  );
}
