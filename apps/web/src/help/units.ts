/**
 * Пересчёт единиц для подсказок (задача 17; п. 11.7).
 *
 * Чистые функции: на входе число в единицах каталога, на выходе готовая
 * строка пояснения. Константы пересчёта берутся из `@exo/shared`, тексты —
 * из словаря `i18n/help.ru.ts`. Числа в таблицах и карточках не
 * подменяются: пояснение только дополняет значение (п. 11.7).
 */

import {
  AU_KM,
  EARTH_MASS_KG,
  EARTH_RADIUS_KM,
  KELVIN_TO_CELSIUS_OFFSET,
  PC_TO_KM,
  PC_TO_LY,
} from '@exo/shared';

import { HELP_UNIT_TEXT } from '../i18n/help.ru';

/** Неразрывный пробел между разрядами. */
const NBSP = '\u00a0';

/** Верхние индексы Unicode для научной записи. */
const SUPERSCRIPT_DIGITS = ['⁰', '¹', '²', '³', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹'] as const;

/**
 * Разряды через неразрывный пробел: `2485` → `2 485`.
 *
 * Используется для километров и градусов Цельсия (п. 11.7).
 */
export function formatThousands(value: number): string {
  const rounded = Math.round(value);
  const sign = rounded < 0 ? '−' : '';
  const digits = String(Math.abs(rounded)).replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);

  return `${sign}${digits}`;
}

/** Число без лишних нулей: `0.39` → `0.39`, `288` → `288`, `0.119` → `0.119`. */
export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return HELP_UNIT_TEXT.missing;

  return String(Math.round(value * 1000) / 1000);
}

/** Верхний индекс целого показателя степени. */
function superscript(value: number): string {
  const sign = value < 0 ? '⁻' : '';
  const digits = String(Math.abs(value))
    .split('')
    .map((digit) => SUPERSCRIPT_DIGITS[Number(digit)] ?? '')
    .join('');

  return `${sign}${digits}`;
}

/**
 * Научная запись с заданным числом значащих цифр: `3.6·10²⁵`.
 *
 * Мантисса всегда имеет `significant - 1` знак после точки, поэтому
 * `1.00 M⊕` даёт `6.0·10²⁴`, а `6.07 M⊕` — `3.6·10²⁵` (п. 11.7).
 */
export function scientific(value: number, significant = 2): string {
  if (!Number.isFinite(value) || value === 0) return '0';

  const sign = value < 0 ? '−' : '';
  const absolute = Math.abs(value);
  let exponent = Math.floor(Math.log10(absolute));
  let mantissa = Number((absolute / 10 ** exponent).toPrecision(significant));

  if (Math.abs(mantissa) >= 10) {
    mantissa /= 10;
    exponent += 1;
  }

  return `${sign}${mantissa.toFixed(significant - 1)}·10${superscript(exponent)}`;
}

/** Радиус планеты: `0.39` → `≈ 2 485 км` (п. 11.7). */
export function radiusKm(radiusEarth: number): string {
  return `≈ ${formatThousands(radiusEarth * EARTH_RADIUS_KM)} ${HELP_UNIT_TEXT.km}`;
}

/** Масса планеты: `6.07` → `≈ 3.6·10²⁵ кг` (п. 11.7). */
export function massKg(massEarth: number): string {
  return `≈ ${scientific(massEarth * EARTH_MASS_KG)} ${HELP_UNIT_TEXT.kg}`;
}

/**
 * Шкала Кельвина в Цельсий: `288` → `+15 °C`, `273` → `0 °C`,
 * `200` → `−73 °C` (U+2212 для минуса, п. 11.7).
 */
export function kelvinToCelsius(kelvin: number): string {
  const celsius = Math.round(kelvin - KELVIN_TO_CELSIUS_OFFSET);

  if (celsius === 0) return `0 ${HELP_UNIT_TEXT.celsius}`;

  const sign = celsius > 0 ? '+' : '−';

  return `${sign}${formatThousands(Math.abs(celsius))} ${HELP_UNIT_TEXT.celsius}`;
}

/**
 * Расстояние в световых годах: при значении меньше 10 — один знак после
 * точки, иначе целое: `1 пк` → `≈ 3.3 св. лет` (п. 11.7).
 */
export function parsecsToLightYears(parsecs: number): string {
  const lightYears = parsecs * PC_TO_LY;
  const text = lightYears < 10 ? lightYears.toFixed(1) : String(Math.round(lightYears));

  return `≈ ${text} ${HELP_UNIT_TEXT.lightYears}`;
}

/** Расстояние в километрах научной записью: `1 пк` → `≈ 3.1·10¹³ км`. */
export function parsecsToKilometers(parsecs: number): string {
  return `≈ ${scientific(parsecs * PC_TO_KM)} ${HELP_UNIT_TEXT.km}`;
}

/**
 * Склонение слова «год» по записанному числу (п. 11.7).
 *
 * Строка с точкой означает дробное значение и получает «года»:
 * `'1.0'` → «года», `5` → «лет», `1` → «год».
 */
export function yearWord(value: string | number): string {
  if (typeof value === 'string') {
    if (value.includes('.') || value.includes(',')) return HELP_UNIT_TEXT.yearFew;

    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return HELP_UNIT_TEXT.yearMany;

    return yearWord(parsed);
  }

  const absolute = Math.abs(value);
  const lastDigit = absolute % 10;
  const lastTwo = absolute % 100;

  if (lastDigit === 1 && lastTwo !== 11) return HELP_UNIT_TEXT.yearOne;
  if (lastDigit >= 2 && lastDigit <= 4 && (lastTwo < 12 || lastTwo > 14)) {
    return HELP_UNIT_TEXT.yearFew;
  }

  return HELP_UNIT_TEXT.yearMany;
}

/** Период обращения в годы: `365.25` → `≈ 1.0 года` (п. 11.7). */
export function periodYears(days: number): string {
  const years = days / 365.25;
  const text = years.toPrecision(2);

  return `≈ ${text} ${yearWord(text)}`;
}

/** Большая полуось в миллионах километров: `1` → `≈ 150 млн км` (п. 11.7). */
export function auToMlnKm(au: number): string {
  return `≈ ${formatThousands((au * AU_KM) / 1e6)} ${HELP_UNIT_TEXT.mlnKm}`;
}

/** Значение в солнечных единицах: `1` → `= 1 от Солнца`. */
export function solarValue(value: number): string {
  return `= ${formatNumber(value)} ${HELP_UNIT_TEXT.sun}`;
}

/** Значение в процентах: `0.577` → `57.7 %` (п. 11.7). */
export function percentValue(value: number): string {
  return `${(value * 100).toFixed(1)} ${HELP_UNIT_TEXT.percent}`;
}

/** HZD без процентов: `0.12` → `0.12` (диапазон −1…+1). */
export function hzdValue(value: number): string {
  return value.toFixed(2);
}

/**
 * Словесная интерпретация эксцентриситета (п. 11.7):
 * `< 0.1` — почти круг, `< 0.3` — умеренно, иначе сильно вытянутая.
 */
export function eccentricityShape(eccentricity: number): string {
  if (eccentricity <= 0) return HELP_UNIT_TEXT.circle;
  if (eccentricity < 0.1) return HELP_UNIT_TEXT.almostCircle;
  if (eccentricity < 0.3) return HELP_UNIT_TEXT.moderateOrbit;

  return HELP_UNIT_TEXT.strongOrbit;
}
