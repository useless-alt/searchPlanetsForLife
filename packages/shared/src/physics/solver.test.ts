import { describe, expect, it } from 'vitest';

import type { PlanetRecord, RawParamKey } from '../types/planet';
import type { ParamValue } from '../types/provenance';

import { restoreMassFromRadius, restoreRadiusFromMass } from './levelB';
import { makeParam, nullParam } from './provenance';
import { solveCatalog, solvePlanet } from './solver';

const measured = (value: number | null): ParamValue => makeParam(value, 'measured');

function rawParams(
  overrides: Partial<Record<RawParamKey, ParamValue>> = {},
): Record<RawParamKey, ParamValue> {
  const base: Record<RawParamKey, ParamValue> = {
    pl_rade: nullParam(),
    pl_bmasse: nullParam(),
    pl_orbsmax: nullParam(),
    pl_orbper: nullParam(),
    pl_orbeccen: nullParam(),
    pl_insol: nullParam(),
    pl_eqt: nullParam(),
    st_teff: nullParam(),
    st_rad: nullParam(),
    st_mass: nullParam(),
    st_lum: nullParam(),
    sy_dist: nullParam(),
    ra: nullParam(),
    dec: nullParam(),
  };

  return { ...base, ...overrides };
}

function makeRecord(overrides: Partial<Record<RawParamKey, ParamValue>> = {}): PlanetRecord {
  return {
    id: 'test-planet',
    name: 'Test Planet b',
    aliases: [],
    hostname: 'Test Star',
    letter: 'b',
    sources: ['nasa'],
    params: rawParams(overrides),
  };
}

describe('Уровень Б: масса по радиусу', () => {
  it('R = 1.0 даёт M = 1.0', () => {
    expect(restoreMassFromRadius(measured(1)).value).toBeCloseTo(1.0, 3);
  });

  it('R = 1.2 даёт M = 1.9207', () => {
    expect(restoreMassFromRadius(measured(1.2)).value).toBeCloseTo(1.9207, 3);
  });

  it('R = 1.23 даёт M = 2.033 по второй ветви', () => {
    expect(restoreMassFromRadius(measured(1.23)).value).toBeCloseTo(2.033, 3);
  });

  it('R = 2.0 даёт M = 4.646', () => {
    expect(restoreMassFromRadius(measured(2.0)).value).toBeCloseTo(4.646, 3);
  });

  it('восстановленное значение имеет происхождение model без источника', () => {
    const restored = restoreMassFromRadius(measured(2));

    expect(restored.provenance).toBe('model');
    expect(restored.source).toBeNull();
    expect(restored.sourceDate).toBeNull();
  });

  it('нефизичный радиус даёт отсутствие значения', () => {
    expect(restoreMassFromRadius(nullParam()).value).toBeNull();
    expect(restoreMassFromRadius(measured(0)).value).toBeNull();
    expect(restoreMassFromRadius(measured(-1)).value).toBeNull();
  });
});

describe('Уровень Б: радиус по массе', () => {
  it('M = 1.0 даёт R = 1.0', () => {
    expect(restoreRadiusFromMass(measured(1)).value).toBeCloseTo(1.0, 3);
  });

  it('M = 1.5 даёт R = 1.120', () => {
    expect(restoreRadiusFromMass(measured(1.5)).value).toBeCloseTo(1.12, 3);
  });

  it('M = 2.04 даёт R = 1.232 по второй ветви', () => {
    expect(restoreRadiusFromMass(measured(2.04)).value).toBeCloseTo(1.232, 3);
  });

  it('M = 5 даёт R = 2.087', () => {
    expect(restoreRadiusFromMass(measured(5)).value).toBeCloseTo(2.087, 3);
  });

  it('M = 10 даёт R = 3.137', () => {
    expect(restoreRadiusFromMass(measured(10)).value).toBeCloseTo(3.137, 3);
  });

  it('M = 131.9 даёт значение', () => {
    expect(restoreRadiusFromMass(measured(131.9)).value).not.toBeNull();
  });

  it('M = 132 даёт отсутствие значения (U5)', () => {
    expect(restoreRadiusFromMass(measured(132)).value).toBeNull();
  });

  it('M = 0 даёт отсутствие значения', () => {
    expect(restoreRadiusFromMass(measured(0)).value).toBeNull();
  });
});

