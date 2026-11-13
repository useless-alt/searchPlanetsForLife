// TEST FIXTURE: данные в этом файле используются только тестами.
import { describe, expect, it } from 'vitest';
import {
  angularSeparationArcsec,
  hostKey,
  normName,
  planetId,
  planetLetter,
  splitAliases,
} from './names';

describe('normName', () => {
  it('убирает регистр, пробелы и пунктуацию', () => {
    expect(normName('TRAPPIST-1 e')).toBe('trappist1e');
    expect(normName('TRAPPIST-1 e')).toBe(normName('trappist 1 e'));
    expect(normName('Kepler-452 b')).toBe('kepler452b');
    expect(normName('  HD 209458 b  ')).toBe('hd209458b');
    expect(normName('55 Cnc e')).toBe(normName('55-Cnc-e'));
  });

  it('снимает диакритику', () => {
    expect(normName('Épsilon')).toBe(normName('epsilon'));
  });
});

describe('splitAliases', () => {
  it('делит алиасы по запятой, точке с запятой и вертикальной черте', () => {
    expect(splitAliases('A b; B b | C b,D b')).toEqual(['A b', 'B b', 'C b', 'D b']);
    expect(splitAliases('  ')).toEqual([]);
    expect(splitAliases(null)).toEqual([]);
    expect(splitAliases(undefined)).toEqual([]);
  });
});

describe('planetLetter', () => {
  it('извлекает букву планеты', () => {
    expect(planetLetter('TRAPPIST-1 e')).toBe('e');
    expect(planetLetter('Kepler-452 b')).toBe('b');
    expect(planetLetter('55 Cnc e')).toBe('e');
    expect(planetLetter('Kepler-16(AB)b')).toBe('b');
    expect(planetLetter('Sun')).toBeNull();
  });
});

describe('hostKey', () => {
  it('отбрасывает букву планеты', () => {
    expect(hostKey('TRAPPIST-1 e')).toBe(normName('TRAPPIST-1'));
    expect(hostKey('Kepler-452 b')).toBe(normName('Kepler-452'));
    expect(hostKey('HD 209458 b')).toBe(normName('HD 209458'));
  });

  it('не трогает имя без буквы', () => {
    expect(hostKey('Proxima Centauri')).toBe(normName('Proxima Centauri'));
  });
});

describe('angularSeparationArcsec', () => {
  it('ноль для одинаковых координат', () => {
    expect(angularSeparationArcsec(10, 20, 10, 20)).toBe(0);
  });

  it('считает угловые секунды', () => {
    const sep = angularSeparationArcsec(10, 20, 10, 20 + 1 / 3600);
    expect(sep).toBeCloseTo(1, 4);
  });

  it('учитывает сжатие по склонению', () => {
    const oneArcsecRa = 1 / 3600;
    const atEquator = angularSeparationArcsec(0, 0, oneArcsecRa, 0);
    const atSixty = angularSeparationArcsec(0, 60, oneArcsecRa, 60);
    expect(atSixty).toBeCloseTo(atEquator * 0.5, 4);
  });
});

describe('planetId', () => {
  it('стабилен и читаем', () => {
    expect(planetId(7, 'TRAPPIST-1 e')).toBe('p7-trappist1e');
  });
});
