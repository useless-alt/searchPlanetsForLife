import type { ParamValue } from './provenance';

/**
 * Субиндексы, из которых складывается индекс (п. 2.2, 2.3).
 *
 * ESI_R — радиус; ESI_rho — плотность; ESI_ve — вторая космическая;
 * ESI_S — поток излучения; ESI_T — температура поверхности; F_HZ — зона обитаемости.
 */
export type SubindexId = 'ESI_R' | 'ESI_rho' | 'ESI_ve' | 'ESI_S' | 'ESI_T' | 'F_HZ';

/**
 * Субиндексы адаптивного режима: n = 4 (U4).
 *
 *   1. «Адаптивный»: geomean(доступные из ESI_R, ESI_ρ, ESI_ve, F_HZ) · P_rocky · P_ecc · P_star · Q_data.
 */
export const ADAPTIVE_SUBINDICES: SubindexId[] = ['ESI_R', 'ESI_rho', 'ESI_ve', 'F_HZ'];

/**
 * Флаги каскадного решателя пропусков (Уровни А/Б/В, п. 1).
 */
export interface SolverFlags {
  /** k < 3: данных недостаточно, индекс 0.00, запись уходит за пределы Топ-50. */
  insufficient_data: boolean;
  /** Масса восстановлена по модели Чен — Киппинг (Уровень Б). */
  levelB_mass: boolean;
  /** Радиус восстановлен по модели Чен — Киппинг (Уровень Б). */
  levelB_radius: boolean;
  /** Эксцентриситет отсутствовал и принят равным нулю. */
  e_assumed_zero: boolean;
  /** Исключённые субиндексы (Уровень В). */
  excluded_subindices: string[];
  /** Число доступных субиндексов k. */
  k: number;
  /** Число субиндексов n. */
  n: number;
  /** Все поля строгого режима заданы и измерены (U19). */
  strict_complete: boolean;
  /** Доступность каждого субиндекса по данным (Уровень В). */
  available: Record<SubindexId, boolean>;
}

/**
 * Планета с разрешёнными параметрами после решателя.
 *
 * Единицы (п. 1.4): R, M — земные; L, st_rad, st_mass — солнечные;
 * d — большая полуось [а.е.]; P — сутки; S — земные потоки;
 * температуры — К; dist_pc — расстояние до системы [пк] (U13).
 */
export interface ResolvedPlanet {
  /** Стабильный идентификатор записи (U17). */
  id: string;
  /** Радиус планеты [R⊕]. */
  R: ParamValue;
  /** Масса планеты [M⊕]. */
  M: ParamValue;
  /** Эксцентриситет орбиты. */
  e: ParamValue;
  /** Большая полуось орбиты [а.е.]. */
  d: ParamValue;
  /** Период обращения [сут]. */
  P: ParamValue;
  /** Поток излучения у планеты [S⊕]. */
  S: ParamValue;
  /** Равновесная температура [К]. */
  T_eq: ParamValue;
  /** Средняя плотность [г/см³]. */
  rho: ParamValue;
  /** Светимость звезды [L☉]. */
  L: ParamValue;
  /** Эффективная температура звезды [К]. */
  st_teff: ParamValue;
  /** Радиус звезды [R☉]. */
  st_rad: ParamValue;
  /** Масса звезды [M☉]. */
  st_mass: ParamValue;
  /** Расстояние до системы [пк]. */
  dist_pc: ParamValue;
  /** Прямое восхождение [°]. */
  ra: ParamValue;
  /** Склонение [°]. */
  dec: ParamValue;
  /** Флаги решателя. */
  flags: SolverFlags;
}
