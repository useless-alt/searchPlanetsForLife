import { useEffect, useId, useRef } from 'react';
import type { ReactNode } from 'react';

import { Button } from './Button';

/**
 * Выдвижная панель (задача 12a; п. 4.1).
 *
 * Не модальная панель: «Параметры модели», «Фильтры» и карточка планеты.
 * Закрывается по Esc и по кнопке в шапке, фокус возвращается на элемент,
 * который панель открыл.
 */

/** Сторона, с которой выезжает панель. */
export type PanelSide = 'right' | 'left';

/** Пропсы выдвижной панели. */
export interface PanelProps {
  /** Открыта ли панель. */
  open: boolean;
  /** Заголовок панели. */
  title: string;
  /** Обработчик закрытия. */
  onClose: () => void;
  /** Содержимое панели. */
  children?: ReactNode;
  /** Строка кнопок внизу панели. */
  footer?: ReactNode;
  /** Сторона выезда. */
  side?: PanelSide;
  /** Подпись кнопки закрытия. */
  closeLabel?: string;
}

/** Выдвижная панель. */
export function Panel({
  open,
  title,
  onClose,
  children,
  footer,
  side = 'right',
  closeLabel = 'Закрыть панель',
}: PanelProps) {
  const titleId = useId();
  const panel = useRef<HTMLElement>(null);
  const trigger = useRef<Element | null>(null);

  useEffect(() => {
    if (!open) return undefined;

    trigger.current = document.activeElement;

    const first = panel.current?.querySelector<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );

    (first ?? panel.current)?.focus();

    return () => {
      const previous = trigger.current;

      if (previous instanceof HTMLElement) previous.focus();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;

      event.preventDefault();
      onClose();
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose, open]);

  if (!open) return null;

  const classes = ['ui-panel', side === 'left' ? 'ui-panel--left' : null].filter(Boolean).join(' ');

  return (
    <aside ref={panel} className={classes} aria-labelledby={titleId} tabIndex={-1}>
      <div className="ui-panel__head">
        <h2 className="ui-panel__title" id={titleId}>
          {title}
        </h2>
        <Button variant="icon" onClick={onClose} aria-label={closeLabel}>
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
            <path
              d="M4 4l8 8M12 4l-8 8"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </Button>
      </div>
      <div className="ui-panel__body">{children}</div>
      {footer ? <div className="ui-panel__foot">{footer}</div> : null}
    </aside>
  );
}
