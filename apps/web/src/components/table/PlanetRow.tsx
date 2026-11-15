import { formatDelta } from '@exo/shared';
import type { KeyboardEvent } from 'react';

import { ExtraOnly } from '../../extra/ExtraOnly';
import { formatMessage, ru } from '../../i18n/ru';
import { EMPTY_VALUE, formatPercent } from '../../lib/format';
import { appStore, type AppStore } from '../../state/store';
import type { RankedRowView } from '../../workers/protocol';
import { Badge, Button, TableCell, TableNumberCell, TableRow } from '../ui';
import { CellValue } from './CellValue';
import { QBadge } from './QBadge';

/**
 * Строка таблицы Топ-50 (задача 16; п. 10.5, 10.5.7, 13.4).
 *
 * Клик по строке или Enter открывает карточку планеты, кнопка «Приблизить»
 * выбирает планету и запрашивает перелёт (U38), не открывая карточку.
 * Выбранная строка помечена `aria-selected`, совпадение поиска —
 * `data-search-match` (13.2).
 *
 * Служебные ячейки (Δ, Q_data, «N ист.», тег «эксп.») выведены через
 * `ExtraOnly` (задача 18, п. 11.2): в выключенном режиме их нет в DOM.
 */

/** Пропсы строки. */
export interface PlanetRowProps {
  /** Строка Топ-50. */
  row: RankedRowView;
  /** Планета выбрана. */
  selected: boolean;
  /** Планета совпала с поисковым запросом. */
  searchMatch: boolean;
  /** Показаны служебные данные (11.2, U12). */
  showExtraData: boolean;
  /** Показана колонка Δ (служебные данные или сравнение, 10.5.7). */
  showDelta: boolean;
  /** Открыть карточку планеты. */
  onOpen: (planetId: string) => void;
  /** Выбрать планету и запросить перелёт к ней. */
  onFly: (planetId: string) => void;
  /** Хранилище; в тестах подставляется изолированный экземпляр. */
  store?: AppStore;
}

/** Строка таблицы. */
export function PlanetRow({
  row,
  selected,
  searchMatch,
  showExtraData,
  showDelta,
  onOpen,
  onFly,
  store = appStore,
}: PlanetRowProps) {
  const classes = ['top-table__row', selected ? 'top-table__row--selected' : null]
    .filter(Boolean)
    .join(' ');
  const hasTags = row.lowReliability || showExtraData;

  /** Enter на сфокусированной строке открывает карточку (не с кнопки). */
  function handleKeyDown(event: KeyboardEvent<HTMLTableRowElement>): void {
    if (event.key !== 'Enter' || event.target !== event.currentTarget) return;

    event.preventDefault();
    onOpen(row.planetId);
  }

  const deltaCell = <TableNumberCell value={formatDelta(row.delta)} />;

  return (
    <TableRow
      className={classes}
      aria-selected={selected}
      data-search-match={searchMatch ? 'true' : undefined}
      tabIndex={0}
      onClick={() => onOpen(row.planetId)}
      onKeyDown={handleKeyDown}
    >
      <TableNumberCell value={row.rank} />

      {showDelta ? (
        showExtraData ? (
          <ExtraOnly id="table.delta" store={store}>
            {deltaCell}
          </ExtraOnly>
        ) : (
          deltaCell
        )
      ) : null}

      <TableCell className="top-table__planet">
        <span className="top-table__planet-name">{row.name}</span>
        <span className="top-table__planet-sub">
          <ExtraOnly id="table.sourcesCount" store={store}>
            <span className="top-table__sources">
              {formatMessage(ru['table.sources'], { count: row.sourcesCount })}
              {' · '}
            </span>
          </ExtraOnly>
          {row.hostname === '' ? EMPTY_VALUE : row.hostname}
        </span>

        {hasTags ? (
          <span className="top-table__tags">
            {row.lowReliability ? (
              <span data-help-key="tag.lowReliability" data-help-planet={row.planetId}>
                <Badge kind="low" label={ru['table.tag.lowReliability']} />
              </span>
            ) : null}
            <ExtraOnly id="table.tagExo" store={store}>
              <span data-help-key="tag.exo" data-help-planet={row.planetId}>
                <Badge kind="extrapolated" label={ru['table.tag.exo']} />
              </span>
            </ExtraOnly>
          </span>
        ) : null}
      </TableCell>

      <TableCell className="ui-table__number">
        <span
          className="top-table__index"
          data-help-key="val.index"
          data-help-planet={row.planetId}
        >
          <span>{formatPercent(row.score.index)}</span>
          {row.insufficient ? (
            <span data-help-key="badge.noData" data-help-planet={row.planetId}>
              <Badge kind="insufficient" label={ru['table.insufficient']} />
            </span>
          ) : null}
        </span>
      </TableCell>

      <ExtraOnly id="table.qdata" store={store}>
        <TableCell
          className="top-table__q"
          data-help-key="val.Q_data"
          data-help-planet={row.planetId}
        >
          <QBadge level={row.qLevel} value={row.Q_data} planetId={row.planetId} />
        </TableCell>
      </ExtraOnly>

      <CellValue
        value={row.R}
        kind="num"
        provenance={row.provenance.R}
        helpKey="val.R"
        planetId={row.planetId}
      />
      <CellValue
        value={row.M}
        kind="num"
        provenance={row.provenance.M}
        helpKey="val.M"
        planetId={row.planetId}
      />
      <CellValue value={row.T_s} kind="temp" helpKey="val.T_s" planetId={row.planetId} />
      <CellValue
        value={row.e}
        kind="e"
        provenance={row.provenance.e}
        helpKey="val.e"
        planetId={row.planetId}
      />

      <TableCell className="top-table__class">{row.spectralClass ?? EMPTY_VALUE}</TableCell>

      <CellValue value={row.dist_pc} kind="dist" helpKey="val.dist_pc" planetId={row.planetId} />

      <TableCell className="top-table__action">
        <Button
          variant="ghost"
          size="sm"
          onClick={(event) => {
            event.stopPropagation();
            onFly(row.planetId);
          }}
          onKeyDown={(event) => event.stopPropagation()}
        >
          {ru['table.fly']}
        </Button>
      </TableCell>
    </TableRow>
  );
}
