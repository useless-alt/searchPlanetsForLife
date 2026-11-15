import type { RankedRow, ScoreBreakdown } from '../types/scoring';
import type { FilterState, ModelSettings } from '../types/settings';
import type { ResolvedPlanet } from '../types/solver';

import { applyAttributeFilters, applyFilters } from './filters';
import { classicIndexOf, isCandidate, scoreBreakdown, strictIndexOf } from './score';
import { DEFAULT_SORT, sortRows, type SortState, type SortableRow } from './sort';

/**
 * Ранжирование Топ-50 (п. 3, 10.5, 10.6).
 *
 * `computeRanking` — единственная точка пересчёта: смена режима, границ зоны
 * обитаемости, чекбоксов штрафов, порога Q_data и фильтров даёт новый
 * результат за один вызов, без повторной загрузки данных (п. 3).
 *
 * Порядок работы:
 *   1. оценка всех планет в текущем режиме (`scores`);
 *   2. фильтрация и отбрасывание планет, не оценённых в этом режиме (U20);
 *   3. упорядочивание по индексу и присвоение рангов 1…N (первые 50);
 *   4. базовый ранг по упрощённому ESI (`rankClassic`) и сдвиг `delta` (U21);
 *   5. сортировка отображения — ранг при этом не меняется.
 */

/**
 * Счётчики выборки (п. 4.1, 10.5.4).
 *
 * «Кандидат» (запись с неполными данными и баллом 0.00) понимается в
 * текущем режиме: в «Адаптивном» это ровно записи с k < 3, а в остальных
 * режимах планеты с неполными данными либо не оцениваются вовсе, либо
 * получают содержательный балл (например, «Упрощённый ESI» считает по S и R).
 */
export interface RankingCounters {
  /** Всего уникальных планет на входе (N). */
  total: number;
  /**
   * Планет с рассчитанным индексом, без учёта кандидатов (N₁).
   *
   * Считается по текущему режиму: в «Адаптивном» это записи с k ≥ 3.
   */
  computed: number;
  /**
   * Планет, оценённых в строгом научном режиме (N₂).
   *
   * Не зависит от текущего режима — это свойство каталога.
   */
  strictMeasured: number;
  /**
   * Планет, прошедших фильтры и пригодных для таблицы (п. 10.5.4).
   *
   * Это те же строки, из которых берётся Топ-50, — до отсечения первыми 50.
   */
  matching: number;
}

/** Строка рейтинга с планетой-источником (для колонок таблицы и сортировки). */
export interface RankedRowWithPlanet extends RankedRow, SortableRow {
  /** Планета-источник строки. */
  planet: ResolvedPlanet;
}

/** Результат ранжирования. */
export interface RankingResult {
  /** Строки Топ-50 в порядке отображения (не более 50). */
  rows: RankedRowWithPlanet[];
  /** Счётчики выборки. */
  counters: RankingCounters;
  /** Оценки текущего режима по идентификатору планеты; `null` — режим не применим. */
  scores: Map<string, ScoreBreakdown | null>;
  /**
   * Базовые ранги по упрощённому ESI для всего отфильтрованного набора.
   *
   * В отличие от `rows` карта содержит и планеты за пределами Топ-50:
   * карточка планеты (задача 19) показывает ранг в упрощённом ESI и для них.
   */
  classicRanks: Map<string, number>;
}

/** Запись с оценкой режима. */
interface Scored {
  /** Планета-источник. */
  planet: ResolvedPlanet;
  /** Разложение балла текущего режима (индекс может быть `null`). */
  score: ScoreBreakdown;
}

/** Убирает повторы планет по идентификатору (U17); первая запись побеждает. */
function uniquePlanets(resolved: readonly ResolvedPlanet[]): ResolvedPlanet[] {
  const seen = new Set<string>();
  const result: ResolvedPlanet[] = [];

  for (const planet of resolved) {
    if (seen.has(planet.id)) continue;
    seen.add(planet.id);
    result.push(planet);
  }

  return result;
}

/**
 * Сравнение записей по индексу: по убыванию, при равенстве — по возрастанию id.
 *
 * Записи-кандидаты (неполные данные, балл 0.00) идут после остальных:
 * они не должны опережать полностью рассчитанные планеты.
 */
