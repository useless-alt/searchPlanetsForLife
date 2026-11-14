import { useId } from 'react';

/**
 * Ползунок (задача 12a).
 *
 * Настоящий `input[type=range]`: стрелки и ползунок работают с клавиатуры,
 * текущее значение показано рядом с подписью. Для порога Q_data диапазон
 * 75–100 % с шагом 1 % задаётся пропсами (13.1, U10).
 */

/** Пропсы ползунка. */
export interface SliderProps {
  /** Подпись ползунка. */
  label: string;
  /** Текущее значение. */
  value: number;
  /** Нижняя граница. */
  min: number;
  /** Верхняя граница. */
  max: number;
  /** Шаг. */
  step?: number;
  /** Обработчик изменения значения. */
  onChange: (value: number) => void;
  /** Форматирование значения для показа. */
  format?: (value: number) => string;
  /** Пояснение под ползунком. */
  hint?: string;
  /** Ползунок недоступен. */
  disabled?: boolean;
  /** Идентификатор поля (генерируется, если не задан). */
  id?: string;
}

/** Ползунок с числовым значением. */
export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  format,
  hint,
  disabled = false,
  id,
}: SliderProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const hintId = `${inputId}-hint`;
  const text = format ? format(value) : String(value);

  return (
    <div className="ui-slider">
      <div className="ui-slider__head">
        <label className="ui-slider__label" htmlFor={inputId}>
          {label}
        </label>
        <output className="ui-slider__value" htmlFor={inputId}>
          {text}
        </output>
      </div>
      <input
        id={inputId}
        type="range"
        className="ui-slider__input"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        aria-valuetext={text}
        aria-describedby={hint ? hintId : undefined}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      {hint ? (
        <p className="ui-slider__hint" id={hintId}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}
