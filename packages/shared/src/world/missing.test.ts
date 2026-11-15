import { describe, expect, it } from 'vitest';

import type { SolverFlags } from '../types/solver';

import { missingParams, type MissingDetail } from './missing';
import type { RenderGaps } from './renderGaps';

/**
 * Тесты списка недостающих параметров (задача 27; п. 9.2).
 *
 * Проверяются формулировки, порядок, удаление повторов и пустой список
 * при полных данных.
 */

/** Флаги решателя по умолчанию. */
function flags(overrides: Partial<SolverFlags> = {}): SolverFlags {
  return {
    insufficient_data: false,
    levelB_mass: false,
    levelB_radius: false,
    e_assumed_zero: false,
    excluded_subindices: [],
    k: 4,
    n: 4,
    strict_complete: false,
    available: {
      ESI_R: true,
      ESI_rho: true,
      ESI_ve: true,
      ESI_S: true,
      ESI_T: true,
      F_HZ: true,
    },
    ...overrides,
  };
}

/** Пробелы данных. */
function gaps(overrides: Partial<RenderGaps> = {}): RenderGaps {
  return {
    planet: [],
    star: [],
    planetStub: false,
    starStub: false,
    ...overrides,
  };
}

/** Деталь с нужными пробелами. */
function detail(
  gapsPatch: Partial<RenderGaps> = {},
  flagsPatch: Partial<SolverFlags> = {},
): MissingDetail {
  return { gaps: gaps(gapsPatch), resolved: { flags: flags(flagsPatch) } };
}

describe('missingParams', () => {
  it('планета: R = null и T_eq = null', () => {
    const items = missingParams(detail({ planet: ['R', 'T_eq'] }));

    expect(items.map((item) => item.label)).toEqual([
      'радиус планеты',
      'равновесная температура планеты',
    ]);
  });

  it('звезда: st_teff = null и L_or_st_rad = null', () => {
    const items = missingParams(detail({ star: ['st_teff', 'L_or_st_rad'] }));

    expect(items.map((item) => item.label)).toEqual([
      'температура звезды',
      'светимость или радиус звезды',
    ]);
  });

  it('недостаточные данные: исключённые ESI_rho и F_HZ', () => {
    const items = missingParams(
      detail({}, { insufficient_data: true, excluded_subindices: ['ESI_rho', 'F_HZ'] }),
    );

    expect(items.map((item) => item.label)).toEqual([
      'плотность (масса и радиус)',
      'параметры звезды или орбиты (температура звезды, светимость, большая полуось)',
    ]);
  });

  it('удаляет повторы по формулировке', () => {
    const items = missingParams(
      detail(
        { planet: ['R'], star: [] },
        {
          insufficient_data: true,
          excluded_subindices: ['ESI_R'],
        },
      ),
    );

    expect(items).toHaveLength(1);
    expect(items[0]?.label).toBe('радиус планеты');
  });

  it('порядок: планета → звезда → субиндексы', () => {
    const items = missingParams(
      detail(
        { planet: ['R'], star: ['st_teff'] },
        {
          insufficient_data: true,
          excluded_subindices: ['ESI_ve'],
        },
      ),
    );

    expect(items.map((item) => item.label)).toEqual([
      'радиус планеты',
      'температура звезды',
      'вторая космическая скорость (масса и радиус)',
    ]);
  });

  it('полные данные → []', () => {
    expect(missingParams(detail())).toEqual([]);
  });

  it('scope = star оставляет только параметры звезды', () => {
    const items = missingParams(
      detail({ planet: ['R'], star: ['st_teff'] }, { insufficient_data: true }),
      'star',
    );

    expect(items.map((item) => item.label)).toEqual(['температура звезды']);
  });
});
