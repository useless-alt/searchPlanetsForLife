import { STRICT_REQUIRED_RAW } from '../constants/solver';
import type { ParamValue } from '../types/provenance';
import type { PlanetRecord } from '../types/planet';
import type { ResolvedPlanet, SolverFlags } from '../types/solver';

import { applyLevelA, type LevelAInput } from './levelA';
import { restoreMassFromRadius, restoreRadiusFromMass } from './levelB';
import { computeAvailability } from './levelC';
import { makeParam } from './provenance';

/**
 * Каскадный оркестратор решателя пропусков (Уровни А → Б → В).
 *
 * Порядок строго фиксирован:
 *   1. Уровень А — точные физические законы;
 *   2. Уровень Б — восстановление недостающего из пары R/M;
 *   3. повторный Уровень А — пересчёт плотности с учётом восстановленных R/M;
 *   4. эксцентриситет: отсутствующий принимается нулевым (provenance 'estimate');
 *   5. Уровень В — доступность субиндексов, k, n, insufficient_data, strict_complete.
 *
 * Входные записи не мутируются, недостающие значения не подставляются
 * «из воздуха». Единственное исключение — e = 0 с происхождением 'estimate'.
 */

/** Наличие значения у параметра. */
function hasValue(param: ParamValue): boolean {
  return param.value !== null;
}

/**
 * Эксцентриситет записи: отсутствующий принимается равным нулю
 * с происхождением 'estimate' (флаг e_assumed_zero).
 */
function resolveEccentricity(e: ParamValue): ParamValue {
  if (e.value === null) return makeParam(0, 'estimate');
  return e;
}

/**
 * Полнота данных для режима «Строгий научный» (U19): все поля
 * STRICT_REQUIRED_RAW заданы и измерены.
 */
function isStrictComplete(record: PlanetRecord): boolean {
  return STRICT_REQUIRED_RAW.every((key) => {
    const param = record.params[key];
    return param.value !== null && param.provenance === 'measured';
  });
}

/**
 * Разрешает одну запись каталога: Уровни А, Б и В.
 */
export function solvePlanet(record: PlanetRecord): ResolvedPlanet {
  const params = record.params;

  let R = params.pl_rade;
  let M = params.pl_bmasse;

  const levelAInput: LevelAInput = {
    pl_rade: R,
    pl_bmasse: M,
    pl_orbsmax: params.pl_orbsmax,
    pl_orbper: params.pl_orbper,
    pl_orbeccen: params.pl_orbeccen,
    pl_insol: params.pl_insol,
    pl_eqt: params.pl_eqt,
    st_teff: params.st_teff,
    st_rad: params.st_rad,
    st_mass: params.st_mass,
    st_lum: params.st_lum,
  };

  // Шаг 1 — Уровень А: точные физические законы.
  applyLevelA(levelAInput);

  // Шаг 2 — Уровень Б: восстановить недостающее из пары R/M.
  let levelB_mass = false;
  let levelB_radius = false;

  if (!hasValue(M) && hasValue(R)) {
    const restored = restoreMassFromRadius(R);
    if (hasValue(restored)) {
      M = restored;
      levelB_mass = true;
    }
  }

  if (!hasValue(R) && hasValue(M)) {
    const restored = restoreRadiusFromMass(M);
    if (hasValue(restored)) {
      R = restored;
      levelB_radius = true;
    }
  }

  // Шаг 3 — повторный Уровень А: плотность пересчитывается после Уровня Б.
  const levelA = applyLevelA({ ...levelAInput, pl_rade: R, pl_bmasse: M });

  // Шаг 4 — эксцентриситет.
  const e = resolveEccentricity(params.pl_orbeccen);
  const e_assumed_zero = e.provenance === 'estimate';

  // Шаг 5 — Уровень В: доступность субиндексов и флаги.
  const availability = computeAvailability({
    R,
    M,
    rho: levelA.rho,
    S: levelA.S,
    T_eq: levelA.T_eq,
    L: levelA.L,
    st_teff: params.st_teff,
    d: levelA.d,
  });

  const flags: SolverFlags = {
    insufficient_data: availability.insufficient_data,
    levelB_mass,
    levelB_radius,
    e_assumed_zero,
    excluded_subindices: availability.excluded_subindices,
    k: availability.k,
    n: availability.n,
    strict_complete: isStrictComplete(record),
    available: availability.available,
  };

  return {
    id: record.id,
    R,
    M,
    e,
    d: levelA.d,
    P: levelA.P,
    S: levelA.S,
    T_eq: levelA.T_eq,
    rho: levelA.rho,
    L: levelA.L,
    st_teff: params.st_teff,
    st_rad: params.st_rad,
    st_mass: params.st_mass,
    dist_pc: params.sy_dist,
    ra: params.ra,
    dec: params.dec,
    flags,
  };
}

/**
 * Разрешает каталог целиком. Функция чистая: побочных эффектов нет,
 * поэтому её можно вызывать в Web Worker.
 */
export function solveCatalog(records: readonly PlanetRecord[]): ResolvedPlanet[] {
  return records.map((record) => solvePlanet(record));
}
