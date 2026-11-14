import type { CalcMode } from './scoring';

/** Выбор границ зоны обитаемости: консервативная или оптимистичная (п. 2.3). */
export type HzBounds = 'conservative' | 'optimistic';

/** Настройки модели, влияющие на расчёт (п. 3.2). */
export interface ModelSettings {
  /** Активный режим расчёта. */
  mode: CalcMode;
  /** Границы зоны обитаемости. */
  hzBounds: HzBounds;
  /** Включённые штрафы: разрыв Фултона, эксцентриситет, тип звезды, Q_data. */
  penalties: {
    rocky: boolean;
    ecc: boolean;
    star: boolean;
    qdata: boolean;
  };
  /** Минимальный порог Q_data [0.75..1.00]. */
  qMin: number;
}

/** Спектральный класс звезды по эффективной температуре. */
export type SpectralClass = 'M' | 'K' | 'G' | 'F' | 'A' | 'B' | 'O';

/** Диапазон значения фильтра; null — граница не задана. */
export interface Range {
  min: number | null;
  max: number | null;
}

/** Состояние панели фильтров. */
export interface FilterState {
  /** Выбранные спектральные классы; пустой массив — без ограничения. */
  spectralClasses: SpectralClass[];
  /** Диапазон радиуса планеты [R⊕]. */
  radius: Range;
  /** Диапазон температуры поверхности [К]. */
  T_s: Range;
  /** Диапазон эксцентриситета. */
  e: Range;
  /** Показывать явных кандидатов и ложные срабатывания. */
  includeCandidates: boolean;
  /** Показывать калибровочную строку «Земля (эталон)». */
  earthReference: boolean;
  /** Поисковый запрос по названию планеты. */
  search: string;
}

/**
 * Умолчания настроек модели (U10): режим adaptive, консервативные границы,
 * все четыре штрафа включены, минимальный Q_data = 0.75.
 */
export const DEFAULT_SETTINGS: ModelSettings = {
  mode: 'adaptive',
  hzBounds: 'conservative',
  penalties: {
    rocky: true,
    ecc: true,
    star: true,
    qdata: true,
  },
  qMin: 0.75,
};

/**
 * Умолчания фильтров: без ограничения по классам и диапазонам,
 * кандидаты и «Земля (эталон)» выключены, поиск пустой.
 * Значения includeCandidates и earthReference в ТЗ не заданы (U10).
 */
export const DEFAULT_FILTERS: FilterState = {
  spectralClasses: [],
  radius: { min: null, max: null },
  T_s: { min: null, max: null },
  e: { min: null, max: null },
  includeCandidates: false,
  earthReference: false,
  search: '',
};
