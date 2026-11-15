import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from 'zustand';

import { ru } from '../../i18n/ru';
import { appStore } from '../../state/store';
import { RendererHost } from '../../three/host/RendererHost';
import type { CameraState, GalaxyRenderer } from '../../three/map/GalaxyRenderer';
import { GalaxyScene } from '../../three/map/GalaxyScene';
import { GalaxyPane, type GalaxyViewProps } from './GalaxyPane';
import { FadeCurtain } from './FadeCurtain';
import { ViewportOverlay } from './ViewportOverlay';
import { SystemController } from '../../three/system/SystemController';
import type { GalaxyData } from '../../three/map/buildGalaxy';

/**
 * Единственный 3D-холст правой панели (задача 22; U40).
 *
 * Владеет общим `RendererHost`, картой `GalaxyScene` и машиной состояний
 * `SystemController`. Вид `galaxy`/`flying` показывает карту, `system` —
 * ту же канву с системой; переключение не пересоздаёт WebGL-контекст.
 *
 * В тестах задачи 21 можно передать `rendererFactory`: тогда компонент
 * работает в режиме совместимости со старым `GalaxyRenderer`.
 */

/** Пропсы вида. */
export type ViewportViewProps = GalaxyViewProps;

/** Системная настройка уменьшенного движения. */
function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/** Обёртка фабрики карты для режима совместимости. */
function browserSupportsWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');

    return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

/** Вид правой панели с картой и сценой системы. */
export function ViewportView({
  store = appStore,
  rendererFactory,
  buildGalaxyFactory,
}: ViewportViewProps) {
  const viewMode = useStore(store, (state) => state.viewMode);
  const scenePlanetId = useStore(store, (state) => state.scenePlanetId);

  const [unplacedCount, setUnplacedCount] = useState(0);
  const [curtain, setCurtain] = useState(false);
  const cleanupRef = useRef<(() => void) | null>(null);
  const curtainTimer = useRef<number | null>(null);
  const previousMode = useRef(viewMode);
  const previousPlanet = useRef(scenePlanetId);

  const reducedMotion = useMemo(prefersReducedMotion, []);
  const legacy = rendererFactory !== undefined;

  /** Современная фабрика: общий хост, карта и контроллер. */
  const modernFactory = useMemo(
    () => (options: { container: HTMLElement; data: GalaxyData; reducedMotion?: boolean }) => {
      if (!browserSupportsWebGL()) throw new Error('WebGL недоступен');

      const host = new RendererHost(options.container, {
        labelClassName: 'map-labels',
        reducedMotion,
      });
      const scene = new GalaxyScene({
        data: options.data,
        reducedMotion: options.reducedMotion ?? reducedMotion,
      });

      host.setScene(scene);

      const controller = new SystemController({ store, host, galaxy: scene });

      controller.start();
      cleanupRef.current = () => {
        controller.dispose();
        host.dispose();
      };

      const adapter: GalaxyRenderer = {
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
        setCameraState(state, optionsRestore): void {
          scene.setCameraState(state, optionsRestore);
        },
        requestRender(): void {
          scene.requestRender();
        },
        dispose(): void {
          // Хост и сцену освобождает ViewportView.
        },
      };

      return adapter;
    },
    [reducedMotion, store],
  );

  // Затемнение при смене планеты внутри системы (300 мс). Контроллер на
  // время загрузки детали переводит вид в `flying`, поэтому проверяем
  // предыдущий режим, а не только текущий.
  useEffect(() => {
    const previous = previousMode.current;
    const planetChanged = previousPlanet.current !== scenePlanetId;

    previousMode.current = viewMode;
    previousPlanet.current = scenePlanetId;

    if (!planetChanged || previous !== 'system') return;

    if (curtainTimer.current !== null) window.clearTimeout(curtainTimer.current);

    setCurtain(true);
    curtainTimer.current = window.setTimeout(
      () => {
        curtainTimer.current = null;
        setCurtain(false);
      },
      reducedMotion ? 0 : 300,
    );
  }, [reducedMotion, scenePlanetId, viewMode]);

  useEffect(
    () => () => {
      cleanupRef.current?.();
      cleanupRef.current = null;

      if (curtainTimer.current !== null) {
        window.clearTimeout(curtainTimer.current);
        curtainTimer.current = null;
      }
    },
    [],
  );

  return (
    <div className="viewport-view" aria-label={ru['scene.viewport']}>
      <GalaxyPane
        store={store}
        rendererFactory={legacy ? rendererFactory : modernFactory}
        buildGalaxyFactory={buildGalaxyFactory}
        handleFlyRequest={legacy}
        showOverlay={legacy}
        active={legacy || viewMode !== 'system'}
        onGalaxyData={(data) => setUnplacedCount(data?.unplaced.length ?? 0)}
      />

      {legacy ? null : <ViewportOverlay store={store} unplacedCount={unplacedCount} />}
      <FadeCurtain
        active={curtain}
        durationMs={reducedMotion ? 0 : 300}
        reducedMotion={reducedMotion}
      />
    </div>
  );
}

export default ViewportView;
