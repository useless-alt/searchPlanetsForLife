import { Children, cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react';

import { appStore, type AppStore } from '../state/store';
import type { ExtraId } from './registry';
import { useExtra } from './useExtra';

/**
 * Единственный способ скрыть служебные данные (задача 18; п. 11.2).
 *
 * При выключенном режиме дети не рендерятся вовсе — их нет в DOM, поэтому
 * они не попадают ни в порядок обхода с клавиатуры, ни в доступное дерево
 * (это не `display: none`). При включённом режиме к корневому элементу
 * добавляется `data-extra="<id>"`; по этим атрибутам тесты и проверяют
 * состав реестра.
 *
 * `id` обязан быть записью `EXTRA_REGISTRY`: другой способ скрывать
 * служебные данные в коде не используется.
 */

/** Пропсы обёртки. */
export interface ExtraOnlyProps {
  /** Идентификатор записи реестра. */
  id: ExtraId;
  /** Скрываемое содержимое. */
  children: ReactNode;
  /** Хранилище; в тестах подставляется изолированный экземпляр. */
  store?: AppStore;
}

/**
 * Рендерит детей только при включённом режиме и помечает корень.
 *
 * Если ребёнок один и является элементом, атрибут добавляется ему самому
 * (важно для ячеек таблицы: обёртка `<span>` внутри `<tr>` недопустима).
 * Текст и несколько детей оборачиваются в `<span>`.
 */
export function ExtraOnly({ id, children, store = appStore }: ExtraOnlyProps) {
  const showExtraData = useExtra(store);

  if (!showExtraData) return null;

  const items = Children.toArray(children);

  if (items.length === 1 && isValidElement(items[0])) {
    const child = items[0] as ReactElement<{ 'data-extra'?: string }>;

    return cloneElement(child, { 'data-extra': id });
  }

  return <span data-extra={id}>{children}</span>;
}
