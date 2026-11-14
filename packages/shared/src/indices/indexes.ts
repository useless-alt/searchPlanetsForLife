import { K_MIN } from '../constants/solver';
import { ADAPTIVE_SUBINDICES, type ResolvedPlanet, type SubindexId } from '../types/solver';
import type { CalcMode, ScoreBreakdown } from '../types/scoring';
import type { ModelSettings } from '../types/settings';

import { computeEsiInterior, computeSubindices } from './esi';
import { computeHz } from './hz';
import { computePenalties } from './penalties';
import { computeQData } from './quality';

/**
 * Итоговые индексы (п. 2.6).
 *
 *   adaptive    — (S₁·…·S_k)^(1/k) · P_rocky · P_ecc · P_star · Q_data;
 *   rhi         — sqrt(ESI_interior · F_HZ) · P_rocky · P_ecc · P_star · Q_data;
 *   classic_esi — sqrt(ESI_S · ESI_R) без штрафов и Q_data;
 *   strict      — sqrt(ESI₄ · F_HZ) без штрафов и Q_data.
 *
 * Округление — только в UI.
 */

/** Корень четвёртой степени для ESI₄ в строгом режиме. */
const STRICT_ROOT = 1 / 4;

/** Подготовленные данные планеты для расчёта индексов. */
interface Prepared {
  /** Субиндексы и производные величины. */
  esi: ReturnType<typeof computeSubindices>;
  /** Значения субиндексов по всем шести идентификаторам. */
  values: Record<SubindexId, number | null>;
  /** Геофизическое подобие. */
  esiInterior: number | null;
  /** Результат расчёта зоны обитаемости. */
  hz: ReturnType<typeof computeHz>;
  /** Множители штрафов с учётом чекбоксов. */
  penalties: ReturnType<typeof computePenalties>;
  /** Коэффициент достоверности. */
  qData: number;
  /** Адаптивные субиндексы, фактически равные null. */
  nullAdaptive: SubindexId[];
  /** Число доступных адаптивных субиндексов. */
  k: number;
  /** Число адаптивных субиндексов. */
  n: number;
  /** Данных недостаточно (k < K_MIN). */
  insufficient_data: boolean;
}

/** Считает все величины, нужные для индексов. */
function prepare(planet: ResolvedPlanet, settings: ModelSettings): Prepared {
  const esi = computeSubindices(planet);
  const esiInterior = computeEsiInterior(esi);
  const hz = computeHz({
    st_teff: planet.st_teff.value,
    L: planet.L.value,
    d: planet.d.value,
    e: planet.e.value,
    bounds: settings.hzBounds,
  });

  const values: Record<SubindexId, number | null> = {
    ESI_R: esi.ESI_R,
    ESI_rho: esi.ESI_rho,
    ESI_ve: esi.ESI_ve,
    ESI_S: esi.ESI_S,
    ESI_T: esi.ESI_T,
    F_HZ: hz.F_HZ,
  };

  const nullAdaptive = ADAPTIVE_SUBINDICES.filter((id) => values[id] === null);
  const k = ADAPTIVE_SUBINDICES.length - nullAdaptive.length;
  const n = ADAPTIVE_SUBINDICES.length;

  return {
    esi,
    values,
    esiInterior,
    hz,
    penalties: computePenalties(planet, settings),
    qData: computeQData({
      flags: planet.flags,
      P: planet.P.value,
      nullSubindices: nullAdaptive,
    }),
    nullAdaptive,
    k,
    n,
    insufficient_data: k < K_MIN,
  };
}

/** Собирает разложение балла. */
function breakdown(mode: CalcMode, prepared: Prepared, index: number | null): ScoreBreakdown {
  const { esi } = prepared;

  return {
    mode,
    ESI_R: esi.ESI_R,
    ESI_rho: esi.ESI_rho,
    ESI_ve: esi.ESI_ve,
    ESI_S: esi.ESI_S,
    ESI_T: esi.ESI_T,
    ESI_interior: prepared.esiInterior,
    F_HZ: prepared.hz.F_HZ,
    HZD: prepared.hz.HZD,
    P_rocky: prepared.penalties.P_rocky,
    P_ecc: prepared.penalties.P_ecc,
    P_star: prepared.penalties.P_star,
    Q_data: prepared.qData,
    index,
    k: prepared.k,
    n: prepared.n,
    insufficient_data: prepared.insufficient_data,
    T_s: esi.T_s,
    v_e: esi.v_e,
  };
}

