import { describe, expect, it } from 'vitest';

import { EARTH_REFERENCE_RECORD } from '../constants/earth';
import { makeParam, nullParam } from '../physics/provenance';
import { solvePlanet } from '../physics/solver';
import { DEFAULT_SETTINGS, type ModelSettings } from '../types/settings';
import type { PlanetRecord } from '../types/planet';
import type { ResolvedPlanet, SolverFlags } from '../types/solver';

import { buildDecomposition, DECOMPOSITION_NOTES, type DecompRow } from './decomposition';
import { indexAdaptive, indexClassicEsi, indexRHI, indexStrict } from './indexes';

/**
 * Тесты разложения балла (задача 19; п. 10.7, 13.5).
 *
 * Главная проверка — цепочка множителей: накопленный балл последней строки
 * совпадает с индексом Задачи 5 с точностью 1e-9.
 */

/** Настройки с заданным режимом и оптимистичными границами. */
function settings(patch: Partial<ModelSettings> = {}): ModelSettings {
  return {
    ...DEFAULT_SETTINGS,
    mode: 'rhi',
    hzBounds: 'optimistic',
    penalties: { ...DEFAULT_SETTINGS.penalties },
    ...patch,
  };
}

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

/** Планета для проверки нехватки данных. */
function sparsePlanet(): ResolvedPlanet {
  return {
    id: 'sparse',
    R: makeParam(1, 'measured'),
    M: nullParam(),
    e: nullParam(),
    d: makeParam(1, 'measured'),
    P: nullParam(),
    S: makeParam(1, 'physics'),
    T_eq: makeParam(255, 'physics'),
    rho: nullParam(),
    L: makeParam(1, 'measured'),
    st_teff: makeParam(5772, 'measured'),
    st_rad: nullParam(),
    st_mass: nullParam(),
    dist_pc: nullParam(),
    ra: nullParam(),
    dec: nullParam(),
    flags: flags({ k: 2 }),
  };
}

/** Строка по идентификатору. */
function row(rows: readonly DecompRow[], id: string): DecompRow {
  const found = rows.find((item) => item.id === id);

  if (found === undefined) throw new Error(`Нет строки ${id}`);

  return found;
}

/** Полная измеренная запись для строгого режима (U19). */
function strictRecord(): PlanetRecord {
  return {
    ...EARTH_REFERENCE_RECORD,
    params: {
      ...EARTH_REFERENCE_RECORD.params,
      pl_insol: makeParam(1, 'measured'),
      pl_orbsmax: makeParam(1, 'measured'),
      st_lum: makeParam(0, 'measured'),
    },
  };
}

/** Детерминированный генератор для прохода по случайным наборам. */
function random(seed: number): () => number {
  let state = seed;

  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;

    return state / 4294967296;
  };
}

describe('buildDecomposition: Земля', () => {
  const earth = solvePlanet(EARTH_REFERENCE_RECORD);

  it('RHI на оптимистичных границах: база 0.860, после P_rocky 0.828, итог 0.83', () => {
    const score = indexRHI(earth, settings());
    const { rows } = buildDecomposition(score, settings());

    expect(row(rows, 'base').value).toBeCloseTo(0.86, 2);
    expect(row(rows, 'P_rocky').cumulative).toBeCloseTo(0.828, 3);
    expect(row(rows, 'result').value).toBeCloseTo(0.83, 2);
  });

  it('накопленный балл последней строки равен индексу с точностью 1e-9', () => {
    const score = indexRHI(earth, settings());
    const { rows } = buildDecomposition(score, settings());

    expect(rows[rows.length - 1]?.id).toBe('result');
    expect(rows[rows.length - 1]?.cumulative).toBeCloseTo(score.index as number, 9);
  });

  it('адаптивный режим: база 0.9275, итог 0.893', () => {
    const adaptive = settings({ mode: 'adaptive' });
    const score = indexAdaptive(earth, adaptive);
    const { rows } = buildDecomposition(score, adaptive);

    expect(row(rows, 'base').value).toBeCloseTo(0.9275, 3);
    expect(row(rows, 'result').value).toBeCloseTo(0.893, 2);
  });

  it('в RHI вложенные входы ESI_R, ESI_rho и ESI_ve присутствуют', () => {
    const score = indexRHI(earth, settings());
    const { rows } = buildDecomposition(score, settings());

    for (const id of ['ESI_R', 'ESI_rho', 'ESI_ve']) {
      expect(row(rows, id).kind).toBe('input');
    }
  });
});

