import { describe, expect, it } from 'vitest';

import type { ParamValue, Provenance } from '../types/provenance';

import {
  applyLevelA,
  resolveDensity,
  resolveEquilibriumTemperature,
  resolveInsolation,
  resolveLuminosity,
  resolvePeriod,
  resolveSemiMajorAxis,
  type LevelAInput,
} from './levelA';
import { derivedProvenance, makeParam, nullParam } from './provenance';

const measured = (value: number | null): ParamValue => makeParam(value, 'measured');

const BAD_VALUES: Array<number | null> = [null, Number.NaN, 0, -1, Number.POSITIVE_INFINITY];

function makeInput(overrides: Partial<LevelAInput> = {}): LevelAInput {
  return {
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
    ...overrides,
  };
}

describe('светимость звезды', () => {
  it('st_lum = 0 даёт L = 1', () => {
    const result = resolveLuminosity(measured(0), nullParam(), nullParam());

    expect(result.value).toBeCloseTo(1, 12);
    expect(result.provenance).toBe('measured');
  });

  it('st_lum = −1 даёт L = 0.1 с происхождением measured', () => {
    const result = resolveLuminosity(measured(-1), nullParam(), nullParam());

    expect(result.value).toBeCloseTo(0.1, 12);
    expect(result.provenance).toBe('measured');
  });

  it('st_rad = 1 и st_teff = 5772 дают L = 1 с происхождением physics', () => {
    const result = resolveLuminosity(nullParam(), measured(1), measured(5772));

    expect(result.value).toBeCloseTo(1, 12);
    expect(result.provenance).toBe('physics');
  });

  it('st_rad = 0.119 и st_teff = 2566 дают L ≈ 5.53e−4', () => {
    const result = resolveLuminosity(nullParam(), measured(0.119), measured(2566));

    expect(result.value).toBeCloseTo(5.53e-4, -4);
    expect((result.value as number) / 5.53e-4).toBeCloseTo(1, 2);
  });

  it('без исходных данных значение отсутствует', () => {
    const result = resolveLuminosity(nullParam(), nullParam(), nullParam());

    expect(result.value).toBeNull();
    expect(result.provenance).toBeNull();
  });
});

describe('третий закон Кеплера', () => {
  it('из периода и массы звезды получается большая полуось', () => {
    const result = resolveSemiMajorAxis(nullParam(), measured(365.25), measured(1));

    expect(result.value).toBeCloseTo(1, 12);
  });

  it('из полуоси и массы звезды получается период', () => {
    const result = resolvePeriod(nullParam(), measured(1), measured(1));

    expect(result.value).toBeCloseTo(365.25, 9);
  });

  it('круговой переход P → d → P сохраняет период', () => {
    const period = measured(123.456);
    const semiMajorAxis = resolveSemiMajorAxis(nullParam(), period, measured(1));
    const restored = resolvePeriod(nullParam(), semiMajorAxis, measured(1));

    expect(restored.value).toBeCloseTo(123.456, 9);
  });

  it('для земной системы d ≈ 0.0222 а.е.', () => {
    const result = resolveSemiMajorAxis(nullParam(), measured(4.049), measured(0.0898));

    expect(result.value).toBeCloseTo(0.0222, -3);
    expect((result.value as number) / 0.0222).toBeCloseTo(1, 2);
  });

  it('измеренная полуось не перезаписывается', () => {
    const d = measured(2.5);
    const result = resolveSemiMajorAxis(d, measured(10), measured(1));

    expect(result.value).toBe(2.5);
  });
});

describe('поток излучения', () => {
  it('L = 1, d = 1, e = 0 дают S = 1', () => {
    const result = resolveInsolation(nullParam(), measured(1), measured(1), measured(0));

    expect(result.value.value).toBeCloseTo(1, 12);
    expect(result.eAssumedZero).toBe(false);
  });

  it('L = 1, d = 2, e = 0 дают S = 0.25', () => {
    const result = resolveInsolation(nullParam(), measured(1), measured(2), measured(0));

    expect(result.value.value).toBeCloseTo(0.25, 12);
  });

  it('L = 1, d = 1, e = 0.6 дают S = 1.25', () => {
    const result = resolveInsolation(nullParam(), measured(1), measured(1), measured(0.6));

    expect(result.value.value).toBeCloseTo(1.25, 12);
  });

  it('e = 0.0167 даёт S ≈ 1.00014', () => {
    const result = resolveInsolation(nullParam(), measured(1), measured(1), measured(0.0167));

    expect(result.value.value).toBeCloseTo(1.00014, 5);
  });

  it('отсутствующий e принимается нулевым и помечается флагом', () => {
    const result = resolveInsolation(nullParam(), measured(1), measured(1), nullParam());

    expect(result.value.value).toBeCloseTo(1, 12);
    expect(result.eAssumedZero).toBe(true);
  });

  it('e = 1 даёт отсутствие значения', () => {
    const result = resolveInsolation(nullParam(), measured(1), measured(1), measured(1));

    expect(result.value.value).toBeNull();
  });

  it('измеренный pl_insol не перезаписывается', () => {
    const insolation = measured(3.5);
    const result = resolveInsolation(insolation, measured(1), measured(1), measured(0));

    expect(result.value.value).toBe(3.5);
    expect(result.eAssumedZero).toBe(false);
  });
});

