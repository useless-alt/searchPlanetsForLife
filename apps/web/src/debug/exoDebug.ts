/**
 * Отладочный доступ для сквозных тестов (задача 31, п. 3 постановки).
 *
 * Модуль подключается только в dev-сборке или при `VITE_E2E=1`:
 *
 * ```ts
 * if (import.meta.env.DEV || import.meta.env.VITE_E2E === '1') {
 *   void import('./debug/exoDebug').then(({ installExoDebug }) => installExoDebug());
 * }
 * ```
 *
 * `window.__exo` — «только чтение» состояния приложения. Единственное
 * исключение — `scene.sim.*`: в тестовой сборке нужно управлять модельным
 * временем, чтобы проверить орбиту и вращение без ожидания реальных секунд.
 * Ни одно поле не меняет режим, фильтры, выбор планеты или данные.
 */

import { appStore } from '../state/store';
import { getGalaxyData } from '../three/map/buildGalaxy';
import type { SystemScene } from '../three/system/SystemScene';
import { getDebugHost, getDebugSystemScene } from './sceneBridge';

/** Состояние приложения, доступное тесту. */
export interface ExoDebugState {
  /** Фаза загрузки. */
  phase: string;
  /** Вид правой панели. */
  viewMode: string;
  /** Режим расчёта. */
  mode: string;
  /** Выбранная планета. */
  selectedPlanetId: string | null;
  /** Планета, для которой построена сцена. */
  scenePlanetId: string | null;
  /** Цель камеры сцены. */
  sceneTarget: string;
  /** Масштаб сцены. */
  scaleMode: string;
  /** Границы зоны обитаемости. */
  hzBounds: string;
  /** Орбита включена. */
  showOrbit: boolean;
  /** Зона обитаемости включена. */
  showHz: boolean;
  /** Служебные данные включены. */
  showExtraData: boolean;
  /** Идёт обновление снимка. */
  refreshing: boolean;
  /** Число строк Топ-50. */
  rowsCount: number;
  /** Счётчики выборки. */
  counters: unknown;
}

/** Ресурсы GPU по данным рендерера. */
export interface ExoDebugGpu {
  /** Число геометрий в памяти. */
  geometries: number;
  /** Число текстур в памяти. */
  textures: number;
  /** Число скомпилированных программ. */
  programs: number;
  /** Число draw call последнего кадра. */
  calls: number;
}

/** Метка лидера на карте. */
export interface ExoDebugMapLeader {
  /** Ранг в Топ-50. */
  rank: number;
  /** Идентификатор планеты. */
  planetId: string;
  /** Метка видима. */
  visible: boolean;
  /** Метка — лидер или выбранная планета. */
  highlighted: boolean;
  /** Экранная координата X центра метки. */
  x: number;
  /** Экранная координата Y центра метки. */
  y: number;
}

/** Публичный отладочный API. */
export interface ExoDebugApi {
  /** Снимок состояния приложения. */
  state(): ExoDebugState;
  /** Ресурсы GPU. */
  gpu(): ExoDebugGpu;
  /** Карта Галактики. */
  map: {
    /** Лидеры в порядке рангов. */
    leaders(): ExoDebugMapLeader[];
    /** Сколько кнопок меток в DOM (51 слот, включая скрытые). */
    labelDomCount(): number;
    /** Позиция системы планеты на карте. */
    systemPosition(id: string): [number, number, number] | null;
  };
  /** Сцена системы. */
  scene: {
    /** Камера. */
    camera(): {
      position: [number, number, number];
      target: [number, number, number];
      distance: number;
    };
    /** Звезда и планета. */
    objects(): {
      star: { pos: [number, number, number]; radius: number };
      planet: { pos: [number, number, number]; radius: number };
    };
    /** Контур орбиты. */
    orbit(n?: number): { points: [number, number, number][]; unitsPerAU: number } | null;
    /** Зона обитаемости. */
    hz(): { inner: number; outer: number; visible: boolean } | null;
    /** Доступность и видимость слоёв. */
    layers(): Record<string, { available: boolean; visible: boolean; reason: string | null }>;
    /** Управление модельным временем (только тестовая сборка). */
    sim: {
      setTimeScale(k: number): void;
      advanceDays(d: number): void;
      advanceHours(h: number): void;
      pause(): void;
      resume(): void;
      days(): number;
      spinHours(): number;
    };
    /** Вращение поверхности. */
    rotation(): {
      angle: number;
      axis: [number, number, number];
      tiltDeg: number;
      mode: 'locked' | 'assumed';
      periodDays: number;
    };
    /** Признаки заглушек. */
    stub(): { planet: boolean; star: boolean };
    /** Настройки сцены и границы HZ (диагностика). */
    info(): { hzBounds: string; detailHz: unknown; scaleMode: string };
    /** Трасса камеры по кадрам (для проверки плавности перелёта). */
    cameraTrace(): [number, number, number][];
    /** Очищает трассу камеры. */
    clearCameraTrace(): void;
  };
}

declare global {
  interface Window {
    /** Отладочный доступ e2e; присутствует только в тестовой сборке. */
    __exo?: ExoDebugApi;
  }
}

/** Максимум кадров трассы камеры. */
const CAMERA_TRACE_LIMIT = 600;

/** Трасса позиции камеры по кадрам. */
const cameraTrace: [number, number, number][] = [];

/** Идёт ли запись трассы. */
let tracing = false;

/** Сцена, для которой пишется трасса (чтобы не смешивать виды). */
let traceScene: SystemScene | null = null;

