import type { Vec3 } from '@exo/shared';

import type { CameraState, GalaxyRenderer } from './GalaxyRenderer';

/**
 * Модульный контроллер камеры 3D-карты (задача 21; п. 10.8).
 *
 * Синглтон не хранит React-состояния: команды из таблицы, карточки и кнопок
 * приходят сюда, а контроллер передаёт их активному `GalaxyRenderer`.
 * Регистрация рендерера выполняется при монтировании холста (задача 22).
 */

/** Команды камеры, доступные вне React-дерева. */
export interface GalaxyController {
  /** Возвращает камеру к обзору (10.8.8). */
  resetCamera(): void;
  /** Фокусируется на системе (10.8.5). */
  focus(position: Vec3): void;
  /** Плавно подлетает к системе (10.8.6). */
  flyToSystem(position: Vec3): void;
  /** Подписка на завершение перелёта; возвращает функцию отписки. */
  onArrive(callback: () => void): () => void;
  /**
   * Публикует событие завершения перелёта для подписчиков (задача 22).
   *
   * Вызывает `GalaxyView`, когда рендерер сообщает о прибытии.
   */
  notifyArrive(): void;
  /** Позиция системы по идентификатору планеты; null — координат нет. */
  getSystemPosition(planetId: string): Vec3 | null;
  /** Состояние камеры; null — рендерер ещё не создан. */
  getCameraState(): CameraState | null;
  /** Восстанавливает состояние камеры. */
  setCameraState(state: CameraState): void;
}

/** Активный рендерер; null — карта не смонтирована. */
let activeRenderer: GalaxyRenderer | null = null;

/** Подписчики на завершение перелёта; живут дольше одного рендерера. */
const arriveCallbacks = new Set<() => void>();

/** Единственный экземпляр контроллера. */
const controller: GalaxyController = {
  resetCamera(): void {
    activeRenderer?.resetCamera();
  },

  focus(position: Vec3): void {
    activeRenderer?.focus(position);
  },

  flyToSystem(position: Vec3): void {
    activeRenderer?.flyToSystem(position);
  },

  onArrive(callback: () => void): () => void {
    arriveCallbacks.add(callback);

    return () => {
      arriveCallbacks.delete(callback);
    };
  },

  notifyArrive(): void {
    for (const callback of [...arriveCallbacks]) callback();
  },

  getSystemPosition(planetId: string): Vec3 | null {
    return activeRenderer?.getSystemPosition(planetId) ?? null;
  },

  getCameraState(): CameraState | null {
    return activeRenderer?.getCameraState() ?? null;
  },

  setCameraState(state: CameraState): void {
    activeRenderer?.setCameraState(state);
  },
};

/**
 * Возвращает модульный контроллер камеры.
 *
 * Один и тот же объект используется всеми компонентами и вне React.
 */
export function getController(): GalaxyController {
  return controller;
}

/**
 * Назначает активный рендерер; `null` снимает регистрацию при размонтировании.
 *
 * @param renderer Реализация `GalaxyRenderer` или null.
 */
export function registerGalaxyRenderer(renderer: GalaxyRenderer | null): void {
  activeRenderer = renderer;
}
