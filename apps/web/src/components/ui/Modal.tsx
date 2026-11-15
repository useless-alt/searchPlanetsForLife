import { useCallback, useEffect, useId, useRef } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';

import { Button } from './Button';
import { Icon } from './Icon';

/**
 * Модальное окно (задача 12a).
 *
 * Закрывается по Esc и по клику вне окна. Фокус не покидает окно (ловушка
 * фокуса) и возвращается на элемент, который окно открыл (system.md,
 * «Фокус виден сразу»).
 */

/** Пропсы модального окна. */
export interface ModalProps {
  /** Открыто ли окно. */
  open: boolean;
  /** Обработчик закрытия. */
  onClose: () => void;
  /** Заголовок окна. */
  title: string;
  /** Содержимое окна. */
  children?: ReactNode;
  /** Строка кнопок внизу окна. */
  footer?: ReactNode;
  /** Подпись кнопки закрытия. */
  closeLabel?: string;
  /** Дополнительный класс окна (например, широкое окно для таблицы). */
  className?: string;
}

/** Элементы, получающие фокус внутри окна. */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Модальное окно. */
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  closeLabel = 'Закрыть',
  className,
}: ModalProps) {
  const titleId = useId();
  const dialog = useRef<HTMLDivElement>(null);
  const trigger = useRef<Element | null>(null);

  const classes = ['ui-modal', 'ui-glass', className].filter(Boolean).join(' ');

  const focusable = useCallback((): HTMLElement[] => {
    const root = dialog.current;

    if (root === null) return [];

    return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
      (element) =>
        !element.hasAttribute('hidden') && element.getAttribute('aria-hidden') !== 'true',
    );
  }, []);

  // Запоминаем элемент, открывший окно, и возвращаем на него фокус при закрытии.
  useEffect(() => {
    if (!open) return undefined;

    trigger.current = document.activeElement;

    // Фокус переходит на само окно: так программа экранного доступа
    // объявляет заголовок, а кольцо фокуса не рисуется на кнопке закрытия.
    dialog.current?.focus();

    return () => {
      const previous = trigger.current;

      if (previous instanceof HTMLElement) previous.focus();
    };
  }, [focusable, open]);

  // Esc и ловушка фокуса.
  useEffect(() => {
    if (!open) return undefined;

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== 'Tab') return;

      const elements = focusable();

      if (elements.length === 0) {
        event.preventDefault();
        dialog.current?.focus();
        return;
      }

      const first = elements[0];
      const last = elements[elements.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
        return;
      }

      if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [focusable, onClose, open]);

  if (!open) return null;

  const content = (
    <div
      className="ui-modal__backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialog}
        className={classes}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div className="ui-modal__head">
          <h2 className="ui-modal__title" id={titleId}>
            {title}
          </h2>
          <Button variant="icon" onClick={onClose} aria-label={closeLabel}>
            <Icon name="close" size={16} />
          </Button>
        </div>
        <div className="ui-modal__body">{children}</div>
        {footer ? <div className="ui-modal__foot">{footer}</div> : null}
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
