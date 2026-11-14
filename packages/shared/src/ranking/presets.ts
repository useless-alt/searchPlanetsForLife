import type { CalcMode } from '../types/scoring';

/**
 * Пресеты режимов расчёта (п. 3.1, подписи по 13.1).
 *
 * Четыре готовых режима переключаются сегментированным переключателем в шапке;
 * подпись кнопки и формула во всплывающей подсказке берутся отсюда (U2).
 */
export interface CalcModePreset {
  /** Идентификатор режима. */
  mode: CalcMode;
  /** Подпись кнопки переключателя (13.1). */
  label: string;
  /** Формула режима для всплывающей подсказки (4.1). */
  hint: string;
  /** Охват режима по каталогу планет. */
  coverage: string;
}

/**
 * Каталог пресетов по идентификатору режима.
 *
 * Прежнее название режима `classic_esi` — «Классический ESI (эталон PHL)» —
 * хранится в его подсказке (U2): подпись берётся по 13.1 как более поздняя.
 */
export const CALC_MODE_PRESETS: Record<CalcMode, CalcModePreset> = {
  adaptive: {
    mode: 'adaptive',
    label: 'Адаптивный',
    hint: 'Index_adaptive = (S₁·…·S_k)^(1/k) · P_penalties · Q_data',
    coverage: 'весь каскад А, Б, В; максимум планет (~99%)',
  },
  rhi: {
    mode: 'rhi',
    label: 'RHI',
    hint: 'RHI = √(ESI_interior · F_HZ) · P_rocky · P_ecc · P_star · Q_data',
    coverage: 'планеты со всеми субиндексами',
  },
  classic_esi: {
    mode: 'classic_esi',
    label: 'Упрощённый ESI (R, S)',
    hint: 'ESI = √(ESI_S · ESI_R) — прежнее название: «Классический ESI (эталон PHL)»',
    coverage: 'планеты с S и R; без e, типа звезды, разрыва Фултона',
  },
  strict: {
    mode: 'strict',
    label: 'Строгий научный',
    hint: '√(ESI₄ · F_HZ)',
    coverage: 'только strict_complete',
  },
};

/** Порядок режимов в переключателе шапки (13.1). */
export const CALC_MODE_ORDER: readonly CalcMode[] = ['adaptive', 'rhi', 'classic_esi', 'strict'];

/** Пресет режима по идентификатору. */
export function getCalcPreset(mode: CalcMode): CalcModePreset {
  return CALC_MODE_PRESETS[mode];
}
