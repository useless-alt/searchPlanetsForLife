import type { SpectralClass } from '@exo/shared';
import type { KeyboardEvent } from 'react';

import { ru } from '../../i18n/ru';
import { Button } from '../ui';

/**
 * Выбор спектральных классов звезды (задача 15; п. 13.3, U9).
 *
 * Ряд кнопок M K G F A B O, множественный выбор через `aria-pressed`.
 * Пустой набор означает «без ограничения».
 */

/** Порядок кнопок из ТЗ. */
export const SPECTRAL_CLASS_ORDER: SpectralClass[] = ['M', 'K', 'G', 'F', 'A', 'B', 'O'];

/** Пропсы выбора классов. */
export interface SpectralClassPickerProps {
  /** Выбранные классы. */
  value: SpectralClass[];
  /** Обработчик изменения набора. */
  onChange: (value: SpectralClass[]) => void;
}

/** Ряд кнопок спектральных классов. */
export function SpectralClassPicker({ value, onChange }: SpectralClassPickerProps) {
  const toggle = (cls: SpectralClass): void => {
    onChange(value.includes(cls) ? value.filter((item) => item !== cls) : [...value, cls]);
  };

  /**
   * Явная активация с клавиатуры.
   *
   * `preventDefault` отменяет собственную активацию браузера, поэтому
   * переключение происходит ровно один раз и Enter, и пробелом.
   */
  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, cls: SpectralClass): void => {
    if (event.key !== 'Enter' && event.key !== ' ') return;

    event.preventDefault();
    if (event.repeat) return;

    toggle(cls);
  };

  return (
    <div
      className="filters__classes"
      role="group"
      aria-label={ru['filters.spectralClass']}
      data-help-key="filters.spectralClass"
    >
      {SPECTRAL_CLASS_ORDER.map((cls) => {
        const pressed = value.includes(cls);

        return (
          <Button
            key={cls}
            variant={pressed ? 'primary' : 'secondary'}
            size="sm"
            aria-pressed={pressed}
            onClick={() => toggle(cls)}
            onKeyDown={(event) => handleKeyDown(event, cls)}
          >
            {cls}
          </Button>
        );
      })}
    </div>
  );
}
