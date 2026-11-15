import type { RankedRowView } from '../workers/protocol';
import type { AppState } from './store';

/**
 * Селекторы store (задача 12, п. 10.3.4, 10.8.7).
 *
 * Выбранная планета хранится отдельно от `rows`: она не сбрасывается, когда
 * покидает Топ-50. Селекторы позволяют компонентам отличить «планета выбрана»
 * от «планета видна в текущем Топ-50».
 */

/** Строки текущего Топ-50. */
export function selectRows(state: AppState): RankedRowView[] {
  return state.rows;
}

/**
 * Строки таблицы без изменений (задача 16; п. 10.5).
 *
 * Отдельный селектор закрепляет контракт: таблица показывает ровно то, что
 * вернул воркер, а экспорт CSV (задача 20) берёт те же строки в том же
 * порядке отображения.
 */
export function selectTableRows(state: AppState): RankedRowView[] {
  return state.rows;
}

/** Строка Топ-50 по идентификатору планеты; null — планеты нет в текущем Топ-50. */
export function selectRowById(state: AppState, planetId: string | null): RankedRowView | null {
  if (planetId === null) return null;

  return state.rows.find((row) => row.planetId === planetId) ?? null;
}

/** Строка выбранной планеты; null — планета выбрана, но вне текущего Топ-50. */
export function selectSelectedRow(state: AppState): RankedRowView | null {
  return selectRowById(state, state.selectedPlanetId);
}

/**
 * Число активных групп фильтров (задача 15; п. 13.3).
 *
 * Группы: спектральный класс, радиус R, температура поверхности T_s,
 * эксцентриситет e. Группа активна, если задано хотя бы одно ограничение.
 * «Земля (эталон)» и поиск в бейдж не входят: они не фильтруют таблицу.
 */
export function selectActiveFilterCount(state: AppState): number {
  const { spectralClasses, radius, T_s, e } = state.filters;
  let count = 0;

  if (spectralClasses.length > 0) count += 1;
  if (radius.min !== null || radius.max !== null) count += 1;
  if (T_s.min !== null || T_s.max !== null) count += 1;
  if (e.min !== null || e.max !== null) count += 1;

  return count;
}

/**
 * Признак того, что выбранная планета присутствует в текущем Топ-50.
 *
 * `false` при смене режима/фильтра означает, что выбор сохранён, но планета
 * выпала из таблицы: карточка продолжает показывать её данные (10.3.4).
 */
export function isSelectedInTop(state: AppState): boolean {
  return selectSelectedRow(state) !== null;
}
