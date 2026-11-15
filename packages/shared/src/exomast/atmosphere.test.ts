import { describe, expect, it } from 'vitest';

import { EXOMAST_ATMOSPHERE_KEYS, extractAtmosphere, normalizeMoleculeName } from './atmosphere';

describe('extractAtmosphere', () => {
  it('по умолчанию ключей нет: результат пуст (U26, U52)', () => {
    const result = extractAtmosphere({ atmosphere: 'H2O, CH4' });

    expect(EXOMAST_ATMOSPHERE_KEYS).toEqual([]);
    expect(result).toEqual({ molecules: [], keys: [] });
  });

  it('разбирает строки и массивы по указанным ключам без учёта регистра', () => {
    const result = extractAtmosphere(
      {
        Atmosphere: 'H₂O, CH₄; CO₂',
        'atmosphere species': ['Na', 'K'],
        other: 'не атмосфера',
      },
      ['ATMOSPHERE', 'Atmosphere Species'],
    );

    expect(result.molecules).toEqual(['H2O', 'CH4', 'CO2', 'Na', 'K']);
    expect(result.keys).toEqual(['ATMOSPHERE', 'Atmosphere Species']);
  });

  it('нормализует регистр и подстрочные цифры, удаляет повторы', () => {
    const result = extractAtmosphere({ atmosphere: 'H₂O, h2o, H2O; CH4 | ch4' }, ['atmosphere']);

    expect(result.molecules).toEqual(['H2O', 'CH4']);
    expect(normalizeMoleculeName('h₂o')).toBe('H2O');
    expect(normalizeMoleculeName('co2')).toBe('CO2');
  });

  it('пустое значение не даёт ключа в результате', () => {
    const result = extractAtmosphere({ atmosphere: ' , ; ' }, ['atmosphere']);

    expect(result).toEqual({ molecules: [], keys: [] });
  });
});
