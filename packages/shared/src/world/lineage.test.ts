import { describe, expect, it } from 'vitest';

import { makeParam, nullParam } from '../physics/provenance';
import type { ParamValue } from '../types/provenance';
import type { ResolvedPlanet, SolverFlags } from '../types/solver';
import { explainParam, NO_DATA_TEXT } from './lineage';

/** Флаги решателя по умолчанию. */
function flags(): SolverFlags {
  return {
    insufficient_data: false,
    levelB_mass: false,
    levelB_radius: false,
    e_assumed_zero: false,
    excluded_subindices: [],
    k: 4,
    n: 4,
    strict_complete: true,
    available: {
      ESI_R: true,
      ESI_rho: true,
      ESI_ve: true,
      ESI_S: true,
      ESI_T: true,
      F_HZ: true,
    },
  };
}

/** Планета, близкая к Земле: физика L, модель M, оценка e. */
function earth(): ResolvedPlanet {
  return {
    id: 'earth',
    R: makeParam(1, 'measured', 'nasa', '2026-11-01T00:00:00.000Z'),
    M: makeParam(1, 'model'),
    e: makeParam(0, 'estimate'),
    d: makeParam(1, 'physics'),
    P: makeParam(365.25, 'physics'),
    S: makeParam(1, 'physics'),
    T_eq: makeParam(255, 'physics'),
    rho: makeParam(5.51, 'physics'),
    L: makeParam(1, 'physics'),
    st_teff: makeParam(5772, 'measured', 'gaia', '2026-10-01T00:00:00.000Z'),
    st_rad: makeParam(1, 'physics'),
    st_mass: makeParam(1, 'model'),
    dist_pc: nullParam(),
    ra: nullParam(),
    dec: nullParam(),
    flags: flags(),
  };
}

/** Параметр с источником и альтернативами. */
function measured(value: number): ParamValue {
  return {
    ...makeParam(value, 'measured', 'nasa', '2026-11-02T10:00:00.000Z'),
    fromBackup: true,
    alternatives: [
      { source: 'exoplanet_eu', value: value + 0.1, sourceDate: '2026-10-20T00:00:00.000Z' },
    ],
  };
}

describe('explainParam: формулы и входы', () => {
  it('L из physics объясняется законом Стефана — Больцмана', () => {
    const explanation = explainParam('L', earth());

    expect(explanation.provenance).toBe('physics');
    expect(explanation.formula).toContain('L = R☉²');
    expect(explanation.how).toContain('Стефана — Больцмана');
    expect(explanation.accuracy).toBe('Уровень А — погрешность менее 2%');
    expect(explanation.inputs.map((input) => input.key)).toEqual(['st_rad', 'st_teff']);
    expect(explanation.inputs[0]?.value).toBe(1);
    expect(explanation.inputs[1]?.value).toBe(5772);
  });

  it('M из model объясняется формулой Чена — Киппинга с уровнем Б', () => {
    const explanation = explainParam('M', earth());

    expect(explanation.formula).toContain('R^3.58');
    expect(explanation.accuracy).toContain('15–25%');
    expect(explanation.inputs.map((input) => input.key)).toEqual(['R']);
  });

  it('e с estimate показывает принятое нулевое значение', () => {
    const explanation = explainParam('e', earth());

    expect(explanation.provenance).toBe('estimate');
    expect(explanation.how).toContain('принят равным 0');
    expect(explanation.formula).toBeNull();
    expect(explanation.accuracy).toBe('Допущение, точность неизвестна');
  });

  it('T_s берёт происхождение и источник T_eq', () => {
    const planet = earth();
    planet.T_eq = makeParam(288, 'measured', 'exomast', '2026-11-05T00:00:00.000Z');

    const explanation = explainParam('T_s', planet);

    expect(explanation.value).toBe(321);
    expect(explanation.provenance).toBe('measured');
    expect(explanation.source?.id).toBe('exomast');
  });

  it('измеренное значение показывает источник, дату, резерв и альтернативы', () => {
    const planet = earth();
    planet.R = measured(1.2);

    const explanation = explainParam('R', planet);

    expect(explanation.source).toEqual({
      id: 'nasa',
      name: 'NASA Exoplanet Archive',
      date: '2026-11-02T10:00:00.000Z',
      fromBackup: true,
    });
    expect(explanation.alternatives).toEqual([
      { source: 'exoplanet_eu', value: 1.3, date: '2026-10-20T00:00:00.000Z' },
    ]);
  });

  it('отсутствующее значение даёт «Нет данных» и пустые поля', () => {
    const explanation = explainParam('R', {
      ...earth(),
      R: nullParam(),
    });

    expect(explanation.value).toBeNull();
    expect(explanation.provenance).toBeNull();
    expect(explanation.how).toBe(NO_DATA_TEXT);
    expect(explanation.formula).toBeNull();
    expect(explanation.inputs).toEqual([]);
    expect(explanation.source).toBeNull();
  });

  it('неизвестный ключ не ломает объяснение', () => {
    const explanation = explainParam('unknown', earth());

    expect(explanation.value).toBeNull();
    expect(explanation.how).toBe(NO_DATA_TEXT);
  });
});
