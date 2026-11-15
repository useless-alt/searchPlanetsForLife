import type { Provenance } from '@exo/shared';

import { approx, formatDist, formatNum, formatPercent, formatTemp } from '../../lib/format';
import { TableNumberCell } from '../ui';

/**
 * Числовая ячейка таблицы (задача 16; п. 4.2, 10.5).
 *
 * Форматирование по колонке и префикс `~` для расчётных значений:
 * `model` и `estimate` помечаются, `physics` и `measured` — нет.
 */

/** Вид значения в ячейке. */
export type CellValueKind = 'num' | 'temp' | 'dist' | 'percent' | 'e';

/** Пропсы ячейки. */
export interface CellValueProps {
  /** Значение; null — неизвестно. */
  value: number | null;
  /** Правило форматирования. */
  kind: CellValueKind;
  /** Происхождение значения: нужно только для `num` и `e`. */
  provenance?: Provenance | null;
  /** Ключ подсказки (задача 17). */
  helpKey?: string;
  /** Идентификатор планеты для подсказки значения. */
  planetId?: string;
}

/** Форматирует значение по правилу колонки. */
function formatValue(value: number | null, kind: CellValueKind): string {
  switch (kind) {
    case 'temp':
      return formatTemp(value);
    case 'dist':
      return formatDist(value);
    case 'percent':
      return formatPercent(value);
    case 'num':
    case 'e':
    default:
      return formatNum(value);
  }
}

/** Числовая ячейка с пометкой расчётного значения. */
export function CellValue({ value, kind, provenance, helpKey, planetId }: CellValueProps) {
  const formatted = formatValue(value, kind);
  const text =
    kind === 'temp' || kind === 'dist' || kind === 'percent'
      ? formatted
      : approx(formatted, provenance);

  return <TableNumberCell value={text} data-help-key={helpKey} data-help-planet={planetId} />;
}
