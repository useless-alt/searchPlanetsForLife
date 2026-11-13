// TEST FIXTURE: данные в этом файле используются только тестами.
import { describe, expect, it } from 'vitest';
import {
  ensureJsonBody,
  NonJsonResponseError,
  parseCsv,
  parseTapResponse,
  pick,
  pickNum,
  pickStr,
  UnknownFormatError,
} from './parser';

describe('parseTapResponse', () => {
  it('разбирает массив объектов', () => {
    const rows = parseTapResponse([{ a: 1 }, { a: 2 }, null, 'x']);
    expect(rows).toEqual([{ a: 1 }, { a: 2 }]);
  });

  it('разбирает TAP-формат metadata + data (массивы значений)', () => {
    const rows = parseTapResponse({
      metadata: [{ name: 'pl_name' }, { name: 'pl_rade' }],
      data: [
        ['TRAPPIST-1 e', 0.92],
        ['TRAPPIST-1 f', null],
      ],
    });
    expect(rows).toEqual([
      { pl_name: 'TRAPPIST-1 e', pl_rade: 0.92 },
      { pl_name: 'TRAPPIST-1 f', pl_rade: null },
    ]);
  });

  it('понимает columns и fields как имена метаданных', () => {
    expect(
      parseTapResponse({
        columns: [{ name: 'a' }, { name: 'b' }],
        data: [[1, 2]],
      }),
    ).toEqual([{ a: 1, b: 2 }]);

    expect(
      parseTapResponse({
        fields: [{ column_name: 'a' }, { column_name: 'b' }],
        data: [[1, 2]],
      }),
    ).toEqual([{ a: 1, b: 2 }]);
  });

  it('разбирает data как массив объектов без metadata', () => {
    expect(parseTapResponse({ data: [{ a: 1 }] })).toEqual([{ a: 1 }]);
  });

  it('бросает UnknownFormatError на мусоре', () => {
    expect(() => parseTapResponse({ foo: 'bar' })).toThrow(UnknownFormatError);
    expect(() => parseTapResponse('text')).toThrow(UnknownFormatError);
    expect(() => parseTapResponse(null)).toThrow(UnknownFormatError);
  });
});

describe('pick', () => {
  it('находит поле без учёта регистра', () => {
    const row = { PL_NAME: 'Kepler-452 b', pl_rade: 1.63 };
    expect(pick(row, 'pl_name')).toBe('Kepler-452 b');
    expect(pick(row, 'PL_RADE')).toBe(1.63);
    expect(pick(row, 'missing')).toBeNull();
  });

  it('pickNum нормализует числа и мусор', () => {
    const row = { a: '1,5', b: 'NaN', c: 3, d: '', e: ' 4 ' };
    expect(pickNum(row, 'a')).toBe(1.5);
    expect(pickNum(row, 'b')).toBeNull();
    expect(pickNum(row, 'c')).toBe(3);
    expect(pickNum(row, 'd')).toBeNull();
    expect(pickNum(row, 'e')).toBe(4);
    expect(pickNum(row, 'missing')).toBeNull();
  });

  it('pickStr возвращает null для пустых строк', () => {
    expect(pickStr({ a: ' x ' }, 'a')).toBe('x');
    expect(pickStr({ a: '   ' }, 'a')).toBeNull();
    expect(pickStr({ a: 5 }, 'a')).toBe('5');
  });
});

describe('parseCsv', () => {
  it('читает CSV с заголовком', () => {
    const rows = parseCsv('a,b\n1,2\n3,4\n');
    expect(rows).toEqual([
      { a: '1', b: '2' },
      { a: '3', b: '4' },
    ]);
  });

  it('не падает на пустом CSV', () => {
    expect(parseCsv('')).toEqual([]);
  });
});

describe('ensureJsonBody', () => {
  it('парсит валидный JSON', () => {
    expect(ensureJsonBody('{"a":1}')).toEqual({ a: 1 });
  });

  it('распознаёт HTML-заглушку', () => {
    expect(() => ensureJsonBody('<!DOCTYPE html><html></html>')).toThrow(NonJsonResponseError);
    expect(() => ensureJsonBody('  <html>error</html>')).toThrow(NonJsonResponseError);
  });

  it('бросает UnknownFormatError на невалидном JSON', () => {
    expect(() => ensureJsonBody('{oops')).toThrow(UnknownFormatError);
  });
});