describe('Уровень Б не запускается, если известны и R, и M', () => {
  it('значения не меняются, флаги levelB_* равны false', () => {
    const resolved = solvePlanet(makeRecord({ pl_rade: measured(2), pl_bmasse: measured(9) }));

    expect(resolved.R.value).toBe(2);
    expect(resolved.M.value).toBe(9);
    expect(resolved.flags.levelB_mass).toBe(false);
    expect(resolved.flags.levelB_radius).toBe(false);
  });
});

describe('каскад оркестратора', () => {
  const earthLike = {
    pl_rade: measured(1),
    pl_bmasse: measured(1),
    pl_orbper: measured(365.25),
    pl_orbeccen: measured(0.0167),
    st_rad: measured(1),
    st_teff: measured(5772),
    st_mass: measured(1),
  };

  it('землеподобная запись считается целиком', () => {
    const resolved = solvePlanet(makeRecord(earthLike));

    expect(resolved.L.value).toBeCloseTo(1, 9);
    expect(resolved.d.value).toBeCloseTo(1, 9);
    expect(resolved.S.value).toBeCloseTo(1.00014, 5);
    expect(resolved.T_eq.value).toBeCloseTo(255, 0);
    expect(resolved.rho.value).toBeCloseTo(5.51, 9);
    expect(resolved.flags.k).toBe(4);
    expect(resolved.flags.n).toBe(4);
    expect(resolved.flags.excluded_subindices).toEqual([]);
    expect(resolved.flags.insufficient_data).toBe(false);
    expect(resolved.flags.e_assumed_zero).toBe(false);
  });

  it('без st_teff недоступен F_HZ, k = 3, данных достаточно', () => {
    const resolved = solvePlanet(makeRecord({ ...earthLike, st_teff: nullParam() }));

    expect(resolved.flags.available.F_HZ).toBe(false);
    expect(resolved.flags.excluded_subindices).toEqual(['F_HZ']);
    expect(resolved.flags.k).toBe(3);
    expect(resolved.flags.insufficient_data).toBe(false);
  });

  it('при одной массе радиус восстанавливается, плотность и ve вычисляются', () => {
    const resolved = solvePlanet(makeRecord({ pl_bmasse: measured(10) }));

    expect(resolved.R.value).toBeCloseTo(3.137, 3);
    expect(resolved.flags.levelB_radius).toBe(true);
    expect(resolved.flags.levelB_mass).toBe(false);
    expect(resolved.rho.value).not.toBeNull();
    expect(resolved.flags.available.ESI_ve).toBe(true);
    expect(resolved.flags.excluded_subindices).toEqual(['F_HZ']);
    expect(resolved.flags.k).toBe(3);
    expect(resolved.flags.insufficient_data).toBe(false);
  });

  it('при M = 1000 радиус не восстанавливается, k = 0, данных недостаточно', () => {
    const resolved = solvePlanet(makeRecord({ pl_bmasse: measured(1000) }));

    expect(resolved.R.value).toBeNull();
    expect(resolved.flags.k).toBe(0);
    expect(resolved.flags.insufficient_data).toBe(true);
  });

  it('отсутствующий эксцентриситет принимается нулевым с происхождением estimate', () => {
    const resolved = solvePlanet(makeRecord({ pl_rade: measured(1), pl_bmasse: measured(1) }));

    expect(resolved.e.value).toBe(0);
    expect(resolved.e.provenance).toBe('estimate');
    expect(resolved.flags.e_assumed_zero).toBe(true);
  });

  it('плотность, посчитанная после Уровня Б, имеет происхождение model', () => {
    const resolved = solvePlanet(makeRecord({ pl_bmasse: measured(10) }));

    expect(resolved.rho.provenance).toBe('model');
  });

  it('порядок каскада: плотность вычисляется после Уровня Б, а не остаётся null', () => {
    const withoutLevelB = solvePlanet(makeRecord({ pl_bmasse: measured(10) }));

    expect(withoutLevelB.rho.value).not.toBeNull();
    // rho = 5.51 · (M / R³), где R = 0.81 · M^0.588 = 3.13679…
    const restoredRadius = 0.81 * 10 ** 0.588;
    expect(withoutLevelB.rho.value).toBeCloseTo(5.51 * (10 / restoredRadius ** 3), 9);
    expect(withoutLevelB.rho.value).toBeCloseTo(1.7852, 3);
  });

  it('невычислимые значения не подменяются числами', () => {
    const resolved = solvePlanet(makeRecord());

    expect(resolved.R.value).toBeNull();
    expect(resolved.M.value).toBeNull();
    expect(resolved.rho.value).toBeNull();
    expect(resolved.S.value).toBeNull();
    expect(resolved.T_eq.value).toBeNull();
    expect(resolved.L.value).toBeNull();
    expect(resolved.d.value).toBeNull();
    expect(resolved.P.value).toBeNull();
    // единственное исключение — эксцентриситет
    expect(resolved.e.value).toBe(0);
    expect(resolved.e.provenance).toBe('estimate');
  });
});

