import type { ReactNode } from 'react';

import { Button } from './Button';
import { Icon } from './Icon';

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

/** Значок тона: информация или предупреждение (ошибка тоже несёт треугольник). */
function ToneIcon({ tone }: { tone: BannerTone }) {
  return <Icon name={tone === 'info' ? 'info' : 'warning'} size={20} className="ui-banner__icon" />;
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
