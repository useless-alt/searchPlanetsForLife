import { useId } from 'react';

/**
 * Поле ввода (задача 12a).
 *
 * Подпись всегда видна и связана с полем; ошибка живёт под своим полем и
 * объявляется через `aria-describedby` (system.md, «Ошибки под полями»).
 */

/** Тип поля. */
export type InputType = 'text' | 'search' | 'number' | 'email';

/** Пропсы поля ввода. */
export interface InputProps {
  /** Подпись поля. */
  label: string;
  /** Значение поля. */
  value: string;
  /** Обработчик изменения значения. */
  onChange: (value: string) => void;
  /** Тип поля. */
  type?: InputType;
  /** Пояснение под полем. */
  hint?: string;
  /** Текст ошибки под полем. */
  error?: string | null;
  /** Подсказка внутри поля (не заменяет подпись). */
  placeholder?: string;
  /** Поле недоступно. */
  disabled?: boolean;
  /** Режим экранной клавиатуры. */
  inputMode?: 'text' | 'numeric' | 'search' | 'email';
  /** Автодополнение браузера. */
  autoComplete?: string;
  /** Идентификатор поля (генерируется, если не задан). */
  id?: string;
}

/** Поле ввода с подписью, подсказкой и ошибкой. */
export function Input({
  label,
  value,
  onChange,
  type = 'text',
  hint,
  error = null,
  placeholder,
  disabled = false,
  inputMode,
  autoComplete,
  id,
}: InputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ');

  return (
    <div className="ui-field">
      <label className="ui-field__label" htmlFor={inputId}>
        {label}
      </label>
      <input
        id={inputId}
        type={type}
        className="ui-field__input"
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        inputMode={inputMode}
        autoComplete={autoComplete}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy === '' ? undefined : describedBy}
        onChange={(event) => onChange(event.target.value)}
      />
      {hint ? (
        <p className="ui-field__hint" id={hintId}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p className="ui-field__error" id={errorId}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
