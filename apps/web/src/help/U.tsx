/**
 * Символ единицы с подсказкой (задача 17; п. 11.7).
 *
 * `<U sym="R⊕" />` выводит `<abbr data-help-key="unit.R_earth">R⊕</abbr>`.
 * Соответствие символов ключам словаря задано один раз, чтобы подпись
 * единицы в разных местах открывала одну и ту же подсказку.
 */

/** Соответствие символа единицы ключу реестра. */
export const UNIT_HELP_KEYS = {
  'R⊕': 'unit.R_earth',
  'M⊕': 'unit.M_earth',
  K: 'unit.K',
  пк: 'unit.pc',
  'а.е.': 'unit.au',
  'R☉': 'unit.R_sun',
  'L☉': 'unit.L_sun',
  'M☉': 'unit.M_sun',
  'г/см³': 'unit.g_cm3',
  дн: 'unit.day',
} as const;

/** Допустимый символ единицы. */
export type UnitSymbol = keyof typeof UNIT_HELP_KEYS;

/** Пропсы компонента единицы. */
export interface UProps {
  /** Символ единицы. */
  sym: UnitSymbol;
  /** Дополнительный класс. */
  className?: string;
}

/** Символ единицы с точкой подключения подсказки. */
export function U({ sym, className }: UProps) {
  return (
    <abbr className={className} data-help-key={UNIT_HELP_KEYS[sym]}>
      {sym}
    </abbr>
  );
}
