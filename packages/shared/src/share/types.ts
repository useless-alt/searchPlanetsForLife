import type { SortDirection, SortKey } from '../ranking/sort';
import {
  DEFAULT_FILTERS,
  DEFAULT_SETTINGS,
  type ModelSettings,
  type Range,
  type SpectralClass,
} from '../types/settings';

/**
 * Состояние, которое переносится ссылкой (задача 20; 13.1, U45).
 *
 * В ссылку не входят поиск, «Показать дополнительные данные» и сравнение
 * с упрощённым ESI: это разовые режимы просмотра, а не часть общего
 * состояния. Поэтому фильтры описаны без `search`.
 */
export interface SharedFilters {
  /** Выбранные спектральные классы. */
  spectralClasses: SpectralClass[];
  /** Диапазон радиуса планеты [R⊕]. */
  radius: Range;
  /** Диапазон температуры поверхности [K]. */
  T_s: Range;
  /** Диапазон эксцентриситета. */
  e: Range;
  /** Показывать явных кандидатов и ложные срабатывания. */
  includeCandidates: boolean;
  /** Показывать калибровочную строку «Земля (эталон)». */
  earthReference: boolean;
}

/** Сортировка таблицы в переносимом состоянии. */
export interface SharedSort {
  /** Активная колонка. */
  column: SortKey;
  /** Направление. */
  dir: SortDirection;
}

/** Полное состояние, восстанавливаемое из ссылки (U45). */
export interface SharedState {
  /** Настройки модели: режим, границы HZ, штрафы, порог Q_data. */
  settings: ModelSettings;
  /** Фильтры без поискового запроса. */
  filters: SharedFilters;
  /** Сортировка таблицы. */
  sort: SharedSort;
  /** Выбранная планета; null — выбор не задан. */
  selectedPlanetId: string | null;
  /** Открыта ли карточка планеты. */
  planetCardOpen: boolean;
}

/** Результат разбора ссылки. */
export interface DecodeResult {
  /**
   * Восстановленное состояние.
   *
   * Для корректной ссылки заполнены все поля, для ссылки чужой версии —
   * пустой объект: хранилище не должно меняться.
   */
  state: Partial<SharedState>;
  /** Имена параметров, значения которых отброшены как недопустимые. */
  ignored: string[];
}

/** Версия формата ссылки (параметр `v`). */
export const SHARE_VERSION = 1;

/**
 * Порядок спектральных классов в ссылке (параметр `cls`).
 *
 * Он же порядок отображения в фильтрах: строка ссылки не зависит от порядка,
 * в котором пользователь отмечал классы.
 */
export const SHARE_SPECTRAL_ORDER: readonly SpectralClass[] = ['M', 'K', 'G', 'F', 'A', 'B', 'O'];

/** Границы спектральных классов, допустимые в параметре `cls`. */
export const SHARE_SPECTRAL_SET: ReadonlySet<string> = new Set(SHARE_SPECTRAL_ORDER);

/** Все режимы расчёта, допустимые в параметре `m`. */
export const SHARE_MODES = ['adaptive', 'rhi', 'classic_esi', 'strict'] as const;

/** Все колонки сортировки, допустимые в параметре `sort`. */
export const SHARE_SORT_KEYS: readonly SortKey[] = [
  'rank',
  'index',
  'Q_data',
  'R',
  'M',
  'T_s',
  'e',
  'dist_pc',
];

/** Копия настроек, не разделяющая вложенный объект штрафов с умолчаниями. */
function defaultSettings(): ModelSettings {
  return { ...DEFAULT_SETTINGS, penalties: { ...DEFAULT_SETTINGS.penalties } };
}

/** Копия фильтров без поискового запроса. */
function defaultFilters(): SharedFilters {
  return {
    spectralClasses: [...DEFAULT_FILTERS.spectralClasses],
    radius: { ...DEFAULT_FILTERS.radius },
    T_s: { ...DEFAULT_FILTERS.T_s },
    e: { ...DEFAULT_FILTERS.e },
    includeCandidates: DEFAULT_FILTERS.includeCandidates,
    earthReference: DEFAULT_FILTERS.earthReference,
  };
}

/**
 * Состояние по умолчанию для разбора ссылки.
 *
 * Возвращает новые объекты: вызывающий код может менять результат, не
 * затрагивая `DEFAULT_SETTINGS` и `DEFAULT_FILTERS`.
 */
export function defaultSharedState(): SharedState {
  return {
    settings: defaultSettings(),
    filters: defaultFilters(),
    sort: { column: 'rank', dir: 'asc' },
    selectedPlanetId: null,
    planetCardOpen: false,
  };
}
