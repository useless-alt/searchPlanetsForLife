import type {
  FilterState,
  ModelSettings,
  PlanetRecord,
  Provenance,
  RankedRow,
  RankingCounters,
  RenderGaps,
  ResolvedPlanet,
  ScoreBreakdown,
  SortDirection,
  SortKey,
  SortState,
  SpectralClass,
  WorldClass,
} from '@exo/shared';

/**
 * Протокол обмена с воркером расчёта (задача 12, п. 10.1, 10.8.7).
 *
 * Все запросы и ответы помечены `requestId`: ответ с устаревшим
 * идентификатором отбрасывается клиентом, поэтому три подряд изменённых
 * настройки не «перетирают» друг друга.
 */

/** Колонка сортировки таблицы (10.5.6); совпадает с `SortKey` из `@exo/shared`. */
export type SortColumn = SortKey;

/** Состояние сортировки в store: `column` + `dir` (задача 12). */
export interface SortSpec {
  /** Активная колонка. */
  column: SortColumn;
  /** Направление сортировки. */
  dir: SortDirection;
}

/** Сортировка по умолчанию — по рангу, по возрастанию. */
export const DEFAULT_SORT_SPEC: SortSpec = { column: 'rank', dir: 'asc' };

/** Переводит состояние сортировки store в формат `computeRanking`. */
export function toSortState(sort: SortSpec): SortState {
  return { key: sort.column, direction: sort.dir };
}

/** Переводит сортировку `computeRanking` в состояние store. */
export function toSortSpec(sort: SortState): SortSpec {
  return { column: sort.key, dir: sort.direction };
}

/**
 * Уровень достоверности Q_data для бейджа таблицы (U8).
 *
 * `estimated` — нижняя ступень шкалы («Оценочная»); пороги берутся из
 * `Q_BADGE_THRESHOLDS`.
 */
export type QLevel = 'high' | 'medium' | 'estimated';

/** Происхождение параметров планеты, показываемых в таблице (п. 4.2, 11.1). */
export interface RowProvenance {
  /** Происхождение радиуса R. */
  R: Provenance | null;
  /** Происхождение массы M. */
  M: Provenance | null;
  /** Происхождение эксцентриситета e. */
  e: Provenance | null;
}

/**
 * Строка таблицы Топ-50 с полями, нужными таблице и карточке (10.5, 13.4).
 *
 * `RankedRow` уже содержит ранг, сдвиг и полное разложение балла; здесь
 * добавлены денормализованные поля планеты, чтобы таблица не обращалась
 * к воркеру за каждой строкой.
 */
export interface RankedRowView extends RankedRow {
  /** Отображаемое имя планеты. */
  name: string;
  /** Имя родительской звезды. */
  hostname: string;
  /** Радиус планеты [R⊕]; null — неизвестен. */
  R: number | null;
  /** Масса планеты [M⊕]; null — неизвестна. */
  M: number | null;
  /** Температура поверхности [К] (T_eq + 33); null — неизвестна. */
  T_s: number | null;
  /** Эксцентриситет орбиты; null — неизвестен. */
  e: number | null;
  /** Спектральный класс звезды (U9); null — температура неизвестна. */
  spectralClass: SpectralClass | null;
  /** Расстояние до системы [пк]; null — неизвестно. */
  dist_pc: number | null;
  /** Число источников, из которых собрана запись («N ист.», 13.4). */
  sourcesCount: number;
  /** Коэффициент достоверности данных Q_data (п. 2.5). */
  Q_data: number;
  /** Уровень достоверности для бейджа (U8). */
  qLevel: QLevel;
  /** Происхождение R, M и e для префикса `~` (п. 4.2). */
  provenance: RowProvenance;
  /** Масса или радиус восстановлены на Уровне Б: тег «Низк.» (U37). */
  lowReliability: boolean;
  /** Данных недостаточно (k < 3): индекс 0.00 и значок (10.5). */
  insufficient: boolean;
  /** Масса восстановлена по модели Чен — Киппинг (Уровень Б). */
  levelB_mass: boolean;
  /** Радиус восстановлен по модели Чен — Киппинг (Уровень Б). */
  levelB_radius: boolean;
  /** Эксцентриситет отсутствовал и принят нулевым. */
  e_assumed_zero: boolean;
}

/** Результат пересчёта в воркере. */
export interface ComputeResult {
  /** Строки Топ-50 в порядке отображения (не более 50). */
  rows: RankedRowView[];
  /** Счётчики выборки N, N₁, N₂, «подходят». */
  counters: RankingCounters;
}

