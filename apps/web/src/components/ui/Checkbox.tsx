import { useEffect, useId, useRef } from 'react';

/**
 * Флажок (задача 12a).
 *
 * Настоящий `input[type=checkbox]`: доступен с клавиатуры, работает в
 * программах экранного доступа. Подпись видна всегда, пояснение — под ней.
 */

/** Пропсы флажка. */
export interface CheckboxProps {
  /** Подпись флажка. */
  label: string;
  /** Состояние. */
  checked: boolean;
  /** Обработчик смены состояния. */
  onChange: (checked: boolean) => void;
  /** Пояснение под подписью. */
  description?: string;
  /** Флажок недоступен. */
  disabled?: boolean;
  /** Третье состояние («частично»). */
  indeterminate?: boolean;
  /** Имя поля в форме. */
  name?: string;
  /** Идентификатор поля (генерируется, если не задан). */
  id?: string;
}

/** Флажок. */
export function Checkbox({
  label,
  checked,
  onChange,
  description,
  disabled = false,
  indeterminate = false,
  name,
  id,
}: CheckboxProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const descriptionId = `${inputId}-description`;
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (input.current !== null) input.current.indeterminate = indeterminate;
  }, [indeterminate]);

  const classes = ['ui-checkbox', disabled ? 'ui-checkbox--disabled' : null]
    .filter(Boolean)
    .join(' ');

  return (
    <label className={classes} htmlFor={inputId}>
      <input
        ref={input}
        id={inputId}
        name={name}
        type="checkbox"
        className="ui-checkbox__control"
        checked={checked}
        disabled={disabled}
        aria-describedby={description ? descriptionId : undefined}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="ui-checkbox__label">
        {label}
        {description ? (
          <span className="ui-checkbox__description" id={descriptionId}>
            {description}
          </span>
        ) : null}
      </span>
    </label>
  );
}