describe('strict_complete (U19)', () => {
  const complete = {
    pl_rade: measured(1),
    pl_bmasse: measured(1),
    pl_insol: measured(1),
    pl_orbsmax: measured(1),
    pl_orbeccen: measured(0.0167),
    st_teff: measured(5772),
    st_lum: measured(0),
  };

  it('полный набор измеренных полей даёт strict_complete = true', () => {
    expect(solvePlanet(makeRecord(complete)).flags.strict_complete).toBe(true);
  });

  it('отсутствие pl_insol даёт strict_complete = false', () => {
    const resolved = solvePlanet(makeRecord({ ...complete, pl_insol: nullParam() }));

    expect(resolved.flags.strict_complete).toBe(false);
  });

  it('происхождение physics вместо measured даёт strict_complete = false', () => {
    const resolved = solvePlanet(makeRecord({ ...complete, st_teff: makeParam(5772, 'physics') }));

    expect(resolved.flags.strict_complete).toBe(false);
  });

  it('происхождение model вместо measured даёт strict_complete = false', () => {
    const resolved = solvePlanet(makeRecord({ ...complete, pl_rade: makeParam(1, 'model') }));

    expect(resolved.flags.strict_complete).toBe(false);
  });
});

describe('чистота и идемпотентность', () => {
  it('повторный вызов даёт идентичный результат', () => {
    const record = makeRecord({
      pl_rade: measured(1),
      pl_bmasse: measured(1),
      pl_orbper: measured(365.25),
      st_mass: measured(1),
      st_rad: measured(1),
      st_teff: measured(5772),
    });

    expect(solvePlanet(record)).toEqual(solvePlanet(record));
  });

  it('замороженная запись не вызывает ошибок и не меняется', () => {
    const record = Object.freeze(
      makeRecord({
        pl_rade: measured(1),
        pl_bmasse: measured(1),
        pl_orbper: measured(365.25),
        st_mass: measured(1),
        st_rad: measured(1),
        st_teff: measured(5772),
      }),
    );
    const before = JSON.stringify(record);

    const resolved = solvePlanet(record);

    expect(JSON.stringify(record)).toBe(before);
    expect(resolved.rho.value).toBeCloseTo(5.51, 9);
  });
});

describe('solveCatalog', () => {
  it('обрабатывает 10 000 синтетических записей без исключений', () => {
    const records: PlanetRecord[] = Array.from({ length: 10_000 }, (_, index) =>
      makeRecord({
        pl_rade: measured(1 + (index % 10) / 10),
        pl_bmasse: measured(1 + (index % 7)),
        pl_orbper: measured(365.25),
        pl_orbeccen: measured(0.01),
        st_mass: measured(1),
        st_rad: measured(1),
        st_teff: measured(5772),
        st_lum: measured(0),
      }),
    );

    const solved = solveCatalog(records);

    expect(solved).toHaveLength(10_000);
    expect(solved.every((planet) => planet.flags.k === 4)).toBe(true);
  });

  it('пустой каталог даёт пустой результат', () => {
    expect(solveCatalog([])).toEqual([]);
  });
});
