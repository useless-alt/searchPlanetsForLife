import type * as THREE from 'three';

import { createPlanetPlaceholder, createStarPlaceholder } from './placeholders';
import type { SystemContext } from './runtime';

/**
 * Фабрики визуализации звезды и планеты (задача 22; п. 9.1, 9.2).
 *
 * До задач 25–27 сцена показывает заглушки. Задача 25 регистрирует
 * «настоящие» фабрики; `SystemScene` при построении выбирает последнюю
 * зарегистрированную, а при её отсутствии — заглушку.
 */

/** Вид объекта сцены. */
export type VisualKind = 'star' | 'planet';

/** Живой визуальный объект. */
export interface VisualInstance {
  /** Корневой объект, который добавляется в сцену. */
  object: THREE.Object3D;
  /** Обновление на кадре: вращение, атмосфера и т. п. */
  update?(dtSec: number, ctx: SystemContext): void;
  /** Освобождение ресурсов объекта. */
  dispose(): void;
}

/** Фабрика визуального объекта. */
export type VisualFactory = (ctx: SystemContext) => VisualInstance;

/** Зарегистрированные фабрики. */
const visualFactories = new Map<VisualKind, VisualFactory>();

/**
 * Регистрирует фабрику визуализации.
 *
 * @param kind Звезда или планета.
 * @param factory Фабрика, получающая контекст сцены.
 * @returns Функция отмены регистрации.
 */
export function registerVisualFactory(kind: VisualKind, factory: VisualFactory): () => void {
  const previous = visualFactories.get(kind);

  visualFactories.set(kind, factory);

  return () => {
    if (visualFactories.get(kind) !== factory) return;

    if (previous === undefined) {
      visualFactories.delete(kind);
    } else {
      visualFactories.set(kind, previous);
    }
  };
}

/**
 * Создаёт визуальный объект: зарегистрированную фабрику или заглушку.
 *
 * @param kind Звезда или планета.
 * @param ctx Контекст сцены.
 */
export function createVisual(kind: VisualKind, ctx: SystemContext): VisualInstance {
  const factory = visualFactories.get(kind);

  if (factory !== undefined) return factory(ctx);

  return kind === 'star' ? createStarPlaceholder(ctx) : createPlanetPlaceholder(ctx);
}

/** Убирает все фабрики (для тестов). */
export function resetVisualFactories(): void {
  visualFactories.clear();
}
