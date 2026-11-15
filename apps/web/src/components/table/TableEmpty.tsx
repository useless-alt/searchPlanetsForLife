import { CALC_MODE_PRESETS, type CalcMode } from '@exo/shared';

import { formatMessage, ru } from '../../i18n/ru';
import { Button, EmptyState } from '../ui';

/**
 * Пустые состояния таблицы (задача 16; п. 10.4).
 *
 * Два разных случая:
 * - ни одна планета не проходит фильтры — предлагаются сбросы;
 * - фильтры проходят, но в выбранном режиме нет планет с достаточными
 *   данными — предлагается выбрать другой режим (фокус уходит на
 *   переключатель режимов в шапке).
 */

/** Вид пустого состояния. */
export type TableEmptyKind = 'noMatch' | 'noData';

/** Пропсы пустого состояния. */
export interface TableEmptyProps {
  /** Причина пустой таблицы. */
  kind: TableEmptyKind;
  /** Текущий режим расчёта (для сообщения второго случая). */
  mode: CalcMode;
  /** Сбросить фильтры (10.4). */
  onResetFilters: () => void;
  /** Сбросить настройки модели (10.4). */
  onResetSettings: () => void;
}

/** Переводит фокус на активный сегмент переключателя режимов. */
function focusModeSwitch(): void {
  const checked = document.querySelector<HTMLElement>(
    '.header__modes [role="radio"][aria-checked="true"]',
  );

  checked?.focus();
}

/** Пустое состояние таблицы. */
export function TableEmpty({ kind, mode, onResetFilters, onResetSettings }: TableEmptyProps) {
  if (kind === 'noMatch') {
    return (
      <EmptyState
        title={ru['table.empty.noMatch']}
        action={
          <div className="top-table__empty-actions">
            <Button variant="secondary" onClick={onResetFilters}>
              {ru['toolbar.resetFilters']}
            </Button>
            <Button variant="ghost" onClick={onResetSettings}>
              {ru['toolbar.resetSettings']}
            </Button>
          </div>
        }
      />
    );
  }

  return (
    <EmptyState
      title={formatMessage(ru['table.empty.noData'], {
        mode: CALC_MODE_PRESETS[mode].label,
      })}
      action={
        <Button variant="secondary" onClick={focusModeSwitch}>
          {ru['table.empty.chooseMode']}
        </Button>
      }
    />
  );
}
