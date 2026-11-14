import type { ScoreBreakdown } from '../types/scoring';
import type { ResolvedPlanet } from '../types/solver';

/**
 * Сортировка отображения таблицы Топ-50 (10.5.6).
 *
 * Сортировка не меняет `rank`: ранг присваивается по индексу и остаётся
 * прежним при переключении колонки. Значения `null` всегда идут в конце,
 * независимо от направления. Порядок сортировки устойчив: строки с равными
 * значениями сохраняют исходный порядок.
 */

/** Колонка сортировки. */
export type SortKey = 'rank' | 'index' | 'Q_data' | 'R' | 'M' | 'T_s' | 'e' | 'dist_pc';

/** Направление сортировки. */
export type SortDirection = 'asc' | 'desc';

/** Состояние сортировки таблицы. */
export interface SortState {
  /** Активная колонка. */
  key: SortKey;
  /** Направление. */
  direction: SortDirection;
}

/** Все колонки сортировки в порядке колонок таблицы (13.4). */
export const SORT_KEYS: readonly SortKey[] = [
  'rank',
  'index',
  'Q_data',
  'R',
  'M',
  'T_s',
  'e',
  'dist_pc',
];

/** Сортировка по умолчанию — по рангу, по возрастанию. */
export const DEFAULT_SORT: SortState = { key: 'rank', direction: 'asc' };

/** Строка, которую можно отсортировать. */
export interface SortableRow {
  /** Ранг в текущем режиме (не меняется при сортировке). */
  rank: number;
  /** Разложение балла текущего режима. */
  score: ScoreBreakdown;
  /** Планета-источник: даёт R, M, e и расстояние до системы. */
  planet: ResolvedPlanet;
}

/**
 * Значение колонки для строки.
 *
 * `null` означает, что параметр неизвестен: такие строки уходят в конец
 * при любом направлении сортировки.
 */
export function sortValue(row: SortableRow, key: SortKey): number | null {
  switch (key) {
    case 'rank':
      return row.rank;
    case 'index':
      return row.score.index;
    case 'Q_data':
      return row.score.Q_data;
    case 'R':
      return row.planet.R.value;
    case 'M':
      return row.planet.M.value;
    case 'T_s':
      return row.score.T_s;
    case 'e':
      return row.planet.e.value;
    case 'dist_pc':
      return row.planet.dist_pc.value;
    default:
      return null;
  }
}

/**
 * Сравнение двух строк по колонке.
 *
 * `null` всегда больше любого числа: неизвестные значения уходят в конец
 * независимо от направления.
 */
function compareRows(
  a: SortableRow,
  b: SortableRow,
  key: SortKey,
  direction: SortDirection,
): number {
  const left = sortValue(a, key);
  const right = sortValue(b, key);

  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  if (left === right) return 0;

  const ascending = direction === 'asc';

  return left < right === ascending ? -1 : 1;
}

/**
 * Сортирует строки по колонке и направлению.
 *
 * Сортировка устойчива: исходный порядок строк с равными значениями
 * сохраняется.
 */
export function sortRows<T extends SortableRow>(rows: readonly T[], sort: SortState): T[] {
  const { key, direction } = sort;

  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => {
      const byValue = compareRows(a.row, b.row, key, direction);

      return byValue !== 0 ? byValue : a.index - b.index;
    })
    .map((item) => item.row);
}