describe('равновесная температура', () => {
  it('S = 1 даёт T_eq = 255', () => {
    const result = resolveEquilibriumTemperature(nullParam(), measured(1));

    expect(result.value).toBeCloseTo(255, 9);
  });

  it('S = 16 даёт T_eq = 510', () => {
    const result = resolveEquilibriumTemperature(nullParam(), measured(16));

    expect(result.value).toBeCloseTo(510, 9);
  });

  it('измеренный pl_eqt не перезаписывается', () => {
    const result = resolveEquilibriumTemperature(measured(300), measured(1));

    expect(result.value).toBe(300);
  });
});

describe('средняя плотность', () => {
  it('M = 1, R = 1 дают rho = 5.51', () => {
    const result = resolveDensity(measured(1), measured(1));

    expect(result.value).toBeCloseTo(5.51, 12);
  });

  it('M = 8, R = 2 дают rho = 5.51', () => {
    const result = resolveDensity(measured(8), measured(2));

    expect(result.value).toBeCloseTo(5.51, 12);
  });

  it('R = 0 даёт отсутствие значения', () => {
    const result = resolveDensity(measured(1), measured(0));

    expect(result.value).toBeNull();
  });

  it('происхождение берётся из худшего входа', () => {
    const modelMass = makeParam(1, 'model');
    const fromModel = resolveDensity(modelMass, measured(1));
    const fromMeasured = resolveDensity(measured(1), measured(1));

    expect(fromModel.provenance).toBe('model');
    expect(fromMeasured.provenance).toBe('physics');
  });
});

describe('нефизичные и отсутствующие входы', () => {
  it('функции не бросают исключений и не возвращают NaN/Infinity', () => {
    for (const bad of BAD_VALUES) {
      const param = makeParam(bad, 'measured');

      const values = [
        resolveLuminosity(param, param, param).value,
        resolveSemiMajorAxis(param, param, param).value,
        resolvePeriod(param, param, param).value,
        resolveInsolation(param, param, param, param).value.value,
        resolveEquilibriumTemperature(param, param).value,
        resolveDensity(param, param).value,
      ];

      for (const value of values) {
        expect(value === null || Number.isFinite(value)).toBe(true);
      }
    }
  });

  it('нефизичные значения параметров трактуются как отсутствующие', () => {
    for (const bad of [Number.NaN, -1, Number.POSITIVE_INFINITY]) {
      const param = makeParam(bad, 'measured');

      expect(resolveSemiMajorAxis(param, param, param).value).toBeNull();
      expect(resolvePeriod(param, param, param).value).toBeNull();
      expect(resolveInsolation(param, param, param, param).value.value).toBeNull();
      expect(resolveEquilibriumTemperature(param, param).value).toBeNull();
      expect(resolveDensity(param, param).value).toBeNull();
    }
  });

  it('нулевые значения параметров трактуются как отсутствующие', () => {
    const zero = measured(0);

    expect(resolveSemiMajorAxis(zero, zero, zero).value).toBeNull();
    expect(resolvePeriod(zero, zero, zero).value).toBeNull();
    expect(resolveEquilibriumTemperature(zero, zero).value).toBeNull();
    expect(resolveDensity(zero, zero).value).toBeNull();
  });

  it('функции не бросают исключений на любом наборе плохих значений', () => {
    for (const bad of BAD_VALUES) {
      expect(() => applyLevelA(makeInput({ st_lum: makeParam(bad, 'measured') }))).not.toThrow();
    }
  });

  it('applyLevelA на плохих входах не возвращает NaN и Infinity', () => {
    const result = applyLevelA(
      makeInput({
        pl_rade: makeParam(Number.NaN, 'measured'),
        pl_bmasse: makeParam(Number.POSITIVE_INFINITY, 'measured'),
        pl_orbsmax: makeParam(0, 'measured'),
        pl_orbper: makeParam(-1, 'measured'),
        pl_orbeccen: makeParam(1, 'measured'),
        pl_insol: makeParam(Number.NaN, 'measured'),
        st_teff: makeParam(Number.NEGATIVE_INFINITY, 'measured'),
        st_rad: makeParam(0, 'measured'),
        st_mass: makeParam(-1, 'measured'),
        st_lum: makeParam(Number.NaN, 'measured'),
      }),
    );

    for (const value of [
      result.L.value,
      result.d.value,
      result.P.value,
      result.S.value,
      result.T_eq.value,
      result.rho.value,
    ]) {
      expect(value === null || Number.isFinite(value)).toBe(true);
    }
  });
});