describe('buildDecomposition: режимы без штрафов', () => {
  const earth = solvePlanet(EARTH_REFERENCE_RECORD);

  it('classic_esi не содержит множителей и поясняет это', () => {
    const classic = settings({ mode: 'classic_esi' });
    const score = indexClassicEsi(earth, classic);
    const { rows, note } = buildDecomposition(score, classic);

    expect(rows.some((item) => item.kind === 'factor')).toBe(false);
    expect(note).toBe(DECOMPOSITION_NOTES.noPenalties);
    expect(row(rows, 'base').value).toBeCloseTo(score.index as number, 9);
  });

  it('strict не содержит множителей и поясняет это', () => {
    const full = solvePlanet(strictRecord());
    const strict = settings({ mode: 'strict' });
    const score = indexStrict(full, strict);
    const { rows, note } = buildDecomposition(score, strict);

    expect(full.flags.strict_complete).toBe(true);
    expect(score.index).not.toBeNull();
    expect(rows.some((item) => item.kind === 'factor')).toBe(false);
    expect(note).toBe(DECOMPOSITION_NOTES.noPenalties);
    expect(row(rows, 'ESI4').value).not.toBeNull();
    expect(row(rows, 'base').value).toBeCloseTo(score.index as number, 9);
  });
});

describe('buildDecomposition: отключённый штраф', () => {
  const earth = solvePlanet(EARTH_REFERENCE_RECORD);

  it('state = disabled, value = 1, delta = 0, rawValue сохранён', () => {
    const adaptive = settings({
      mode: 'adaptive',
      penalties: { ...DEFAULT_SETTINGS.penalties, rocky: false },
    });
    const score = indexAdaptive(earth, adaptive);
    const { rows } = buildDecomposition(score, adaptive);
    const rocky = row(rows, 'P_rocky');

    expect(rocky.state).toBe('disabled');
    expect(rocky.value).toBe(1);
    expect(rocky.rawValue).toBeCloseTo(score.P_rocky, 12);
    expect(rocky.delta).toBe(0);
    expect(rocky.cumulative).toBeCloseTo(row(rows, 'base').value as number, 12);
  });

  it('отключённый Q_data тоже даёт disabled', () => {
    const adaptive = settings({
      mode: 'adaptive',
      penalties: { ...DEFAULT_SETTINGS.penalties, qdata: false },
    });
    const score = indexAdaptive(earth, adaptive);
    const { rows } = buildDecomposition(score, adaptive);

    expect(row(rows, 'Q_data').state).toBe('disabled');
    expect(row(rows, 'Q_data').delta).toBe(0);
  });
});

describe('buildDecomposition: недостаточно данных', () => {
  it('итог 0, state = na, пояснение с k и n', () => {
    const adaptive = settings({ mode: 'adaptive' });
    const planet = sparsePlanet();
    const score = indexAdaptive(planet, adaptive);
    const { rows, note } = buildDecomposition(score, adaptive);
    const result = row(rows, 'result');

    expect(score.insufficient_data).toBe(true);
    expect(result.value).toBe(0);
    expect(result.state).toBe('na');
    expect(note).toContain('2 из 4');
  });
});

describe('buildDecomposition: случайные наборы', () => {
  it('для adaptive и rhi цепочка множителей равна индексу (1e-9)', () => {
    const next = random(20261115);

    for (let index = 0; index < 60; index += 1) {
      const planet: ResolvedPlanet = {
        id: `random-${index}`,
        R: makeParam(0.5 + next() * 2, 'measured'),
        M: makeParam(0.5 + next() * 5, 'measured'),
        e: makeParam(next() * 0.5, 'measured'),
        d: makeParam(0.5 + next() * 1.5, 'physics'),
        P: makeParam(10 + next() * 1000, 'physics'),
        S: makeParam(0.2 + next() * 1.8, 'physics'),
        T_eq: makeParam(150 + next() * 350, 'physics'),
        rho: makeParam(3 + next() * 5, 'physics'),
        L: makeParam(0.5 + next() * 1.5, 'measured'),
        st_teff: makeParam(3000 + next() * 4000, 'measured'),
        st_rad: makeParam(0.5 + next() * 1.5, 'measured'),
        st_mass: makeParam(0.5 + next() * 1.5, 'measured'),
        dist_pc: makeParam(5 + next() * 50, 'measured'),
        ra: nullParam(),
        dec: nullParam(),
        flags: flags(),
      };

      for (const mode of ['adaptive', 'rhi'] as const) {
        const current = settings({
          mode,
          hzBounds: next() > 0.5 ? 'conservative' : 'optimistic',
          penalties: {
            rocky: next() > 0.3,
            ecc: next() > 0.3,
            star: next() > 0.3,
            qdata: next() > 0.3,
          },
        });
        const score =
          mode === 'adaptive' ? indexAdaptive(planet, current) : indexRHI(planet, current);
        const { rows } = buildDecomposition(score, current);

        const result = rows[rows.length - 1];
        expect(result?.id).toBe('result');
        expect(result?.cumulative).toBeCloseTo(score.index as number, 9);

        const chain = rows
          .filter((item) => item.kind === 'base' || item.kind === 'factor')
          .reduce((acc, item) => acc * (item.value as number), 1);

        expect(chain).toBeCloseTo(score.index as number, 9);
      }
    }
  });
});
