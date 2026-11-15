import { useId } from 'react';

import { ru } from '../../i18n/ru';
import {
  filterErrorMessage,
  type FilterErrorCode,
  type RangeDraft,
  type RangeErrors,
} from './filterValidation';

/**
 * Пара полей «Мин — Макс» панели фильтров (задача 15; п. 13.3).
 *
 * Значения остаются текстом до нажатия «Применить фильтры»: так запятая
 * и недопустимая запись проверяются до попадания в `FilterState`.
 * Сообщение об ошибке выводится под своим полем.
 */

/** Пропсы пары полей. */
export interface RangeFieldProps {
  /** Подпись группы. */
  label: string;
  /** Значения полей. */
  value: RangeDraft;
  /** Обработчик изменения. */
  onChange: (value: RangeDraft) => void;
  /** Ошибки полей. */
  errors: RangeErrors;
  /** Подсказка нижнего поля. */
  minPlaceholder?: string;
  /** Подсказка верхнего поля. */
  maxPlaceholder?: string;
  /** Атрибут словаря подсказок (задача 17). */
  helpKey?: string;
}

/** Текст ошибки или null. */
function errorText(code: FilterErrorCode | null): string | null {
  return code === null ? null : filterErrorMessage(code);
}

/** Поля «Мин» и «Макс» с проверкой. */
export function RangeField({
  label,
  value,
  onChange,
  errors,
  minPlaceholder,
  maxPlaceholder,
  helpKey,
}: RangeFieldProps) {
  const generatedId = useId();
  const minId = `${generatedId}-min`;
  const maxId = `${generatedId}-max`;
  const minErrorId = `${generatedId}-min-error`;
  const maxErrorId = `${generatedId}-max-error`;
  const rangeErrorId = `${generatedId}-range-error`;

  const minError = errorText(errors.min);
  const maxError = errorText(errors.max);
  const rangeError = errorText(errors.range);

  return (
    <div className="ui-range" data-help-key={helpKey}>
      <div className="ui-range__head">
        <span className="ui-range__label" id={`${generatedId}-label`}>
          {label}
        </span>
      </div>

      <div className="ui-range__fields">
        <div className="ui-range__field">
          <label className="ui-range__field-label" htmlFor={minId}>
            {ru['filters.min']}
          </label>
          <input
            id={minId}
            type="text"
            className="ui-range__input"
            inputMode="decimal"
            autoComplete="off"
            aria-label={`${label}, ${ru['filters.min']}`}
            placeholder={minPlaceholder}
            value={value.min}
            aria-invalid={minError !== null || rangeError !== null ? true : undefined}
            aria-describedby={
              [minError ? minErrorId : null, rangeError ? rangeErrorId : null]
                .filter(Boolean)
                .join(' ') || undefined
            }
            onChange={(event) => onChange({ ...value, min: event.target.value })}
          />
          {minError ? (
            <p className="ui-field__error" id={minErrorId}>
              {minError}
            </p>
          ) : null}
        </div>

        <div className="ui-range__field">
          <label className="ui-range__field-label" htmlFor={maxId}>
            {ru['filters.max']}
          </label>
          <input
            id={maxId}
            type="text"
            className="ui-range__input"
            inputMode="decimal"
            autoComplete="off"
            aria-label={`${label}, ${ru['filters.max']}`}
            placeholder={maxPlaceholder}
            value={value.max}
            aria-invalid={maxError !== null || rangeError !== null ? true : undefined}
            aria-describedby={
              [maxError ? maxErrorId : null, rangeError ? rangeErrorId : null]
                .filter(Boolean)
                .join(' ') || undefined
            }
            onChange={(event) => onChange({ ...value, max: event.target.value })}
          />
          {maxError ? (
            <p className="ui-field__error" id={maxErrorId}>
              {maxError}
            </p>
          ) : null}
        </div>
      </div>

      {rangeError ? (
        <p className="ui-field__error" id={rangeErrorId} role="alert">
          {rangeError}
        </p>
      ) : null}
    </div>
  );
}
