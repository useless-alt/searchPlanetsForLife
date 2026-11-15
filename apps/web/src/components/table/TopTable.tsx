import { useEffect, useRef } from 'react';
import { useStore } from 'zustand';

import { ru } from '../../i18n/ru';
import { selectSearchMatchIds } from '../../state/searchSelectors';
import { selectTableRows } from '../../state/selectors';
import { appStore, type AppStore } from '../../state/store';
import type { SortColumn, SortSpec } from '../../workers/protocol';
import { Checkbox, Table, TableBody } from '../ui';
import { PlanetRow } from './PlanetRow';
import { SelectedOutsideNotice } from './SelectedOutsideNotice';
import { TableEmpty } from './TableEmpty';
import { TableHeader } from './TableHeader';

/**
 * Таблица Топ-50 (задача 16; п. 4.2, 10.5.6, 10.5.7, 10.6, 13.4).
 *
 * Колонки и их видимость:
 * - № виден всегда (U36);
 * - Δ — при служебных данных или включённом сравнении с упрощённым ESI
 *   (10.5.7);
 * - Q_data — при служебных данных (11.2, U12);
 * - R, M, T_s, e, «Кл.», d [пк] — всегда.
 *
 * Сортировка не меняет ранг: клик по заголовку переключает asc → desc →
 * возврат к rank asc, а `rank` в строках остаётся прежним (10.5.6).
 * Сортируются только строки, уже попавшие в Топ-50.
 */

/** Следующая сортировка по клику на заголовок (10.5.6). */
export function nextSortSpec(current: SortSpec, column: SortColumn): SortSpec {
  if (current.column !== column) return { column, dir: 'asc' };
  if (current.dir === 'asc') return { column, dir: 'desc' };

  return { column: 'rank', dir: 'asc' };
}

/** Пропсы таблицы. */
export interface TopTableProps {
  /** Хранилище; в тестах подставляется изолированный экземпляр. */
  store?: AppStore;
}

/** Таблица Топ-50. */
export function TopTable({ store = appStore }: TopTableProps = {}) {
  const rows = useStore(store, selectTableRows);
  const counters = useStore(store, (state) => state.counters);
  const sort = useStore(store, (state) => state.sort);
  const mode = useStore(store, (state) => state.settings.mode);
  const showExtraData = useStore(store, (state) => state.showExtraData);
  const compareClassic = useStore(store, (state) => state.compareClassic);
  const selectedPlanetId = useStore(store, (state) => state.selectedPlanetId);
  const catalogIndex = useStore(store, (state) => state.catalogIndex);
  const searchMatchIds = useStore(store, selectSearchMatchIds);
  const focusTableSeq = useStore(store, (state) => state.focusTableSeq);

  const setSort = useStore(store, (state) => state.setSort);
  const setCompareClassic = useStore(store, (state) => state.setCompareClassic);
  const selectPlanet = useStore(store, (state) => state.selectPlanet);
  const setPlanetCardOpen = useStore(store, (state) => state.setPlanetCardOpen);
  const requestFly = useStore(store, (state) => state.requestFly);
  const resetFilters = useStore(store, (state) => state.resetFilters);
  const resetSettings = useStore(store, (state) => state.resetSettings);

  const scrollRef = useRef<HTMLDivElement>(null);
  const lastFocusSeq = useRef(focusTableSeq);

  // «Выбрать другую планету»: фокус на первой строке Топ-50 (10.9.9).
  useEffect(() => {
    if (focusTableSeq === lastFocusSeq.current) return;

    lastFocusSeq.current = focusTableSeq;
    scrollRef.current?.querySelector<HTMLElement>('.top-table__row')?.focus();
  }, [focusTableSeq, rows]);

  // Δ нужна при служебных данных или сравнении с упрощённым ESI (U36, 10.5.7).
  const showDelta = showExtraData || compareClassic;
  const searchMatches = new Set(searchMatchIds);

  // Выбранная планета вне Топ-50 остаётся выбранной (10.3.4).
  const selectedOutsideName =
    selectedPlanetId !== null && !rows.some((row) => row.planetId === selectedPlanetId)
      ? (catalogIndex[selectedPlanetId]?.name ?? selectedPlanetId)
      : null;

  /** Открывает карточку планеты и запоминает выбор. */
  function openPlanet(planetId: string): void {
    selectPlanet(planetId);
    setPlanetCardOpen(true);
  }

  /** Выбирает планету и запрашивает перелёт к ней (U38). */
  function flyToPlanet(planetId: string): void {
    selectPlanet(planetId);
    requestFly(planetId, 'planet');
  }

  /** Сортирует строки Топ-50 по клику на заголовок. */
  function handleSort(column: SortColumn): void {
    const next = nextSortSpec(sort, column);
    setSort(next.column, next.dir);
  }

  return (
    <section className="top-table" aria-labelledby="top-table-title">
      <div className="top-table__head">
        <h2 className="top-table__title" id="top-table-title">
          {ru['table.title']}
        </h2>

        <div className="top-table__controls">
          <Checkbox
            label={ru['table.compareClassic']}
            checked={compareClassic}
            onChange={setCompareClassic}
          />

          {compareClassic && mode === 'classic_esi' ? (
            <p className="top-table__note">{ru['table.compareClassicNote']}</p>
          ) : null}
        </div>
      </div>

      {selectedOutsideName !== null ? (
        <SelectedOutsideNotice name={selectedOutsideName} onOpen={() => setPlanetCardOpen(true)} />
      ) : null}

      {rows.length === 0 ? (
        <TableEmpty
          kind={counters?.matching === 0 ? 'noMatch' : 'noData'}
          mode={mode}
          onResetFilters={resetFilters}
          onResetSettings={resetSettings}
        />
      ) : (
        <div className="top-table__scroll" ref={scrollRef}>
          <Table className="top-table__table" aria-label={ru['table.title']}>
            <TableHeader
              sort={sort}
              showExtraData={showExtraData}
              showDelta={showDelta}
              onSort={handleSort}
              store={store}
            />

            <TableBody>
              {rows.map((row) => (
                <PlanetRow
                  key={row.planetId}
                  row={row}
                  selected={row.planetId === selectedPlanetId}
                  searchMatch={searchMatches.has(row.planetId)}
                  showExtraData={showExtraData}
                  showDelta={showDelta}
                  onOpen={openPlanet}
                  onFly={flyToPlanet}
                  store={store}
                />
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}