function compareByIndex(a: Scored, b: Scored): number {
  const aCandidate = isCandidate(a.score);
  const bCandidate = isCandidate(b.score);

  if (aCandidate !== bCandidate) return aCandidate ? 1 : -1;

  const left = a.score.index ?? -1;
  const right = b.score.index ?? -1;

  if (left !== right) return right - left;
  if (a.planet.id === b.planet.id) return 0;

  return a.planet.id < b.planet.id ? -1 : 1;
}

/**
 * Пересчитывает Топ-50: оценки, фильтры, ранги, сдвиг относительно
 * упрощённого ESI и сортировку отображения.
 *
 * @param resolved Планеты после решателя пропусков.
 * @param settings Настройки модели (режим, границы HZ, штрафы, порог Q_data).
 * @param filters Состояние панели фильтров.
 * @param sort Сортировка отображения; по умолчанию — по рангу.
 */
export function computeRanking(
  resolved: readonly ResolvedPlanet[],
  settings: ModelSettings,
  filters: FilterState,
  sort: SortState = DEFAULT_SORT,
): RankingResult {
  const planets = uniquePlanets(resolved);

  const scores = new Map<string, ScoreBreakdown | null>();
  const scored: Scored[] = [];
  let computed = 0;
  let strictMeasured = 0;

  for (const planet of planets) {
    const breakdown = scoreBreakdown(planet, settings);

    // В карте только состоявшиеся оценки: `null` — режим не применим (U20).
    scores.set(planet.id, breakdown.index === null ? null : breakdown);
    scored.push({ planet, score: breakdown });

    // N₁: индекс рассчитан и запись не кандидат (0.00 по неполным данным).
    if (breakdown.index !== null && !isCandidate(breakdown)) computed += 1;

    // N₂ не зависит от текущего режима: считаем всегда.
    if (strictIndexOf(breakdown, planet.flags.strict_complete) !== null) strictMeasured += 1;
  }

  // Шаг 2 — фильтры, затем отбрасывание планет, не оценённых в этом режиме.
  const filtered = applyFilters(scored, filters, settings);
  const eligible = filtered.filter((row) => row.score.index !== null);

  const matching = eligible.length;

  // Шаг 3 — упорядочивание по индексу.
  const ordered = [...eligible].sort(compareByIndex);

  // Шаг 4 — базовый ранг по упрощённому ESI (U21).
  const classicRanks = computeClassicRanks(scored, filters);

  // Шаг 5 — первые 50 и ранги 1…N.
  const rows: RankedRowWithPlanet[] = ordered.slice(0, 50).map((row, index) => {
    const rank = index + 1;
    const rankClassic = classicRanks.get(row.planet.id) ?? null;

    let delta: number | null = null;

    if (rankClassic !== null) {
      delta = settings.mode === 'classic_esi' ? 0 : rankClassic - rank;
    }

    return {
      rank,
      rankClassic,
      delta,
      planetId: row.planet.id,
      score: row.score,
      planet: row.planet,
    };
  });

  return {
    rows: sortRows(rows, sort),
    counters: {
      total: planets.length,
      computed,
      strictMeasured,
      matching,
    },
    scores,
    classicRanks,
  };
}

/**
 * Базовые ранги по упрощённому ESI (R, S) — U21.
 *
 * Ранг считается на полном наборе, прошедшем «геометрические» фильтры
 * (спектральный класс, радиус, температура, эксцентриситет), поэтому он может
 * быть больше 50: в таблице показаны только первые 50 строк, а базовый ранг
 * отсчитывается по всему набору.
 *
 * Набор не зависит от текущего режима, порога Q_data и переключателя
 * «Показывать кандидатов» — база сравнения не должна «плыть» при смене этих
 * настроек.
 *
 * Если базовый балл планеты не вычислен (нет S или R), у планеты нет и
 * базового ранга: `rankClassic = null`, `delta = null`.
 */
function computeClassicRanks(scored: readonly Scored[], filters: FilterState): Map<string, number> {
  const classic: Array<{ id: string; index: number }> = [];

  for (const row of applyAttributeFilters(scored, filters)) {
    const index = classicIndexOf(row.score);

    if (index === null) continue;

    classic.push({ id: row.planet.id, index });
  }

  classic.sort((a, b) => {
    if (a.index !== b.index) return b.index - a.index;
    if (a.id === b.id) return 0;

    return a.id < b.id ? -1 : 1;
  });

  const ranks = new Map<string, number>();

  classic.forEach((row, index) => {
    ranks.set(row.id, index + 1);
  });

  return ranks;
}
