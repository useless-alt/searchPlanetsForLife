import { CALC_MODE_ORDER, CALC_MODE_PRESETS, type CalcMode } from '@exo/shared';

import { ru } from '../../i18n/ru';
import { SegmentedControl } from '../ui';

/**
 * Переключатель режимов расчёта в шапке (задача 13; п. 4.1, 10.3, 13.1).
 *
 * Четыре сегмента в порядке пресетов: «Адаптивный», «RHI», «Упрощённый ESI
 * (R, S)», «Строгий научный». Подпись и краткая формула режима берутся из
 * `CALC_MODE_PRESETS` (U2), формула попадает во всплывающую подсказку, а
 * ключ `data-help-key` — в систему подсказок (задача 17).
 */

/** Пропсы переключателя режимов. */
export interface ModeSwitchProps {
  /** Выбранный режим расчёта. */
  value: CalcMode;
  /** Переключатель недоступен (каталог ещё загружается). */
  disabled: boolean;
  /** Обработчик выбора режима. */
  onChange: (mode: CalcMode) => void;
}

/** Переключатель режимов расчёта. */
export function ModeSwitch({ value, disabled, onChange }: ModeSwitchProps) {
  const options = CALC_MODE_ORDER.map((mode) => ({
    value: mode,
    label: CALC_MODE_PRESETS[mode].label,
    hint: CALC_MODE_PRESETS[mode].hint,
    helpKey: `mode.${mode}`,
    disabled,
  }));

  return (
    <SegmentedControl
      label={ru['header.modeLabel']}
      value={value}
      options={options}
      onChange={onChange}
      className="header__modes"
    />
  );
}
