import type { ReactNode } from 'react';

import { Button } from './Button';

/**
 * Баннер (задача 12a; п. 8.3).
 *
 * Три тона: предупреждение, ошибка, информация. Ошибка объявляется
 * немедленно (`role="alert"`), остальные — как статус (`role="status"`).
 */

/** Тон баннера. */
export type BannerTone = 'info' | 'warning' | 'error';

/** Пропсы баннера. */
export interface BannerProps {
  /** Тон баннера. */
  tone: BannerTone;
  /** Заголовок баннера. */
  title?: string;
  /** Текст баннера. */
  children?: ReactNode;
  /** Действия под текстом. */
  actions?: ReactNode;
  /** Обработчик закрытия (кнопка появляется, если он задан). */
  onDismiss?: () => void;
  /** Подпись кнопки закрытия. */
  dismissLabel?: string;
  /** Дополнительный класс. */
  className?: string;
}

/** Значок тона: информация, предупреждение, ошибка. */
function ToneIcon({ tone }: { tone: BannerTone }) {
  if (tone === 'error') {
    return (
      <svg
        className="ui-banner__icon"
        width="20"
        height="20"
        viewBox="0 0 20 20"
        aria-hidden="true"
        focusable="false"
      >
        <circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path
          d="M10 5.5v5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <circle cx="10" cy="14" r="0.9" fill="currentColor" />
      </svg>
    );
  }

  if (tone === 'warning') {
    return (
      <svg
        className="ui-banner__icon"
        width="20"
        height="20"
        viewBox="0 0 20 20"
        aria-hidden="true"
        focusable="false"
      >
        <path
          d="M10 2.8 18.2 17H1.8L10 2.8Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <path
          d="M10 8v4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <circle cx="10" cy="14.6" r="0.9" fill="currentColor" />
      </svg>
    );
  }

  return (
    <svg
      className="ui-banner__icon"
      width="20"
      height="20"
      viewBox="0 0 20 20"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M10 9v5.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <circle cx="10" cy="6.2" r="0.9" fill="currentColor" />
    </svg>
  );
}

/** Баннер с предупреждением, ошибкой или информацией. */
export function Banner({
  tone,
  title,
  children,
  actions,
  onDismiss,
  dismissLabel = 'Закрыть',
  className,
}: BannerProps) {
  const classes = ['ui-banner', `ui-banner--${tone}`, className].filter(Boolean).join(' ');

  return (
    <div className={classes} role={tone === 'error' ? 'alert' : 'status'}>
      <ToneIcon tone={tone} />
      <div className="ui-banner__body">
        {title ? <p className="ui-banner__title">{title}</p> : null}
        {children ? <p className="ui-banner__text">{children}</p> : null}
        {actions || onDismiss ? (
          <div className="ui-banner__actions">
            {actions}
            {onDismiss ? (
              <Button variant="ghost" size="sm" onClick={onDismiss} aria-label={dismissLabel}>
                {dismissLabel}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
