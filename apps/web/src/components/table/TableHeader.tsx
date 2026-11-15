import { ExtraOnly } from '../../extra/ExtraOnly';
import { ru } from '../../i18n/ru';
import { appStore, type AppStore } from '../../state/store';
import type { SortColumn, SortSpec } from '../../workers/protocol';
import { TableHead, TableHeaderCell, TableRow } from '../ui';

/**
 * Заголовок таблицы Топ-50 (задача 16; п. 10.5.6, 13.4).
 *
 * Состав и порядок колонок: №, Δ (при служебных данных или сравнении),
 * «Планета», «Индекс», Q_data (при служебных данных), R, M, T_s, e, «Кл.»,
 * d [пк], действие. Активная колонка помечена стрелкой и `aria-sort`.
 *
 * Служебные колонки выведены через `ExtraOnly` (задача 18, п. 11.2): Δ
 * может быть показана и переключателем «Сравнить с упрощённым ESI» (U36).
 *
 * `data-help-key` на заголовке — точка подключения подсказок задачи 17.
 */

/** Пропсы заголовка. */
export interface TableHeaderProps {
  /** Текущая сортировка. */
  sort: SortSpec;
  /** Показаны служебные данные (11.2, U12). */
  showExtraData: boolean;
  /** Показана колонка Δ (служебные данные или сравнение с ESI, 10.5.7). */
  showDelta: boolean;
  /** Запрос сортировки по колонке. */
  onSort: (column: SortColumn) => void;
  /** Хранилище; в тестах подставляется изолированный экземпляр. */
  store?: AppStore;
}

/** Заголовок таблицы. */
export function TableHeader({
  sort,
  showExtraData,
  showDelta,
  onSort,
  store = appStore,
}: TableHeaderProps) {
  /** Направление сортировки колонки; null — колонка не активна. */
  function direction(column: SortColumn): SortSpec['dir'] | null {
    return sort.column === column ? sort.dir : null;
  }

  /** Подпись кнопки сортировки: следующее действие по клику. */
  function sortLabel(column: SortColumn): string {
    return sort.column === column && sort.dir === 'asc'
      ? ru['ui.sort.descending']
      : ru['ui.sort.ascending'];
  }

  const deltaHeader = (
    <TableHeaderCell label={ru['table.columns.delta']} numeric data-help-key="col.delta" />
  );

  return (
    <TableHead>
      <TableRow>
        <TableHeaderCell
          label={ru['table.columns.rank']}
          numeric
          data-help-key="col.rank"
          sortDirection={direction('rank')}
          sortLabel={sortLabel('rank')}
          onSort={() => onSort('rank')}
        />

        {showDelta ? (
          showExtraData ? (
            <ExtraOnly id="table.delta" store={store}>
              {deltaHeader}
            </ExtraOnly>
          ) : (
            deltaHeader
          )
        ) : null}

        <TableHeaderCell label={ru['table.columns.planet']} />

        <TableHeaderCell
          label={ru['table.columns.index']}
          numeric
          data-help-key="col.index"
          sortDirection={direction('index')}
          sortLabel={sortLabel('index')}
          onSort={() => onSort('index')}
        />

        <ExtraOnly id="table.qdata" store={store}>
          <TableHeaderCell
            label={ru['table.columns.qdata']}
            numeric
            data-help-key="col.Q_data"
            sortDirection={direction('Q_data')}
            sortLabel={sortLabel('Q_data')}
            onSort={() => onSort('Q_data')}
          />
        </ExtraOnly>

        <TableHeaderCell
          label={ru['table.columns.radius']}
          numeric
          data-help-key="col.R"
          sortDirection={direction('R')}
          sortLabel={sortLabel('R')}
          onSort={() => onSort('R')}
        />

        <TableHeaderCell
          label={ru['table.columns.mass']}
          numeric
          data-help-key="col.M"
          sortDirection={direction('M')}
          sortLabel={sortLabel('M')}
          onSort={() => onSort('M')}
        />

        <TableHeaderCell
          label={ru['table.columns.tSurface']}
          numeric
          data-help-key="col.T_s"
          sortDirection={direction('T_s')}
          sortLabel={sortLabel('T_s')}
          onSort={() => onSort('T_s')}
        />

        <TableHeaderCell
          label={ru['table.columns.eccentricity']}
          numeric
          data-help-key="col.e"
          sortDirection={direction('e')}
          sortLabel={sortLabel('e')}
          onSort={() => onSort('e')}
        />

        <TableHeaderCell label={ru['table.columns.spectralClass']} data-help-key="col.class" />

        <TableHeaderCell
          label={ru['table.columns.distance']}
          numeric
          data-help-key="col.dist_pc"
          sortDirection={direction('dist_pc')}
          sortLabel={sortLabel('dist_pc')}
          onSort={() => onSort('dist_pc')}
        />

        <th scope="col" className="ui-table__th top-table__action-head">
          <span className="ui-visually-hidden">{ru['table.columns.action']}</span>
        </th>
      </TableRow>
    </TableHead>
  );
}
