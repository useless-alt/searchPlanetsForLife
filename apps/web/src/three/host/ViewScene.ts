import type * as THREE from 'three';

import type { RendererHost } from './RendererHost';

/**
 * Интерфейс сцены, которую обслуживает общий `RendererHost`
 * (задача 22; п. 9.1, U40).
 *
 * Хост владеет единственным WebGL-холстом и CSS2D-слоем, а сцена —
 * своими объектами, камерой и контролами. Переключение видов не создаёт
 * второй контекст и не пересоздаёт холст (U40).
 */

/** Идентификатор вида. */
export type ViewSceneId = 'galaxy' | 'system';

/** Сцена, которую можно подключить к общему хосту. */
export interface ViewScene {
  /** Идентификатор вида. */
  id: ViewSceneId;
  /** Корневая сцена Three.js. */
  scene: THREE.Scene;
  /** Камера вида. */
  camera: THREE.PerspectiveCamera;

  /**
   * Вызывается хостом при подключении вида.
   *
   * Сцена получает доступ к холсту, размерам и `requestRender()`;
   * здесь же создаются контролы, привязанные к холсту.
   */
  activate(host: RendererHost): void;

  /** Вызывается перед отключением вида; контролы перестают реагировать. */
  deactivate(): void;

  /**
   * Шаг анимации.
   *
   * @param dtSec Время с прошлого кадра [с], не больше 0.1 с.
   * @returns true, если нужен перерисованный кадр.
   */
  update(dtSec: number): boolean;

  /**
   * Необязательный обработчик размера холста.
   *
   * @param width Ширина [CSS px].
   * @param height Высота [CSS px].
   * @param pixelRatio Плотность пикселей.
   */
  resize?(width: number, height: number, pixelRatio: number): void;

  /** Освобождает GPU-ресурсы и обработчики вида. */
  dispose(): void;
}