describe('происхождение значения', () => {
  it('derivedProvenance берёт худшее из значимых входов', () => {
    expect(derivedProvenance([measured(1), measured(2)])).toBe('physics');
    expect(derivedProvenance([makeParam(1, 'model'), measured(2)])).toBe('model');
    expect(derivedProvenance([makeParam(1, 'estimate'), makeParam(1, 'model')])).toBe('estimate');
  });

  it('пустые и отсутствующие входы не влияют на результат', () => {
    expect(derivedProvenance([])).toBe('physics');
    expect(derivedProvenance([nullParam(), nullParam()])).toBe('physics');
  });

  it('makeParam обнуляет происхождение при отсутствующем значении', () => {
    const param = makeParam(null, 'measured', 'nasa', '2026-11-14T00:00:00.000Z');

    expect(param.value).toBeNull();
    expect(param.provenance).toBeNull();
    expect(param.source).toBeNull();
    expect(param.fromBackup).toBe(false);
    expect(param.alternatives).toEqual([]);
  });

  it('makeParam отбрасывает нечисловые значения', () => {
    expect(makeParam(Number.NaN, 'measured').value).toBeNull();
    expect(makeParam(Number.POSITIVE_INFINITY, 'measured').value).toBeNull();
  });
});

describe('applyLevelA', () => {
  it('считает цепочку L → d → P → S → T_eq → rho', () => {
    const result = applyLevelA(
      makeInput({
        pl_rade: measured(1),
        pl_bmasse: measured(1),
        pl_orbper: measured(365.25),
        pl_orbeccen: measured(0),
        st_teff: measured(5772),
        st_rad: measured(1),
        st_mass: measured(1),
        st_lum: measured(0),
      }),
    );

    expect(result.L.value).toBeCloseTo(1, 12);
    expect(result.d.value).toBeCloseTo(1, 12);
    expect(result.P.value).toBeCloseTo(365.25, 9);
    expect(result.S.value).toBeCloseTo(1, 12);
    expect(result.T_eq.value).toBeCloseTo(255, 9);
    expect(result.rho.value).toBeCloseTo(5.51, 12);
    expect(result.eAssumedZero).toBe(false);
  });

  it('повторный вызов возвращает идентичный результат', () => {
    const input = makeInput({
      pl_rade: measured(1),
      pl_bmasse: measured(1),
      st_teff: measured(5772),
      st_rad: measured(1),
      st_mass: measured(1),
      st_lum: measured(0),
    });

    const first = applyLevelA(input);
    const second = applyLevelA(input);

    expect(second).toEqual(first);
  });

  it('не перезаписывает присутствующие значения', () => {
    const input = makeInput({
      pl_orbsmax: measured(2),
      pl_orbper: measured(100),
      pl_insol: measured(4),
      pl_eqt: measured(280),
    });

    const result = applyLevelA(input);

    expect(result.d.value).toBe(2);
    expect(result.P.value).toBe(100);
    expect(result.S.value).toBe(4);
    expect(result.T_eq.value).toBe(280);
  });

  it('входной объект не мутируется', () => {
    const input = Object.freeze(
      makeInput({
        pl_rade: measured(1),
        pl_bmasse: measured(1),
        st_teff: measured(5772),
        st_rad: measured(1),
        st_mass: measured(1),
        st_lum: measured(0),
      }),
    );

    const before = JSON.stringify(input);
    const result = applyLevelA(input);

    expect(JSON.stringify(input)).toBe(before);
    expect(result.rho.value).toBeCloseTo(5.51, 12);
  });

  it('принимает уже дополненные данные (повторный расчёт rho после Уровня Б)', () => {
    const first = applyLevelA(
      makeInput({
        pl_orbper: measured(365.25),
        st_teff: measured(5772),
        st_rad: measured(1),
        st_mass: measured(1),
        st_lum: measured(0),
      }),
    );

    const augmented = makeInput({
      pl_rade: measured(1),
      pl_bmasse: makeParam(1, 'model'),
      pl_orbsmax: first.d,
      pl_orbper: first.P,
      st_teff: measured(5772),
      st_rad: measured(1),
      st_mass: measured(1),
      st_lum: measured(0),
    });

    const second = applyLevelA(augmented);

    expect(second.d.value).toBeCloseTo(1, 12);
    expect(second.P.value).toBeCloseTo(365.25, 9);
    expect(second.rho.value).toBeCloseTo(5.51, 12);
    expect(second.rho.provenance).toBe('model');
  });
});

describe('происхождение по типам', () => {
  it('nullParam заполняет все поля пустыми значениями', () => {
    const param: ParamValue = nullParam();

    expect(param).toEqual({
      value: null,
      provenance: null,
      source: null,
      sourceDate: null,
      fromBackup: false,
      alternatives: [],
    });
  });

  it('provenance — один из четырёх вариантов', () => {
    const provenances: Provenance[] = ['measured', 'physics', 'model', 'estimate'];

    for (const provenance of provenances) {
      expect(makeParam(1, provenance).provenance).toBe(provenance);
    }
  });
});