/** Положение планеты для 3D-карты (задача 21; п. 6.1, 10.8; U44). */
export interface PlanetPosition {
  /** Стабильный идентификатор планеты (U17). */
  id: string;
  /**
   * Канонический ключ родительской звезды (нормализация имени, п. 7.2).
   * null — имени звезды нет; система тогда определяется по `id` планеты.
   */
  hostKey: string | null;
  /** Прямое восхождение [°]; null — неизвестно. */
  ra: number | null;
  /** Склонение [°]; null — неизвестно. */
  dec: number | null;
  /** Расстояние до системы [пк]; null — неизвестно. */
  dist_pc: number | null;
  /** Эффективная температура звезды [К]; null — неизвестна. */
  st_teff: number | null;
}

/** Границы зоны обитаемости и положение планеты в ней (11.4). */
export interface PlanetHzView {
  /** Внутренняя граница зоны [а.е.]. */
  d_in: number;
  /** Внешняя граница зоны [а.е.]. */
  d_out: number;
  /** Эффективная дистанция с поправкой на эксцентриситет [а.е.]. */
  d_eff: number;
  /** Положение в зоне обитаемости. */
  HZD: number;
  /** Климатический балл. */
  F_HZ: number;
}

/**
 * Полные данные планеты для карточки и 3D-сцены (задача 19; п. 10.7, 13.5).
 *
 * Деталь запрашивается воркером при каждой смене выбранной планеты, настроек
 * модели или снимка каталога. `score` — разложение текущего режима; `null`,
 * если режим к планете не применим (U20).
 */
export interface PlanetDetail {
  /** Стабильный идентификатор планеты. */
  id: string;
  /** Отображаемое имя планеты. */
  name: string;
  /** Имя родительской звезды; null — неизвестно. */
  hostname: string | null;
  /** Буква планеты у звезды (b..z); null — не определена. */
  letter: string | null;
  /** Синонимы имени планеты. */
  aliases: string[];
  /** Число источников, из которых собрана запись. */
  sourcesCount: number;
  /** Разрешённые параметры после решателя пропусков. */
  resolved: ResolvedPlanet;
  /** Разложение балла текущего режима; null — режим не применим. */
  score: ScoreBreakdown | null;
  /** Ранг в упрощённом ESI; null — нет базы сравнения или планета вне Топ-50. */
  classicRank: number | null;
  /** Зона обитаемости для выбранных границ; null — границы не рассчитаны. */
  hz: PlanetHzView | null;
  /** Класс мира (U41). */
  world: WorldClass;
  /** Пробелы данных для отрисовки (п. 9.2). */
  gaps: RenderGaps;
  /** Планета входит в текущий Топ-50. */
  inTop: boolean;
}

/** Запрос инициализации: каталог передаётся один раз за снимок. */
export interface InitRequest {
  type: 'init';
  requestId: number;
  /** Планеты снимка после дедупликации. */
  planets: PlanetRecord[];
}

/** Запрос пересчёта Топ-50. */
export interface ComputeRequest {
  type: 'compute';
  requestId: number;
  settings: ModelSettings;
  filters: FilterState;
  sort: SortSpec;
}

/** Запрос разрешённых планет по идентификаторам (карточка, 3D). */
export interface GetResolvedRequest {
  type: 'getResolved';
  requestId: number;
  ids: string[];
}

/** Запрос координат всех планет (3D-карта, задача 21). */
export interface GetPositionsRequest {
  type: 'getPositions';
  requestId: number;
}

/** Запрос полных данных планеты для карточки (задача 19). */
export interface GetPlanetDetailRequest {
  type: 'getPlanetDetail';
  requestId: number;
  /** Идентификатор планеты. */
  id: string;
}

/** Сообщение основного потока воркеру. */
export type WorkerRequest =
  InitRequest | ComputeRequest | GetResolvedRequest | GetPositionsRequest | GetPlanetDetailRequest;

/** Ответ на инициализацию: решатель пропусков отработал один раз. */
export interface ReadyResponse {
  type: 'ready';
  requestId: number;
  /** Число разрешённых планет. */
  count: number;
}

/** Ответ на пересчёт. */
export interface ResultResponse {
  type: 'result';
  requestId: number;
  rows: RankedRowView[];
  counters: RankingCounters;
}

/** Ответ с разрешёнными планетами. */
export interface ResolvedResponse {
  type: 'resolved';
  requestId: number;
  items: ResolvedPlanet[];
}

/** Ответ с координатами планет. */
export interface PositionsResponse {
  type: 'positions';
  requestId: number;
  items: PlanetPosition[];
}

/** Ответ с полными данными планеты. */
export interface DetailResponse {
  type: 'detail';
  requestId: number;
  detail: PlanetDetail;
}

/** Ответ с ошибкой обработки запроса. */
export interface ErrorResponse {
  type: 'error';
  requestId: number;
  message: string;
}

/** Сообщение воркера основному потоку. */
export type WorkerResponse =
  | ReadyResponse
  | ResultResponse
  | ResolvedResponse
  | PositionsResponse
  | DetailResponse
  | ErrorResponse;
