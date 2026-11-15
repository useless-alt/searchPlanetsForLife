import { describe, expect, it } from 'vitest';

import { approx, formatDist, formatNum, formatPercent, formatTemp } from './format';

/**
 * Тесты форматирования таблицы (задача 16; п. 4.2).
 *
 * Проверяются границы разрядности, процентная запись с точкой и префикс
 * расчётного значения.
 */

describe('formatNum', () => {
  it('выбирает число знаков по величине', () => {
    expect(formatNum(250.4)).toBe('250');
    expect(formatNum(15.55)).toBe('15.6');
    expect(formatNum(5.5)).toBe('5.50');
    expect(formatNum(0.0049)).toBe('4.9e-3');
  });

  it('показывает ноль с двумя знаками и отсутствующее значение длинным тире', () => {
    expect(formatNum(0)).toBe('0.00');
    expect(formatNum(null)).toBe('—');
    expect(formatNum(Number.NaN)).toBe('—');
  });
});

describe('formatPercent', () => {
  it('переводит долю в проценты с одним знаком после точки', () => {
    expect(formatPercent(0.577)).toBe('57.7%');
    expect(formatPercent(1)).toBe('100.0%');
    expect(formatPercent(null)).toBe('—');
  });
});

describe('formatTemp и formatDist', () => {
  it('округляет температуру до целого', () => {
    expect(formatTemp(254.6)).toBe('255');
    expect(formatTemp(null)).toBe('—');
  });

  it('выбирает число знаков расстояния по величине', () => {
    expect(formatDist(123.4)).toBe('123');
    expect(formatDist(12.34)).toBe('12.3');
    expect(formatDist(1.234)).toBe('1.23');
    expect(formatDist(null)).toBe('—');
  });
});

describe('approx', () => {
  it('помечает модельные и оценочные значения, измеренные и физические — нет', () => {
    expect(approx('2.03', 'model')).toBe('~2.03');
    expect(approx('2.03', 'estimate')).toBe('~2.03');
    expect(approx('2.03', 'physics')).toBe('2.03');
    expect(approx('2.03', 'measured')).toBe('2.03');
    expect(approx('2.03', null)).toBe('2.03');
    expect(approx('—', 'model')).toBe('—');
  });
});
