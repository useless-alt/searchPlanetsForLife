/**
 * Тесты разбора CSV-ответов TAP (задача 8).
 */

import { describe, expect, it } from 'vitest';

import { parseCsv, parseCsvRows } from './csv';

describe('разбор CSV по RFC 4180', () => {
  it('обычные строки и запятые', () => {
    expect(parseCsv('a,b\n1,2\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('кавычки, удвоенные кавычки и перевод строки внутри кавычек', () => {
    const text = 'name,note\n"HD 209458, b","вторая ""строка""\nи третья"\n';
    expect(parseCsv(text)).toEqual([
      ['name', 'note'],
      ['HD 209458, b', 'вторая "строка"\nи третья'],
    ]);
  });

  it('пустая строка без перевода строки в конце файла', () => {
    expect(parseCsv('a,b')).toEqual([['a', 'b']]);
  });

  it('заголовок приводится к нижнему регистру, пустые значения дают null', () => {
    const rows = parseCsvRows('PL_NAME,hostname\nKepler-442 b,\n');
    expect(rows).toEqual([{ pl_name: 'Kepler-442 b', hostname: null }]);
  });

  it('пустой текст не даёт строк', () => {
    expect(parseCsvRows('')).toEqual([]);
  });
});
