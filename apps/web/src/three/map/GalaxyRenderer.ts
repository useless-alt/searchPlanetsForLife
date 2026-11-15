import { RendererHost } from '../host/RendererHost';
import {
  GalaxyScene,
  type CameraState,
  type GalaxyRenderer,
  type GalaxySceneOptions,
} from './GalaxyScene';
import type { GalaxyData } from './buildGalaxy';

/**
 * Совместимый фасад карты Галактики (задачи 21–22; п. 6, 10.8; U40, U44).
 *
 * Вся логика сцены живёт в `GalaxyScene`; этот модуль оставлен для тестов и
 * внешнего кода задачи 21. `createGalaxyRenderer` создаёт собственный
 * `RendererHost` — в приложении общий хост и обе сцены связывает
 * `ViewportView`.
 */

export * from './GalaxyScene';

/** Параметры создания отдельного рендерера карты (совместимость). */
export interface GalaxyRendererOptions extends GalaxySceneOptions {
  /** Контейнер холста. */
  container: HTMLElement;
}

/** Создаёт карту с собственным хостом. */
export function createGalaxyRenderer(options: GalaxyRendererOptions): GalaxyRenderer {
  const host = new RendererHost(options.container, { labelClassName: 'map-labels' });
  const scene = new GalaxyScene({
    data: options.data,
    reducedMotion: options.reducedMotion,
  });

  host.setScene(scene);

  return {
    setData(data: GalaxyData): void {
      scene.setData(data);
    },
    setLeaders(planetIds: readonly string[]): void {
      scene.setLeaders(planetIds);
    },
    setSearchMatches(planetIds: readonly string[]): void {
      scene.setSearchMatches(planetIds);
    },
    setSelection(systemIndex: number | null): void {
      scene.setSelection(systemIndex);
    },
    setLabels(labels): void {
      scene.setLabels(labels);
    },
    resetCamera(): void {
      scene.resetCamera();
    },
    focus(position): void {
      scene.focus(position);
    },
    flyToSystem(position): void {
      scene.flyToSystem(position);
    },
    onArrive(callback): () => void {
      return scene.onArrive(callback);
    },
    getSystemPosition(planetId): ReturnType<GalaxyScene['getSystemPosition']> {
      return scene.getSystemPosition(planetId);
    },
    getCameraState(): CameraState {
      return scene.getCameraState();
    },
    setCameraState(state, restoreOptions): void {
      scene.setCameraState(state, restoreOptions);
    },
    requestRender(): void {
      scene.requestRender();
    },
    dispose(): void {
      host.dispose();
    },
  };
}
