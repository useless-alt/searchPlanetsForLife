import { useCallback, useRef } from 'react';
import type { KeyboardEvent } from 'react';

/**
 * Сегментированный переключатель (задача 12a; п. 13.1 и п. 11.6).
 *
 * Группа радиокнопок (`radiogroup`): варианты переключаются кликом и стрелками
 * ←/→/↑/↓, фокус остаётся на выбранном варианте (roving tabindex) — так
 * переключатель занимает одну позицию в порядке обхода с клавиатуры.
 */

/** Вариант переключателя. */
export interface SegmentedControlOption<T extends string> {
  /** Значение варианта. */
  value: T;
  /** Подпись варианта. */
  label: string;
  /** Подсказка к варианту (например, формула режима). */
  hint?: string;
  /**
   * Ключ справки варианта.
   *
   * Выводится в `data-help-key`: система подсказок (задача 17) находит по
   * нему текст справки из своего словаря.
   */
  helpKey?: string;
  /** Вариант недоступен (нативная блокировка). */
  disabled?: boolean;
  /**
   * Вариант недоступен, но остаётся фокусируемым для подсказки.
   *
   * Используется сценой системы: `aria-disabled="true"` вместо HTML
   * `disabled`, чтобы работали `showHelpAt` и причина недоступности.
   */
  ariaDisabled?: boolean;
  /** Причина недоступности для подсказки. */
  disabledReason?: string;
}

/** Пропсы сегментированного переключателя. */
export interface SegmentedControlProps<T extends string> {
  /** Доступное имя группы. */
  label: string;
  /** Выбранное значение. */
  value: T;
  /** Варианты в порядке показа. */
  options: readonly SegmentedControlOption<T>[];
  /** Обработчик смены значения. */
  onChange: (value: T) => void;
  /** Дополнительный класс. */
  className?: string;
}

/** Следующий доступный вариант в заданном направлении. */
function nextEnabled<T extends string>(
  options: readonly SegmentedControlOption<T>[],
  from: number,
  step: number,
): SegmentedControlOption<T> | undefined {
  const total = options.length;

  for (let offset = 1; offset <= total; offset += 1) {
    const index = (from + offset * step + total * total) % total;
    const option = options[index];

    if (option !== undefined && option.disabled !== true) return option;
  }

  return undefined;
}

/** Сегментированный переключатель. */
export function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onChange,
  className,
}: SegmentedControlProps<T>) {
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const classes = ['ui-segmented', className].filter(Boolean).join(' ');

  const focusOption = useCallback((option: SegmentedControlOption<T> | undefined) => {
    if (option === undefined) return;

    buttons.current.get(option.value)?.focus();
  }, []);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      const current = options.findIndex((option) => option.value === value);

      if (current < 0) return;

      let target: SegmentedControlOption<T> | undefined;

      switch (event.key) {
        case 'ArrowRight':
        case 'ArrowDown':
          target = nextEnabled(options, current, 1);
          break;
        case 'ArrowLeft':
        case 'ArrowUp':
          target = nextEnabled(options, current, -1);
          break;
        case 'Home':
          target = options.find((option) => option.disabled !== true);
          break;
        case 'End': {
          for (let index = options.length - 1; index >= 0; index -= 1) {
            const option = options[index];

            if (option !== undefined && option.disabled !== true) {
              target = option;
              break;
            }
          }

          break;
        }
        default:
          return;
      }

      if (target === undefined) return;

      event.preventDefault();

      // Недоступный вариант можно выбрать стрелкой только для подсказки:
      // значение не меняется, но причина становится доступна с клавиатуры.
      if (target.ariaDisabled !== true && target.value !== value) onChange(target.value);

      focusOption(target);
    },
    [focusOption, onChange, options, value],
  );

  return (
    <div className={classes} role="radiogroup" aria-label={label} onKeyDown={handleKeyDown}>
      {options.map((option) => {
        const checked = option.value === value;

        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-disabled={option.ariaDisabled === true ? 'true' : undefined}
            tabIndex={checked ? 0 : -1}
            disabled={option.disabled === true}
            title={option.hint}
            data-help-key={option.helpKey}
            data-help-disabled-reason={option.disabledReason}
            className="ui-segmented__option"
            ref={(element) => {
              if (element === null) buttons.current.delete(option.value);
              else buttons.current.set(option.value, element);
            }}
            onClick={() => {
              if (option.ariaDisabled !== true) onChange(option.value);
            }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
