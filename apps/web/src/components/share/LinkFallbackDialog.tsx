import { useEffect, useRef } from 'react';

import { ru } from '../../i18n/ru';
import { Button, Modal } from '../ui';

/**
 * Запасной диалог при неудачном копировании ссылки (задача 20; 13.1).
 *
 * Показывается только если не сработали и Clipboard API, и `execCommand`.
 * Текст уже выделен: пользователю остаётся нажать Ctrl+C.
 */

/** Пропсы диалога. */
export interface LinkFallbackDialogProps {
  /** Открыт ли диалог. */
  open: boolean;
  /** Ссылка на текущее состояние. */
  link: string;
  /** Закрытие диалога. */
  onClose: () => void;
}

/** Диалог с выделенной ссылкой. */
export function LinkFallbackDialog({ open, link, onClose }: LinkFallbackDialogProps) {
  const input = useRef<HTMLInputElement>(null);

  // После открытия диалога текст сразу выделен.
  useEffect(() => {
    if (!open) return;

    input.current?.focus();
    input.current?.select();
  }, [open, link]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={ru['share.fallback.title']}
      footer={
        <Button variant="secondary" size="sm" onClick={onClose}>
          {ru['share.fallback.close']}
        </Button>
      }
    >
      <div className="share-fallback">
        <p className="share-fallback__text">{ru['share.fallback.description']}</p>
        <label className="ui-field__label" htmlFor="share-fallback-link">
          {ru['share.fallback.label']}
        </label>
        <input
          ref={input}
          id="share-fallback-link"
          className="ui-field__input share-fallback__input"
          type="text"
          readOnly
          value={link}
          onFocus={(event) => event.currentTarget.select()}
        />
      </div>
    </Modal>
  );
}
