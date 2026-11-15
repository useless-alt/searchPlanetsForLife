import { describe, expect, it } from 'vitest';

import {
  auToMlnKm,
  eccentricityShape,
  formatThousands,
  kelvinToCelsius,
  massKg,
  parsecsToKilometers,
  parsecsToLightYears,
  percentValue,
  periodYears,
  radiusKm,
  yearWord,
} from './units';

/**
 * Тесты пересчёта единиц (задача 17; п. 11.7).
 *
 * Примеры совпадают с ТЗ: 0.39 R⊕ ≈ 2 485 км, 6.07 M⊕ ≈ 3.6·10²⁵ кг,
 * 288 K = +15 °C, 200 K = −73 °C. Разряды отделяются неразрывным пробелом.
 */

const NBSP = '\u00a0';

describe('formatThousands', () => {
  it('отделяет разряды неразрывным пробелом', () => {
    expect(formatThousands(2485)).toBe(`2${NBSP}485`);
    expect(formatThousands(6371)).toBe(`6${NBSP}371`);
  });
});

describe('радиус и масса', () => {
  it('переводит радиус Земли в километры', () => {
    expect(radiusKm(0.39)).toBe(`≈ 2${NBSP}485 км`);
    expect(radiusKm(1)).toBe(`≈ 6${NBSP}371 км`);
  });

  it('переводит массу Земли в килограммы', () => {
    expect(massKg(6.07)).toBe('≈ 3.6·10²⁵ кг');
    expect(massKg(1)).toBe('≈ 6.0·10²⁴ кг');
  });
});

describe('температура', () => {
  it('переводит кельвины в цельсии со знаком', () => {
    expect(kelvinToCelsius(288)).toBe('+15 °C');
    expect(kelvinToCelsius(273)).toBe('0 °C');
    expect(kelvinToCelsius(373)).toBe('+100 °C');
    expect(kelvinToCelsius(2566)).toBe(`+2${NBSP}293 °C`);
  });

  it('использует минус U+2212 для отрицательных значений', () => {
    expect(kelvinToCelsius(200)).toBe('−73 °C');
  });
});

describe('расстояние', () => {
  it('переводит парсеки в световые годы', () => {
    expect(parsecsToLightYears(1)).toBe('≈ 3.3 св. лет');
  });

  it('переводит парсеки в километры научной записью', () => {
    expect(parsecsToKilometers(1)).toBe('≈ 3.1·10¹³ км');
  });

  it('переводит астрономические единицы в миллионы километров', () => {
    expect(auToMlnKm(1)).toBe('≈ 150 млн км');
  });
});

describe('период обращения', () => {
  it('переводит сутки в годы с двумя значащими цифрами', () => {
    expect(periodYears(365.25)).toBe('≈ 1.0 года');
  });

  it('склоняет слово «год» по записанному числу', () => {
    expect(yearWord('1.0')).toBe('года');
    expect(yearWord(5)).toBe('лет');
    expect(yearWord(1)).toBe('год');
    expect(yearWord(2)).toBe('года');
  });
});

describe('интерпретация значений', () => {
  it('называет форму орбиты по эксцентриситету', () => {
    expect(eccentricityShape(0)).toBe('круг');
    expect(eccentricityShape(0.05)).toBe('почти круг');
    expect(eccentricityShape(0.2)).toBe('умеренно вытянутая');
    expect(eccentricityShape(0.5)).toBe('сильно вытянутая');
  });

  it('показывает доли в процентах', () => {
    expect(percentValue(0.577)).toBe('57.7 %');
  });
});
