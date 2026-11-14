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
 * Признак того, что выбранная планета присутствует в текущем Топ-50.
 *
 * `false` при смене режима/фильтра означает, что выбор сохранён, но планета
 * выпала из таблицы: карточка продолжает показывать её данные (10.3.4).
 */
export function isSelectedInTop(state: AppState): boolean {
  return selectSelectedRow(state) !== null;
}
