import { useEffect, useSyncExternalStore } from 'react';

import { ru } from '../../i18n/ru';
import { Button } from './Button';

/**
 * Временное уведомление (задача 20; 13.1).
 *
 * Очередь живёт вне React: уведомление может появиться до первой отрисовки
 * (например, «Планета из ссылки не найдена» при восстановлении состояния).
 * Контейнер объявляет очередь как `aria-live="polite"`, каждое уведомление
 * закрывается само через 3 секунды.
 */

/** Одно уведомление. */
export interface ToastItem {
  /** Стабильный идентификатор для закрытия. */
  id: number;
  /** Текст уведомления. */
  text: string;
}

/** Сколько уведомление остаётся на экране [мс]. */
export const TOAST_DURATION_MS = 3000;

let items: readonly ToastItem[] = [];
let nextId = 0;
const listeners = new Set<() => void>();

/** Сообщает подписчикам об изменении очереди. */
function emit(): void {
  for (const listener of listeners) listener();
}

/** Подписка React на очередь. */
function subscribe(listener: () => void): () => void {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

/** Текущий снимок очереди; ссылка меняется только при изменении. */
function getSnapshot(): readonly ToastItem[] {
  return items;
}

/** Показывает уведомление. */
export function showToast(text: string): void {
  nextId += 1;
  items = [...items, { id: nextId, text }];
  emit();
}

/** Закрывает уведомление по идентификатору. */
export function dismissToast(id: number): void {
  const next = items.filter((item) => item.id !== id);

  if (next.length === items.length) return;

  items = next;
  emit();
}

/** Очищает очередь; используется в тестах между сценариями. */
export function resetToasts(): void {
  items = [];
  nextId = 0;
  emit();
}

/** Одно уведомление с автоматическим закрытием. */
function Toast({ item }: { item: ToastItem }) {
  useEffect(() => {
    const timer = setTimeout(() => dismissToast(item.id), TOAST_DURATION_MS);

    return () => clearTimeout(timer);
  }, [item.id]);

  return (
    <div className="ui-toast" role="status">
      <p className="ui-toast__text">{item.text}</p>
      <Button
        variant="icon"
        className="ui-toast__close"
        onClick={() => dismissToast(item.id)}
        aria-label={ru['ui.close']}
      >
        <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
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
  );
}

/** Контейнер очереди уведомлений. */
export function ToastHost() {
  const queue = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  // Контейнер живёт постоянно: живой регион, добавленный в DOM вместе
  // с текстом, некоторые экранные дикторы не объявляют.
  return (
    <div className="ui-toasts" aria-live="polite" aria-atomic="false">
      {queue.map((item) => (
        <Toast key={item.id} item={item} />
      ))}
    </div>
  );
}
