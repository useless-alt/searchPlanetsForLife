import {
  buildDecomposition,
  type DecompRow,
  type ModelSettings,
  type ScoreBreakdown,
} from '@exo/shared';
import { Fragment, useId, useState } from 'react';

import { ExtraOnly } from '../../extra/ExtraOnly';
import { formatMessage, ru } from '../../i18n/ru';
import { EMPTY_VALUE, formatNum, formatPercent } from '../../lib/format';
import type { AppStore } from '../../state/store';
import { Button, Table, TableBody, TableHead, TableRow } from '../ui';

/**
 * Раскрывающийся блок «Декомпозиция балла» (задача 19; п. 10.7, 13.5).
 *
 * По умолчанию свёрнут. Таблица строится `buildDecomposition`: значение,
 * реально вошедшее в расчёт, и накопленный балл после каждой строки.
 * Штрафы показывают, сколько процентных пунктов они отняли.
 */

/** Подписи строк. */
const ROW_LABELS: Record<DecompRow['id'], string> = {
  ESI_R: ru['planet.decomp.row.ESI_R'],
  ESI_rho: ru['planet.decomp.row.ESI_rho'],
  ESI_ve: ru['planet.decomp.row.ESI_ve'],
  ESI_S: ru['planet.decomp.row.ESI_S'],
  ESI_interior: ru['planet.decomp.row.ESI_interior'],
  F_HZ: ru['planet.decomp.row.F_HZ'],
  ESI4: ru['planet.decomp.row.ESI4'],
  base: ru['planet.decomp.row.base'],
  P_rocky: ru['planet.decomp.row.P_rocky'],
  P_ecc: ru['planet.decomp.row.P_ecc'],
  P_star: ru['planet.decomp.row.P_star'],
  Q_data: ru['planet.decomp.row.Q_data'],
  result: ru['planet.decomp.row.result'],
};

/** Значение в колонке «Значение». */
function valueText(row: DecompRow): string {
  if (row.state === 'excluded') return ru['planet.decomp.excluded'];
  if (row.state === 'disabled') return ru['planet.decomp.disabled'];
  if (row.state === 'na' || row.value === null) return EMPTY_VALUE;

  return row.kind === 'factor' ? formatNum(row.value) : formatPercent(row.value);
}

/** Значение в колонке «Балл после применения». */
function cumulativeText(row: DecompRow): string {
  if (row.kind === 'input' || row.cumulative === null) return EMPTY_VALUE;

  return formatPercent(row.cumulative);
}

/** Пропсы блока. */
export interface DecompositionProps {
  /** Разложение балла; null — режим не применим к планете. */
  score: ScoreBreakdown | null;
  /** Настройки модели: включённые штрафы. */
  settings: ModelSettings;
  /** Идентификатор планеты для подсказок. */
  planetId: string;
  /** Хранилище для режима служебных данных. */
  store?: AppStore;
}

/** Раскрывающийся блок декомпозиции. */
export function Decomposition({ score, settings, planetId, store }: DecompositionProps) {
  const [open, setOpen] = useState(false);
  const bodyId = useId();
  const titleId = `planet-decomp-${planetId}`;

  if (score === null) {
    return (
      <section className="planet-decomp" aria-labelledby={titleId}>
        <h3 className="planet-card__subtitle" id={titleId}>
          {ru['planet.decomp.title']}
        </h3>
        <p className="planet-card__note">{ru['planet.decomp.notApplicable']}</p>
      </section>
    );
  }

  const { rows, note } = buildDecomposition(score, settings);
  const mode = score.mode;

  /** Строка таблицы; вложенные входы RHI скрыты в обычном режиме. */
  function renderRow(row: DecompRow) {
    const content = (
      <TableRow data-help-key={`decomp.${row.id}`} data-help-planet={planetId}>
        <th scope="row" className="planet-decomp__label">
          {ROW_LABELS[row.id]}
        </th>
        <td className="ui-table__number">{valueText(row)}</td>
        <td className="ui-table__number">
          <span>{cumulativeText(row)}</span>
          {row.kind === 'factor' && row.state === 'used' && row.delta !== null && row.delta < 0 ? (
            <span className="planet-decomp__delta">
              {formatMessage(ru['planet.decomp.delta'], {
                value: Math.abs(row.delta * 100).toFixed(1),
              })}
            </span>
          ) : null}
        </td>
      </TableRow>
    );

    if (mode === 'rhi' && (row.id === 'ESI_R' || row.id === 'ESI_rho' || row.id === 'ESI_ve')) {
      return (
        <ExtraOnly key={row.id} id="card.decomp.sub" store={store}>
          {content}
        </ExtraOnly>
      );
    }

    return <Fragment key={row.id}>{content}</Fragment>;
  }

  return (
    <section className="planet-decomp" aria-labelledby={titleId}>
      <h3 className="planet-card__subtitle" id={titleId}>
        <Button
          variant="ghost"
          size="sm"
          className="planet-decomp__toggle"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => setOpen((value) => !value)}
        >
          {ru['planet.decomp.title']}
          <span className="planet-decomp__chevron" aria-hidden="true">
            {open ? '▴' : '▾'}
          </span>
        </Button>
      </h3>

      {open ? (
        <div className="planet-decomp__body" id={bodyId}>
          {note === null ? null : <p className="planet-card__note">{note}</p>}

          <Table className="planet-decomp__table">
            <TableHead>
              <TableRow>
                <th scope="col">{ru['planet.decomp.columns.metric']}</th>
                <th scope="col" className="ui-table__number">
                  {ru['planet.decomp.columns.value']}
                </th>
                <th scope="col" className="ui-table__number">
                  {ru['planet.decomp.columns.cumulative']}
                </th>
              </TableRow>
            </TableHead>
            <TableBody>{rows.map(renderRow)}</TableBody>
          </Table>
        </div>
      ) : null}
    </section>
  );
}
