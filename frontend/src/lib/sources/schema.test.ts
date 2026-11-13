// TEST FIXTURE: данные в этом файле используются только тестами.
import { describe, expect, it } from 'vitest';
import { intersectColumns } from './schema';

describe('SCHEMA GUARD: intersectColumns', () => {
  it('оставляет только существующие колонки в порядке желаемых', () => {
    const check = intersectColumns(
      ['pl_name', 'pl_rade', 'pl_missing'],
      ['PL_NAME', 'pl_rade', 'st_teff'],
    );
    expect(check.selected).toEqual(['pl_name', 'pl_rade']);
    expect(check.missing).toEqual(['pl_missing']);
    expect(check.available).toEqual(['PL_NAME', 'pl_rade', 'st_teff']);
  });

  it('сравнивает имена без учёта регистра', () => {
    const check = intersectColumns(['A', 'b'], ['a', 'B']);
    expect(check.selected).toEqual(['A', 'b']);
    expect(check.missing).toEqual([]);
  });

  it('возвращает пустой список, если схемы нет', () => {
    const check = intersectColumns(['a', 'b'], []);
    expect(check.selected).toEqual([]);
    expect(check.missing).toEqual(['a', 'b']);
  });

  it('не добавляет лишние колонки', () => {
    const check = intersectColumns(['a'], ['a', 'b', 'c']);
    expect(check.selected).toEqual(['a']);
  });
});
