/**
 * Тесты приведения значений к числам (задача 8).
 */

import { describe, expect, it } from 'vitest';

import { isFiniteNumber, toNum } from './numbers';

describe('приведение значений каталогов к числам', () => {
  it('числовые строки и числа', () => {
    expect(toNum('3.5')).toBe(3.5);
    expect(toNum(3.5)).toBe(3.5);
    expect(toNum(' -12 ')).toBe(-12);
    expect(toNum('0')).toBe(0);
    expect(toNum('1e3')).toBe(1000);
  });

  it('пустые, нечисловые и нефиничные значения дают null', () => {
    expect(toNum('')).toBeNull();
    expect(toNum('NaN')).toBeNull();
    expect(toNum('inf')).toBeNull();
    expect(toNum('-inf')).toBeNull();
    expect(toNum('Infinity')).toBeNull();
    expect(toNum(null)).toBeNull();
    expect(toNum(undefined)).toBeNull();
    expect(toNum(Number.NaN)).toBeNull();
    expect(toNum(Number.POSITIVE_INFINITY)).toBeNull();
    expect(toNum(Number.NEGATIVE_INFINITY)).toBeNull();
    expect(toNum({})).toBeNull();
  });

  it('проверка конечности числа', () => {
    expect(isFiniteNumber(1)).toBe(true);
    expect(isFiniteNumber(Number.NaN)).toBe(false);
    expect(isFiniteNumber('1')).toBe(false);
  });
});