/** Запускает запись камеры по кадрам. */
function startTracing(): void {
  if (tracing) return;

  tracing = true;

  const tick = (): void => {
    if (!tracing) return;

    const scene = getDebugSystemScene();

    if (scene !== traceScene) {
      traceScene = scene;
      cameraTrace.length = 0;
    }

    if (scene !== null) {
      cameraTrace.push(scene.debugCamera.position);

      if (cameraTrace.length > CAMERA_TRACE_LIMIT) cameraTrace.shift();
    }

    requestAnimationFrame(tick);
  };

  requestAnimationFrame(tick);
}

/** Корень DOM-слоя меток карты. */
function labelRoot(): ParentNode {
  return document.querySelector('.map-labels') ?? document;
}

/** Все кнопки меток в DOM (51 слот, включая скрытые). */
function labelButtons(): HTMLButtonElement[] {
  return [...labelRoot().querySelectorAll<HTMLButtonElement>('button.reticle')];
}

/** Собирает отладочный API поверх текущего состояния. */
function createApi(): ExoDebugApi {
  const sceneOrNull = (): SystemScene | null => getDebugSystemScene();

  return {
    state() {
      const state = appStore.getState();

      return {
        phase: state.phase,
        viewMode: state.viewMode,
        mode: state.settings.mode,
        selectedPlanetId: state.selectedPlanetId,
        scenePlanetId: state.scenePlanetId,
        sceneTarget: state.sceneTarget,
        scaleMode: state.scaleMode,
        hzBounds: state.settings.hzBounds,
        showOrbit: state.showOrbit,
        showHz: state.showHz,
        showExtraData: state.showExtraData,
        refreshing: state.refreshing,
        rowsCount: state.rows.length,
        counters: state.counters,
      };
    },

    gpu() {
      const info = getDebugHost()?.renderer.info;

      return {
        geometries: info?.memory.geometries ?? 0,
        textures: info?.memory.textures ?? 0,
        programs: info?.programs?.length ?? 0,
        calls: info?.render.calls ?? 0,
      };
    },

    map: {
      leaders() {
        const state = appStore.getState();
        const buttons = new Map<string, HTMLButtonElement>();

        for (const button of labelRoot().querySelectorAll<HTMLButtonElement>(
          'button.reticle[data-planet-id]',
        )) {
          const planetId = button.dataset['planetId'];

          if (planetId !== undefined && planetId !== '') buttons.set(planetId, button);
        }

        return state.rows.map((row) => {
          const button = buttons.get(row.planetId);
          const rect = button?.getBoundingClientRect();
          const visible = button !== undefined && !button.hidden && (rect?.width ?? 0) > 0;

          return {
            rank: row.rank,
            planetId: row.planetId,
            visible,
            highlighted:
              visible &&
              (button?.classList.contains('reticle--leader') === true ||
                button?.classList.contains('reticle--selected') === true),
            x: rect === undefined ? 0 : rect.left + rect.width / 2,
            y: rect === undefined ? 0 : rect.top + rect.height / 2,
          };
        });
      },

      labelDomCount() {
        return labelButtons().length;
      },

      systemPosition(id) {
        const state = appStore.getState();

        if (state.snapshotId === null) return null;

        const data = getGalaxyData(state.snapshotId);

        if (data === null) return null;

        const index = data.systemIndexByPlanet.get(id);

        if (index === undefined) return null;

        const system = data.systems[index];

        return system === undefined
          ? null
          : [system.position.x, system.position.y, system.position.z];
      },
    },

    scene: {
      camera() {
        const scene = sceneOrNull();

        return (
          scene?.debugCamera ?? {
            position: [0, 0, 0],
            target: [0, 0, 0],
            distance: 0,
          }
        );
      },

      objects() {
        const scene = sceneOrNull();

        return (
          scene?.debugObjects ?? {
            star: { pos: [0, 0, 0] as [number, number, number], radius: 0 },
            planet: { pos: [0, 0, 0] as [number, number, number], radius: 0 },
          }
        );
      },

      orbit(n = 360) {
        return sceneOrNull()?.debugOrbit(n) ?? null;
      },

      hz() {
        return sceneOrNull()?.debugHz ?? null;
      },

      layers() {
        return sceneOrNull()?.debugLayers ?? {};
      },

      sim: {
        setTimeScale(k) {
          sceneOrNull()?.debugSetTimeScale(k);
        },
        advanceDays(d) {
          sceneOrNull()?.debugAdvanceDays(d);
        },
        advanceHours(h) {
          sceneOrNull()?.debugAdvanceHours(h);
        },
        pause() {
          sceneOrNull()?.debugPause();
        },
        resume() {
          sceneOrNull()?.debugResume();
        },
        days() {
          return sceneOrNull()?.debugDays ?? 0;
        },
        spinHours() {
          return sceneOrNull()?.debugSpinHours ?? 0;
        },
      },

      rotation() {
        return (
          sceneOrNull()?.debugRotation ?? {
            angle: 0,
            axis: [0, 1, 0] as [number, number, number],
            tiltDeg: 0,
            mode: 'assumed' as const,
            periodDays: 0,
          }
        );
      },

      stub() {
        return sceneOrNull()?.debugStub ?? { planet: false, star: false };
      },

      info() {
        return (
          sceneOrNull()?.debugInfo ?? {
            hzBounds: '',
            detailHz: null,
            scaleMode: '',
          }
        );
      },

      cameraTrace() {
        return cameraTrace.map((point) => [...point] as [number, number, number]);
      },

      clearCameraTrace() {
        cameraTrace.length = 0;
      },
    },
  };
}

/**
 * Устанавливает `window.__exo`.
 *
 * Повторный вызов возвращает уже установленный объект.
 */
export function installExoDebug(): ExoDebugApi {
  if (window.__exo !== undefined) return window.__exo;

  const api = createApi();

  window.__exo = api;
  startTracing();

  return api;
}
