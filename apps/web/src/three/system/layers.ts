import type * as THREE from 'three';

import type { SystemContext, SystemToggles } from './runtime';

/**
 * Реестр слоёв 3D-сцены системы (задача 22; п. 9.1, 11.3; U14).
 *
 * Слой — независимая часть сцены (орбита, зона обитаемости), которую можно
 * скрыть переключателем, не освобождая ресурсы. Задачи 23 и 24 регистрируют
 * свои слои через `registerSystemLayer`; `SystemScene` строит их и публикует
 * статус доступности.
 */

/** Статус доступности слоя по данным. */
export type SystemLayerStatus = 'available' | 'unavailable';

/** Статус слоя для панели управления. */
export interface SystemLayerStatusInfo {
  /** Слой доступен по данным. */
  available: boolean;
  /** Причина недоступности; null — слой доступен. */
  reason: string | null;
}

/** Карта статусов: идентификатор слоя → доступность и причина. */
export type SystemLayerStatusMap = Readonly<Record<string, SystemLayerStatusInfo>>;

/** Определение слоя. */
export interface SystemLayerDefinition {
  /** Уникальный идентификатор слоя. */
  id: string;
  /** Переключатель, управляющий видимостью; без него слой виден всегда. */
  toggleKey?: keyof SystemToggles;
  /** Доступен ли слой для текущей планеты. */
  status(ctx: SystemContext): SystemLayerStatus;
  /** Причина недоступности для подсказки (задача 22; 10.9). */
  reason?(ctx: SystemContext): string | null;
  /** Создаёт объект слоя; вызывается только для доступного слоя. */
  build(ctx: SystemContext): THREE.Object3D;
  /** Обновляет слой на каждом кадре. */
  update?(ctx: SystemContext, dtSec: number): void;
  /** Освобождает внутренние ресурсы, не входящие в дерево объекта. */
  dispose?(): void;
}

/** Реестр слоёв в порядке регистрации. */
const layerRegistry = new Map<string, SystemLayerDefinition>();

/** Подписчики на изменение реестра (панель управления сценой). */
const registryListeners = new Set<() => void>();

/** Сообщает подписчикам об изменении реестра. */
function emitRegistryChange(): void {
  for (const listener of [...registryListeners]) listener();
}

/**
 * Подписка на изменение реестра слоёв.
 *
 * @param listener Обработчик; возвращённая функция снимает подписку.
 */
export function subscribeSystemLayers(listener: () => void): () => void {
  registryListeners.add(listener);

  return () => {
    registryListeners.delete(listener);
  };
}

/**
 * Регистрирует слой сцены.
 *
 * Повторная регистрация с тем же `id` заменяет определение; возвращённая
 * функция восстанавливает предыдущее.
 *
 * @param layer Определение слоя.
 * @returns Функция отмены регистрации.
 */
export function registerSystemLayer(layer: SystemLayerDefinition): () => void {
  const previous = layerRegistry.get(layer.id);

  layerRegistry.set(layer.id, layer);
  emitRegistryChange();

  return () => {
    if (layerRegistry.get(layer.id) !== layer) return;

    if (previous === undefined) {
      layerRegistry.delete(layer.id);
    } else {
      layerRegistry.set(layer.id, previous);
    }

    emitRegistryChange();
  };
}

/** Слои в порядке регистрации. */
export function listSystemLayers(): readonly SystemLayerDefinition[] {
  return [...layerRegistry.values()];
}

/** Очищает реестр слоёв (для тестов). */
export function resetSystemLayers(): void {
  layerRegistry.clear();
  emitRegistryChange();
}

/**
 * Определяет видимость слоя по переключателю.
 *
 * @param layer Слой.
 * @param toggles Текущие переключатели.
 */
export function layerVisible(layer: SystemLayerDefinition, toggles: SystemToggles): boolean {
  if (layer.toggleKey === undefined) return true;

  return toggles[layer.toggleKey];
}
