import { missingParams } from '@exo/shared';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';

import { hideHelp, showHelpAt } from '../../../help/api';
import { ru } from '../../../i18n/ru';
import type { PlanetDetail } from '../../../workers/protocol';

/**
 * Знак вопроса и подпись заглушки (задача 27; п. 9.2; U38).
 *
 * Элементы — CSS2DObject поверх 3D-сцены. Подпись доступна с клавиатуры
 * (Tab) и при наведении/фокусе показывает `stub.missing` со списком
 * недостающих параметров. Для звезды список содержит только параметры
 * звезды.
 */

/** Тип заглушки. */
export type StubKind = 'star' | 'planet';

/** Настройки подписи. */
export interface StubLabelOptions {
  /** Деталь планеты. */
  detail: PlanetDetail;
  /** Заглушка звезды или планеты. */
  kind: StubKind;
  /** Радиус объекта в единицах сцены. */
  radius: number;
}

/** Живая подпись заглушки. */
export interface StubLabelHandle {
  /** CSS2DObject для добавления в дерево сцены. */
  object: CSS2DObject;
  /** Удаляет DOM-элементы. */
  dispose(): void;
}

/**
 * Создаёт знак вопроса и подпись.
 *
 * @param options Деталь, тип заглушки и радиус.
 */
export function createStubLabel(options: StubLabelOptions): StubLabelHandle {
  const element = document.createElement('div');
  const glyph = document.createElement('span');
  const caption = document.createElement('div');

  element.className = 'stub-label';
  glyph.className = 'stub-glyph';
  glyph.setAttribute('aria-hidden', 'true');
  glyph.textContent = '?';
  glyph.style.fontSize = `clamp(36px, ${Math.max(36, options.radius * 1.2)}px, 160px)`;

  caption.className = 'stub-caption';
  caption.setAttribute('role', 'note');
  caption.setAttribute('tabindex', '0');
  caption.dataset['helpKey'] = 'stub.missing';
  caption.style.pointerEvents = 'auto';
  caption.textContent = ru['stub.caption'];

  const scope = options.kind === 'star' ? 'star' : 'all';
  const missing = (): string[] => missingParams(options.detail, scope).map((item) => item.label);

  const show = (): void => {
    const rect = caption.getBoundingClientRect();

    showHelpAt({
      key: 'stub.missing',
      ctx: { missing: missing() },
      x: rect.left + rect.width / 2,
      y: rect.top,
    });
  };

  const hide = (): void => hideHelp();

  caption.addEventListener('pointerenter', show);
  caption.addEventListener('pointerleave', hide);
  caption.addEventListener('focus', show);
  caption.addEventListener('blur', hide);

  element.append(glyph, caption);

  const object = new CSS2DObject(element);

  object.name = options.kind === 'star' ? 'stub-label-star' : 'stub-label-planet';
  object.position.set(0, options.radius * 1.6, 0);

  let disposed = false;

  return {
    object,
    dispose(): void {
      if (disposed) return;

      disposed = true;
      caption.removeEventListener('pointerenter', show);
      caption.removeEventListener('pointerleave', hide);
      caption.removeEventListener('focus', show);
      caption.removeEventListener('blur', hide);
      object.removeFromParent();
      element.remove();
    },
  };
}
