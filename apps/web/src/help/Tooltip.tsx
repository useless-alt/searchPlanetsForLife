/**
 * Оформление подсказки (задача 17; п. 11.1).
 *
 * Контейнер `role="tooltip"` портируется в `document.body` провайдером.
 * Позиция считается после измерения: до этого подсказка невидима, поэтому
 * нет скачка из левого верхнего угла.
 */

import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';

import { HELP_BLOCK_LABELS } from '../i18n/help.ru';
import { computePosition, type Point } from './position';
import type { HelpContent } from './types';

/** Идентификатор контейнера: на него ссылается `aria-describedby` цели. */
export const HELP_TOOLTIP_ID = 'exo-help-tooltip';

/** Пропсы подсказки. */
export interface TooltipProps {
  /** Готовое содержимое. */
  content: HelpContent;
  /** Цель подсказки; `null` — показ из императивного API. */
  target: HTMLElement | null;
  /** Точка курсора; `null` — фокус с клавиатуры. */
  pointer: Point | null;
}

/** Размер окна для позиционирования. */
function viewportSize(): { width: number; height: number } {
  const width = document.documentElement.clientWidth || window.innerWidth;
  const height = document.documentElement.clientHeight || window.innerHeight;

  return { width, height };
}

/** Контейнер подсказки. */
export function Tooltip({ content, target, pointer }: TooltipProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<Point | null>(null);

  useLayoutEffect(() => {
    const element = ref.current;

    if (element === null) return;

    const tipRect = element.getBoundingClientRect();
    const targetRect = target?.getBoundingClientRect();

    const next = computePosition({
      ...(pointer === null ? {} : { pointer }),
      targetRect:
        targetRect === undefined
          ? { x: 0, y: 0, width: 0, height: 0 }
          : {
              x: targetRect.x,
              y: targetRect.y,
              width: targetRect.width,
              height: targetRect.height,
            },
      tipSize: { width: tipRect.width, height: tipRect.height },
      viewport: viewportSize(),
    });

    setPosition((current) =>
      current !== null && current.x === next.x && current.y === next.y ? current : next,
    );
  }, [content, pointer, target]);

  const style: CSSProperties = {
    position: 'fixed',
    left: position?.x ?? 0,
    top: position?.y ?? 0,
    zIndex: 'var(--z-tooltip)',
    pointerEvents: 'none',
    visibility: position === null ? 'hidden' : 'visible',
  };

  return (
    <div
      ref={ref}
      id={HELP_TOOLTIP_ID}
      role="tooltip"
      className="help-tooltip"
      data-help-tooltip="true"
      style={style}
    >
      <p className="help-tooltip__title">{content.title}</p>

      {content.valueLine === undefined ? null : (
        <p className="help-tooltip__value">{content.valueLine}</p>
      )}

      {content.blocks.map((block) => (
        <div className="help-tooltip__block" key={block.label}>
          <p className="help-tooltip__label">
            {block.label === 'why'
              ? (content.whyLabel ?? HELP_BLOCK_LABELS.why)
              : HELP_BLOCK_LABELS[block.label]}
          </p>
          <p className="help-tooltip__text">{block.text}</p>
        </div>
      ))}
    </div>
  );
}
