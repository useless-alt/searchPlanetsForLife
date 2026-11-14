import {
  Q_BASE,
  Q_E_ASSUMED_PERIOD_EXEMPT_DAYS,
  Q_FLOOR,
  Q_PENALTY_E_ASSUMED,
  Q_PENALTY_EXCLUDED_SUBINDEX,
  Q_PENALTY_LEVEL_B,
} from '../constants/quality';
import type { SolverFlags, SubindexId } from '../types/solver';

/**
 * Коэффициент достоверности данных Q_data (п. 2.5).
 *
 *   1.00
 *   −0.10 — масса или радиус восстановлены по модели (Уровень Б);
 *   −0.05 — эксцентриситет принят нулевым (не применяется при P < 10 сут);
 *   −0.05 — за каждый фактически отсутствующий субиндекс адаптивного режима.
 *
 * Итог ограничен снизу значением 0.75. Q_data считается для всех режимов
 * и показывается в таблице; в индекс входит только при включённом чекбоксе
 * и только в режимах adaptive и rhi.
 */

/** Данные для расчёта Q_data. */
export interface QualityInput {
  /** Флаги решателя. */
  flags: SolverFlags;
  /** Период обращения [сут]; null — неизвестен, тогда штраф применяется. */
  P: number | null;
  /** Адаптивные субиндексы, фактически равные null. */
  nullSubindices: readonly SubindexId[];
}

/** Точность округления результата (чтобы не появлялось 0.7499999…). */
const Q_ROUNDING = 1e9;

/**
 * Считает Q_data.
 *
 * Результат округляется до 1e-9, чтобы не появлялись значения вида 0.7499999….
 */
export function computeQData(input: QualityInput): number {
  const { flags, P, nullSubindices } = input;

  let quality = Q_BASE;

  if (flags.levelB_mass || flags.levelB_radius) {
    quality -= Q_PENALTY_LEVEL_B;
  }

  const periodKnown = P !== null && Number.isFinite(P);
  if (flags.e_assumed_zero && !(periodKnown && P < Q_E_ASSUMED_PERIOD_EXEMPT_DAYS)) {
    quality -= Q_PENALTY_E_ASSUMED;
  }

  quality -= Q_PENALTY_EXCLUDED_SUBINDEX * nullSubindices.length;

  const floored = Math.max(Q_FLOOR, quality);
  return Math.round(floored * Q_ROUNDING) / Q_ROUNDING;
}
