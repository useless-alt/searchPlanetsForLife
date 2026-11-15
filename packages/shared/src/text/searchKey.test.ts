import { describe, expect, it } from 'vitest';

import { searchKey } from './searchKey';

/** Тесты нормализации поискового запроса (задача 14; п. 13.2). */
describe('searchKey', () => {
  it('приводит три записи TRAPPIST-1 d к одному ключу', () => {
    const expected = searchKey('TRAPPIST-1 d');

    expect(searchKey('trappist 1d')).toBe(expected);
    expect(searchKey('TRAPPIST‑1d')).toBe(expected);
  });

  it('различает букву планеты в одной системе', () => {
    expect(searchKey('Kepler-289 b')).not.toBe(searchKey('Kepler-289 c'));
  });

  it('удаляет диакритику и пунктуацию', () => {
    expect(searchKey('  Kepler—289   b! ')).toBe('kepler289b');
    expect(searchKey('Bételgeuse')).toBe('betelgeuse');
  });

  it('сохраняет кириллицу и греческий как есть', () => {
    expect(searchKey('Земля (β)')).toBe('земляβ');
  });

  it('пустой результат — пустая строка', () => {
    expect(searchKey('')).toBe('');
    expect(searchKey('  —  ')).toBe('');
  });
});
