import { useId } from 'react';

/**
 * Пара «Мин — Макс» (задача 12a; п. 13.3).
 *
 * Два числовых поля рядом: нижняя и верхняя границы диапазона. Пустое поле
 * означает «граница не задана» (`null`), а не ноль.
 */

/** Значение диапазона. */
export interface RangeValue {
  /** Нижняя граница; null — не задана. */
  min: number | null;
  /** Верхняя граница; null — не задана. */
  max: number | null;
}

/** Пропсы пары «Мин — Макс». */
export interface RangeInputProps {
  /** Подпись группы полей. */
  label: string;
  /** Текущие границы. */
  value: RangeValue;
  /** Обработчик изменения границ. */
  onChange: (value: RangeValue) => void;
  /** Подпись нижнего поля. */
  minLabel?: string;
  /** Подпись верхнего поля. */
  maxLabel?: string;
  /** Шаг полей. */
  step?: number;
  /** Текст ошибки под группой. */
  error?: string | null;
  /** Поля недоступны. */
  disabled?: boolean;
}

/** Разбор значения поля: пустая строка — отсутствие значения. */
function parseValue(raw: string): number | null {
  if (raw.trim() === '') return null;

  const parsed = Number(raw);

  return Number.isFinite(parsed) ? parsed : null;
}

/** Пара числовых полей «Мин» и «Макс». */
export function RangeInput({
  label,
  value,
  onChange,
  minLabel = 'Мин',
  maxLabel = 'Макс',
  step = 1,
  error = null,
  disabled = false,
}: RangeInputProps) {
  const generatedId = useId();
  const minId = `${generatedId}-min`;
  const maxId = `${generatedId}-max`;
  const errorId = `${generatedId}-error`;

  return (
    <div className="ui-range">
      <div className="ui-range__head">
        <span className="ui-range__label">{label}</span>
      </div>
      <div className="ui-range__fields">
        <div className="ui-range__field">
          <label className="ui-range__field-label" htmlFor={minId}>
            {minLabel}
          </label>
          <input
            id={minId}
            type="number"
            className="ui-range__input"
            step={step}
            value={value.min ?? ''}
            disabled={disabled}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            onChange={(event) => onChange({ ...value, min: parseValue(event.target.value) })}
          />
        </div>
        <div className="ui-range__field">
          <label className="ui-range__field-label" htmlFor={maxId}>
            {maxLabel}
          </label>
          <input
            id={maxId}
            type="number"
            className="ui-range__input"
            step={step}
            value={value.max ?? ''}
            disabled={disabled}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            onChange={(event) => onChange({ ...value, max: parseValue(event.target.value) })}
          />
        </div>
      </div>
      {error ? (
        <p className="ui-field__error" id={errorId}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
