import type { ButtonHTMLAttributes, ReactNode } from 'react';

import { Spinner } from './Spinner';

/**
 * Кнопка (задача 12a).
 *
 * Четыре варианта: основная, вторичная, текстовая и иконка. Состояния:
 * недоступна (`disabled`) и занята (`loading`). Кнопка недоступна и во время
 * загрузки, а её подпись остаётся видимой — по ней понятно, что происходит.
 */

/** Вариант кнопки. */
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'icon';

/** Размер кнопки. */
export type ButtonSize = 'md' | 'sm';

/** Пропсы кнопки. */
export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  /** Вариант оформления. */
  variant?: ButtonVariant;
  /** Размер кнопки. */
  size?: ButtonSize;
  /** Кнопка занята: показывается индикатор, нажатие невозможно. */
  loading?: boolean;
  /** Содержимое кнопки (подпись, иконка). */
  children?: ReactNode;
}

/** Кнопка. */
export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  type = 'button',
  className,
  children,
  ...rest
}: ButtonProps) {
  const classes = ['ui-btn', `ui-btn--${variant}`, size === 'sm' ? 'ui-btn--sm' : null, className]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      {...rest}
      type={type}
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
    >
      {loading ? <Spinner size="sm" decorative className="ui-btn__spinner" /> : null}
      {children}
    </button>
  );
}
