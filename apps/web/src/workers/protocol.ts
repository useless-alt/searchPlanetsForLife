import type {
  FilterState,
  ModelSettings,
  PlanetRecord,
  RankedRow,
  RankingCounters,
  ResolvedPlanet,
  SortDirection,
  SortKey,
  SortState,
  SpectralClass,
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

/** Бейдж достоверности Q_data (U8): «Высокая», «Средняя», «Оценочная». */
export type QBadge = 'high' | 'medium' | 'low';

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
  /** Бейдж достоверности Q_data (U8). */
  qBadge: QBadge;
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

/** Положение планеты для 3D-карты (задача 21). */
export interface PlanetPosition {
  /** Стабильный идентификатор планеты (U17). */
  id: string;
  /** Прямое восхождение [°]; null — неизвестно. */
  ra: number | null;
  /** Склонение [°]; null — неизвестно. */
  dec: number | null;
  /** Расстояние до системы [пк]; null — неизвестно. */
  dist_pc: number | null;
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

/** Сообщение основного потока воркеру. */
export type WorkerRequest = InitRequest | ComputeRequest | GetResolvedRequest | GetPositionsRequest;

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

/** Ответ с ошибкой обработки запроса. */
export interface ErrorResponse {
  type: 'error';
  requestId: number;
  message: string;
}

/** Сообщение воркера основному потоку. */
export type WorkerResponse =
  ReadyResponse | ResultResponse | ResolvedResponse | PositionsResponse | ErrorResponse;