/**
 * Адаптивный индекс: геометрическое среднее доступных субиндексов.
 *
 * При k < 3 индекс равен 0.00, запись остаётся в массиве (insufficient_data).
 */
export function indexAdaptive(planet: ResolvedPlanet, settings: ModelSettings): ScoreBreakdown {
  const prepared = prepare(planet, settings);

  if (prepared.insufficient_data) {
    return breakdown('adaptive', prepared, 0);
  }

  const parts = ADAPTIVE_SUBINDICES.map((id) => prepared.values[id]).filter(
    (value): value is number => value !== null,
  );
  const product = parts.reduce((acc, value) => acc * value, 1);
  if (!Number.isFinite(product) || product <= 0) {
    return breakdown('adaptive', prepared, 0);
  }

  const geometric = product ** (1 / prepared.k);
  const qFactor = settings.penalties.qdata ? prepared.qData : 1;
  const index =
    geometric *
    prepared.penalties.P_rocky *
    prepared.penalties.P_ecc *
    prepared.penalties.P_star *
    qFactor;

  return breakdown('adaptive', prepared, index);
}

/**
 * Комплексный индекс RHI: sqrt(ESI_interior · F_HZ) с штрафами и Q_data.
 *
 * Если хотя бы один из множителей не вычислен, планета в этом режиме
 * не оценивается (index = null, U20).
 */
export function indexRHI(planet: ResolvedPlanet, settings: ModelSettings): ScoreBreakdown {
  const prepared = prepare(planet, settings);

  const { esiInterior, hz, penalties } = prepared;
  if (esiInterior === null || hz.F_HZ === null) {
    return breakdown('rhi', prepared, null);
  }

  const qFactor = settings.penalties.qdata ? prepared.qData : 1;
  const index =
    Math.sqrt(esiInterior * hz.F_HZ) *
    penalties.P_rocky *
    penalties.P_ecc *
    penalties.P_star *
    qFactor;

  return breakdown('rhi', prepared, index);
}

/**
 * Упрощённый ESI (R, S): sqrt(ESI_S · ESI_R) без штрафов и Q_data.
 *
 * Это не PHL-ESI: подпись в интерфейсе именно такая (U2).
 */
export function indexClassicEsi(planet: ResolvedPlanet, settings: ModelSettings): ScoreBreakdown {
  const prepared = prepare(planet, settings);

  const { ESI_S, ESI_R } = prepared.values;
  if (ESI_S === null || ESI_R === null) {
    return breakdown('classic_esi', prepared, null);
  }

  return breakdown('classic_esi', prepared, Math.sqrt(ESI_S * ESI_R));
}

/**
 * Строгий научный индекс: sqrt(ESI₄ · F_HZ) без штрафов и Q_data.
 *
 * ESI₄ = (ESI_R·ESI_ρ·ESI_ve·ESI_S)^(1/4) (U3). Режим применим только
 * к записям без единого пропуска (strict_complete, U19).
 */
export function indexStrict(planet: ResolvedPlanet, settings: ModelSettings): ScoreBreakdown {
  const prepared = prepare(planet, settings);

  if (!planet.flags.strict_complete) {
    return breakdown('strict', prepared, null);
  }

  const { ESI_R, ESI_rho, ESI_ve, ESI_S, F_HZ } = prepared.values;
  if (ESI_R === null || ESI_rho === null || ESI_ve === null || ESI_S === null || F_HZ === null) {
    return breakdown('strict', prepared, null);
  }

  const esi4 = (ESI_R * ESI_rho * ESI_ve * ESI_S) ** STRICT_ROOT;
  return breakdown('strict', prepared, Math.sqrt(esi4 * F_HZ));
}

/** Считает балл в заданном режиме. */
export function computeScore(
  mode: CalcMode,
  planet: ResolvedPlanet,
  settings: ModelSettings,
): ScoreBreakdown {
  switch (mode) {
    case 'rhi':
      return indexRHI(planet, settings);
    case 'classic_esi':
      return indexClassicEsi(planet, settings);
    case 'strict':
      return indexStrict(planet, settings);
    case 'adaptive':
    default:
      return indexAdaptive(planet, settings);
  }
}
