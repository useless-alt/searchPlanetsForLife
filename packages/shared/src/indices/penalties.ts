import {
  P_STAR_M,
  P_STAR_OTHER,
  ROCKY_K,
  ROCKY_R_CUTOFF,
  STAR_TEFF_M_CLASS,
} from '../constants/penalties';
import type { ModelSettings } from '../types/settings';
import type { ResolvedPlanet } from '../types/solver';

/**
 * Нелинейные астрофизические штрафы (п. 2.4) — множители от 0 до 1.
 *
 * Если входной параметр отсутствует, соответствующий штраф равен 1.
 * Выключенный чекбокс в настройках модели также даёт множитель 1.
 */

/** Штраф за микронептун по разрыву Фултона: P_rocky = 1 / (1 + exp(5·(R − 1.65))). */
export function penaltyRocky(R: number | null): number {
  if (R === null || !Number.isFinite(R) || R <= 0) return 1;

  const value = 1 / (1 + Math.exp(ROCKY_K * (R - ROCKY_R_CUTOFF)));
  return Number.isFinite(value) ? value : 1;
}

/** Штраф за эксцентриситет: P_ecc = 1 − e². */
export function penaltyEcc(e: number | null): number {
  if (e === null || !Number.isFinite(e) || e < 0) return 1;

  const value = 1 - e ** 2;
  if (!Number.isFinite(value)) return 1;

  return Math.min(1, Math.max(0, value));
}

/** Штраф за тип звезды: 0.85 для класса M (T_eff < 3900 К), иначе 1.00. */
export function penaltyStar(st_teff: number | null): number {
  if (st_teff === null || !Number.isFinite(st_teff)) return 1;

  return st_teff < STAR_TEFF_M_CLASS ? P_STAR_M : P_STAR_OTHER;
}

/** Множители штрафов с учётом чекбоксов настроек модели. */
export interface PenaltyMultipliers {
  /** Штраф за микронептун. */
  P_rocky: number;
  /** Штраф за эксцентриситет. */
  P_ecc: number;
  /** Штраф за тип звезды. */
  P_star: number;
}

/**
 * Считает множители штрафов для планеты.
 *
 * Выключенный чекбокс даёт множитель 1 — и в разложении балла тоже.
 */
export function computePenalties(
  planet: ResolvedPlanet,
  settings: ModelSettings,
): PenaltyMultipliers {
  return {
    P_rocky: settings.penalties.rocky ? penaltyRocky(planet.R.value) : 1,
    P_ecc: settings.penalties.ecc ? penaltyEcc(planet.e.value) : 1,
    P_star: settings.penalties.star ? penaltyStar(planet.st_teff.value) : 1,
  };
}
