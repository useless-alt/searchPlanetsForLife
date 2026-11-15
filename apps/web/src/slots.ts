import {
  createElement,
  Fragment,
  useSyncExternalStore,
  type ComponentType,
  type ReactNode,
} from 'react';

/**
 * Реестр слотов интерфейса (задача 19).
 *
 * UI-задачи не должны зависеть друг от друга по порядку: место в разметке
 * объявляется слотом, а содержимое подключает та задача, которая его
 * реализует. Пока слот не зарегистрирован, показывается запасной текст или
 * ничего.
 *
 * Имена слотов фиксированы:
 * - `viewport` — 3D-холст (задача 21);
 * - `reconstruction` — панель «Данные реконструкции» (задача 28);
 * - `refreshPlanet` — кнопка «Обновить данные планеты» (задача 28).
 */

/** Имя слота. */
export type SlotName = 'viewport' | 'reconstruction' | 'refreshPlanet';

/** Компонент слота; собственных пропсов у него нет — данные берутся из хранилища. */
export type SlotComponent = ComponentType;

/** Зарегистрированные компоненты. */
const registry = new Map<SlotName, SlotComponent>();

/** Подписчики на изменение реестра (для перерисовки `<Slot>`). */
const listeners = new Set<() => void>();

/** Версия реестра: `useSyncExternalStore` сравнивает её. */
let version = 0;

/** Сообщает подписчикам об изменении реестра. */
function emit(): void {
  version += 1;

  for (const listener of listeners) listener();
}

/**
 * Регистрирует компонент слота.
 *
 * Повторная регистрация заменяет прежний компонент, `null` освобождает слот.
 */
export function registerSlot(name: SlotName, component: SlotComponent | null): void {
  if (component === null) registry.delete(name);
  else registry.set(name, component);

  emit();
}

/** Компонент слота; `null` — слот свободен. */
export function getSlot(name: SlotName): SlotComponent | null {
  return registry.get(name) ?? null;
}

/** Занят ли слот. */
export function hasSlot(name: SlotName): boolean {
  return registry.has(name);
}

/** Подписка на изменение реестра; возвращает функцию отписки. */
export function subscribeSlots(listener: () => void): () => void {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

/** Текущая версия реестра. */
export function getSlotsVersion(): number {
  return version;
}

/** Освобождает все слоты (для тестов и повторной инициализации). */
export function resetSlots(): void {
  registry.clear();
  emit();
}

/** Пропсы слота. */
export interface SlotProps {
  /** Имя слота. */
  name: SlotName;
  /** Запасное содержимое, пока слот свободен. */
  fallback?: ReactNode;
  /** Запасное содержимое в разметке: `<Slot name="x">текст</Slot>`. */
  children?: ReactNode;
}

/**
 * Место подключения слота.
 *
 * Перерисовывается при регистрации компонента, поэтому поздняя регистрация
 * (после монтирования) тоже видна без перезагрузки страницы.
 */
export function Slot({ name, fallback = null, children = null }: SlotProps) {
  useSyncExternalStore(subscribeSlots, getSlotsVersion, getSlotsVersion);

  const Component = getSlot(name);

  return Component === null
    ? createElement(Fragment, null, fallback ?? children)
    : createElement(Component);
}
