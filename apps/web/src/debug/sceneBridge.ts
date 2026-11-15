/**
 * Мост между приложением и отладочным доступом e2e (задача 31).
 *
 * `SystemController` и `ViewportView` регистрируют здесь текущие объекты
 * сцены, а `exoDebug.ts` читает их через `window.__exo`. Мост ничего не
 * меняет в поведении приложения: это обычные ссылки на уже созданные
 * объекты, которые очищаются при освобождении вида.
 */

import type { RendererHost } from '../three/host/RendererHost';
import type { SystemScene } from '../three/system/SystemScene';

/** Единственный WebGL-хост приложения. */
let currentHost: RendererHost | null = null;

/** Текущая построенная сцена системы. */
let currentSystemScene: SystemScene | null = null;

/** Запоминает хост (или очищает ссылку при освобождении). */
export function setDebugHost(host: RendererHost | null): void {
  currentHost = host;
}

/** Текущий хост; null — 3D-вид ещё не создан. */
export function getDebugHost(): RendererHost | null {
  return currentHost;
}

/** Запоминает сцену системы (или очищает ссылку). */
export function setDebugSystemScene(scene: SystemScene | null): void {
  currentSystemScene = scene;
}

/** Текущая сцена системы; null — открыта карта или сцена освобождена. */
export function getDebugSystemScene(): SystemScene | null {
  return currentSystemScene;
}
