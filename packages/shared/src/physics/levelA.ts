import { DAYS_PER_YEAR, RHO_EARTH, SUN_TEFF_K, T_EQ_COEFF } from '../constants/solver';
import type { ParamValue } from '../types/provenance';

import { derivedProvenance, makeParam, nullParam } from './provenance';

/**
 * Уровень А каскадного решателя пропусков (п. 1 ТЗ).
 *
 * Только точные физические законы: погрешность < 2 %, штраф к Q_data
 * не применяется. Отсутствующее или нефизичное значение (null, NaN,
 * ±Infinity, значение вне допустимого диапазона) трактуется как отсутствующее.
 * Функции чистые: вход не мутируется, исключения не бросаются.
 */

/** Положительное конечное значение. */
function isPositive(value: number): boolean {
  return value > 0;
}

/** Эксцентриситет в допустимом диапазоне [0, 1). */
function isEccentricity(value: number): boolean {
  return value >= 0 && value < 1;
}

/** Читает пригодное значение параметра; иначе null. */
function readValue(
  param: ParamValue,
  isValid: (value: number) => boolean = isPositive,
): number | null {
  const value = param.value;
  if (value === null || !Number.isFinite(value) || !isValid(value)) return null;
  return value;
}

/** Отсекает нефизичный результат вычисления. */
function finitePositive(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

/**
 * Светимость звезды [L☉].
 *
 * Если st_lum задано, L = 10^st_lum (перевод из логарифма, происхождение —
 * measured). Иначе по закону Стефана — Больцмана L = st_rad² · (st_teff/5772)⁴.
 */
export function resolveLuminosity(
  st_lum: ParamValue,
  st_rad: ParamValue,
  st_teff: ParamValue,
): ParamValue {
  const logLuminosity = readValue(st_lum, () => true);
  if (logLuminosity !== null) {
    const luminosity = 10 ** logLuminosity;
    if (!finitePositive(luminosity)) return nullParam();
    return makeParam(luminosity, 'measured', st_lum.source, st_lum.sourceDate);
  }

  const radius = readValue(st_rad);
  const effectiveTeff = readValue(st_teff);
  if (radius === null || effectiveTeff === null) return nullParam();

  const luminosity = radius ** 2 * (effectiveTeff / SUN_TEFF_K) ** 4;
  if (!finitePositive(luminosity)) return nullParam();

  return makeParam(luminosity, derivedProvenance([st_rad, st_teff]));
}

/**
 * Большая полуось орбиты [а.е.].
 *
 * Если d задано, возвращается без изменений. Иначе по третьему закону
 * Кеплера d = (st_mass · (P/365.25)²)^(1/3). Масса планеты в формуле
 * не участвует (в ТЗ задан только st_mass).
 */
export function resolveSemiMajorAxis(
  d: ParamValue,
  P: ParamValue,
  st_mass: ParamValue,
): ParamValue {
  const semiMajorAxis = readValue(d);
  if (semiMajorAxis !== null) return d;

  const period = readValue(P);
  const starMass = readValue(st_mass);
  if (period === null || starMass === null) return nullParam();

  const computed = (starMass * (period / DAYS_PER_YEAR) ** 2) ** (1 / 3);
  if (!finitePositive(computed)) return nullParam();

  return makeParam(computed, derivedProvenance([P, st_mass]));
}

/**
 * Период обращения [сут].
 *
 * Если P задано, возвращается без изменений. Иначе
 * P = 365.25 · sqrt(d³ / st_mass).
 */
export function resolvePeriod(P: ParamValue, d: ParamValue, st_mass: ParamValue): ParamValue {
  const period = readValue(P);
  if (period !== null) return P;

  const semiMajorAxis = readValue(d);
  const starMass = readValue(st_mass);
  if (semiMajorAxis === null || starMass === null) return nullParam();

  const computed = DAYS_PER_YEAR * Math.sqrt(semiMajorAxis ** 3 / starMass);
  if (!finitePositive(computed)) return nullParam();

  return makeParam(computed, derivedProvenance([d, st_mass]));
}

/** Результат расчёта потока излучения. */
export interface InsolationResult {
  /** Значение потока излучения [S⊕]. */
  value: ParamValue;
  /** Эксцентриситет отсутствовал и был принят равным нулю. */
  eAssumedZero: boolean;
}

/**
 * Поток излучения у планеты [S⊕].
 *
 * Если pl_insol задано, возвращается без изменений. Иначе
 * S = L / (d² · sqrt(1 − e²)); при отсутствующем e принимается e = 0
 * и выставляется eAssumedZero. Эксцентриситет вне [0, 1) — значение отсутствует.
 */
export function resolveInsolation(
  pl_insol: ParamValue,
  L: ParamValue,
  d: ParamValue,
  e: ParamValue,
): InsolationResult {
  const measured = readValue(pl_insol);
  if (measured !== null) return { value: pl_insol, eAssumedZero: false };

  const luminosity = readValue(L);
  const semiMajorAxis = readValue(d);
  if (luminosity === null || semiMajorAxis === null) {
    return { value: nullParam(), eAssumedZero: false };
  }

  const eccentricity = e.value;
  let eccentricityUsed: number;
  let eAssumedZero = false;

  if (eccentricity === null || !Number.isFinite(eccentricity)) {
    eccentricityUsed = 0;
    eAssumedZero = true;
  } else if (isEccentricity(eccentricity)) {
    eccentricityUsed = eccentricity;
  } else {
    return { value: nullParam(), eAssumedZero: false };
  }

  const insolation = luminosity / (semiMajorAxis ** 2 * Math.sqrt(1 - eccentricityUsed ** 2));
  if (!finitePositive(insolation)) return { value: nullParam(), eAssumedZero: false };

  return {
    value: makeParam(insolation, derivedProvenance([L, d, e])),
    eAssumedZero,
  };
}

/**
 * Равновесная температура [К]: T_eq = 255 · S^0.25.
 *
 * Если pl_eqt задано, возвращается без изменений. Иначе температура
 * считается от разрешённого потока (в том числе измеренного pl_insol).
 */
export function resolveEquilibriumTemperature(pl_eqt: ParamValue, S: ParamValue): ParamValue {
  const measured = readValue(pl_eqt);
  if (measured !== null) return pl_eqt;

  const insolation = readValue(S);
  if (insolation === null) return nullParam();

  const equilibriumTeff = T_EQ_COEFF * insolation ** 0.25;
  if (!finitePositive(equilibriumTeff)) return nullParam();

  return makeParam(equilibriumTeff, derivedProvenance([S]));
}

/**
 * Средняя плотность [г/см³]: rho = 5.51 · (M / R³), M и R в земных единицах.
 */
export function resolveDensity(M: ParamValue, R: ParamValue): ParamValue {
  const mass = readValue(M);
  const radius = readValue(R);
  if (mass === null || radius === null) return nullParam();

  const density = RHO_EARTH * (mass / radius ** 3);
  if (!finitePositive(density)) return nullParam();

  return makeParam(density, derivedProvenance([M, R]));
}

/** Исходные данные для Уровня А. */
export interface LevelAInput {
  /** Радиус планеты [R⊕]. */
  pl_rade: ParamValue;
  /** Масса планеты [M⊕]. */
  pl_bmasse: ParamValue;
  /** Большая полуось [а.е.]. */
  pl_orbsmax: ParamValue;
  /** Период обращения [сут]. */
  pl_orbper: ParamValue;
  /** Эксцентриситет. */
  pl_orbeccen: ParamValue;
  /** Поток излучения [S⊕]. */
  pl_insol: ParamValue;
  /** Равновесная температура из каталога [К]. */
  pl_eqt: ParamValue;
  /** Эффективная температура звезды [К]. */
  st_teff: ParamValue;
  /** Радиус звезды [R☉]. */
  st_rad: ParamValue;
  /** Масса звезды [M☉]. */
  st_mass: ParamValue;
  /** Светимость звезды в логарифмах [log10(L/L☉)]. */
  st_lum: ParamValue;
}

/** Результат Уровня А. */
export interface LevelAResult {
  /** Светимость звезды [L☉]. */
  L: ParamValue;
  /** Большая полуось [а.е.]. */
  d: ParamValue;
  /** Период обращения [сут]. */
  P: ParamValue;
  /** Поток излучения [S⊕]. */
  S: ParamValue;
  /** Равновесная температура [К]. */
  T_eq: ParamValue;
  /** Средняя плотность [г/см³]. */
  rho: ParamValue;
  /** Эксцентриситет был принят равным нулю. */
  eAssumedZero: boolean;
}

/**
 * Прогон Уровня А: L → d → P → S → T_eq → rho.
 *
 * Функция чистая и идемпотентная: повторный вызов на уже дополненных данных
 * возвращает тот же результат и не перезаписывает присутствующие значения.
 * Это нужно для повторного расчёта rho после Уровня Б (Задача 4).
 */
export function applyLevelA(input: LevelAInput): LevelAResult {
  const L = resolveLuminosity(input.st_lum, input.st_rad, input.st_teff);
  const d = resolveSemiMajorAxis(input.pl_orbsmax, input.pl_orbper, input.st_mass);
  const P = resolvePeriod(input.pl_orbper, d, input.st_mass);
  const insolation = resolveInsolation(input.pl_insol, L, d, input.pl_orbeccen);
  const T_eq = resolveEquilibriumTemperature(input.pl_eqt, insolation.value);
  const rho = resolveDensity(input.pl_bmasse, input.pl_rade);

  return {
    L,
    d,
    P,
    S: insolation.value,
    T_eq,
    rho,
    eAssumedZero: insolation.eAssumedZero,
  };
}
