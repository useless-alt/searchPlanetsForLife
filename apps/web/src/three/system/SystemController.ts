import type { AtmosphereHints, ModelSettings } from '@exo/shared';
import { computeHz } from '@exo/shared';
import type * as THREE from 'three';

import { showToast } from '../../components/ui/Toast';
import { setDebugSystemScene } from '../../debug/sceneBridge';
import { ExoMastBridge } from '../../exomast/bridge';
import { ru } from '../../i18n/ru';
import type { CameraState } from '../map/GalaxyScene';
import type { ViewScene } from '../host/ViewScene';
import type { PlanetDetail } from '../../workers/protocol';
import { disposeObject3D } from './disposeObject3D';
import { SystemScene, type SystemSceneOptions } from './SystemScene';
import type { SystemLayerStatusMap } from './layers';
import type { SceneTarget, SystemToggles } from './runtime';
import type { AppStore, SystemLayerStatusEntry, ViewMode } from '../../state/store';

/**
 * Машина состояний перехода «карта Галактики ↔ сцена системы»
 * (задача 22; п. 9.1, 9.4, 10.9; U38, U40, U46–U50).
 *
 * Контроллер не рисует React-интерфейс: он подписывается на хранилище,
 * управляет общим `RendererHost`, перелётом карты и жизненным циклом
 * `SystemScene`. Все переходы идемпотентны, а номер запроса защищает от
 * запоздавших `onArrive` и ответов загрузчика детали.
 */

/** Минимальный интерфейс карты, нужный контроллеру. */
export interface GalaxyFlightView {
  /** Позиция системы по идентификатору планеты; null — координат нет. */
  getSystemPosition(planetId: string): { x: number; y: number; z: number } | null;
  /** Состояние камеры карты. */
  getCameraState(): CameraState | null;
  /** Восстанавливает камеру карты. */
  setCameraState(state: CameraState, options?: { durationMs?: number }): void;
  /** Плавно подлетает к системе. */
  flyToSystem(position: { x: number; y: number; z: number }): void;
  /** Подписка на завершение перелёта. */
  onArrive(callback: () => void): () => void;
}

/** Минимальный интерфейс хоста. */
export interface SceneHost {
  /** Подключает вид. */
  setScene(scene: ViewScene, options?: { fadeMs?: number }): void;
}

/** Минимальный интерфейс сцены системы. */
export interface ControlledSystemScene {
  /** Корневая сцена. */
  scene: THREE.Scene;
  /** Меняет цель камеры. */
  setTarget(target: SceneTarget): boolean;
  /** Возвращает обзор текущей цели. */
  resetCamera(): void;
  /** Обновляет контекст. */
  setContext(update: {
    detail?: PlanetDetail;
    settings?: ModelSettings;
    mode?: 'overview' | 'real';
    toggles?: Partial<SystemToggles>;
  }): void;
  /** Переключает слои. */
  setToggles(toggles: Partial<SystemToggles>): void;
  /** Подсказки об атмосфере из Exo.MAST (задача 28; U52). */
  setHints(hints: AtmosphereHints | null): void;
  /** Освобождает ресурсы. */
  dispose(): void;
}

/** Фабрика сцены системы; подменяется в тестах. */
export type SystemSceneFactory = (options: SystemSceneOptions) => ControlledSystemScene;

/** Настройки контроллера. */
export interface SystemControllerOptions {
  /** Хранилище приложения. */
  store: AppStore;
  /** Общий WebGL-хост. */
  host: SceneHost;
  /** Карта Галактики. */
  galaxy: GalaxyFlightView;
  /** Фабрика сцены системы. */
  createSystemScene?: SystemSceneFactory;
  /** Показ уведомлений. */
  toast?: (text: string) => void;
  /** `prefers-reduced-motion`. */
  reducedMotion?: boolean;
  /** Таймаут загрузки детали [мс]. */
  detailTimeoutMs?: number;
  /** Длительность затемнения перехода [мс]. */
  fadeMs?: number;
  /** Длительность восстановления камеры карты [мс]. */
  restoreCameraMs?: number;
}

/** Текст ошибки загрузки детали (задача 22; 10.9). */
export const SCENE_DETAIL_ERROR = ru['scene.detailError'];

/** Задача перелёта, ожидающая прибытия. */
interface PendingFlight {
  token: number;
  planetId: string;
  target: SceneTarget;
}

/** Системная настройка уменьшенного движения. */
function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/** Ждёт результат не дольше `timeoutMs`; по таймауту или ошибке — null. */
async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | null = null;

  try {
    return await Promise.race([
      promise,
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), timeoutMs);
      }),
    ]);
  } catch {
    return null;
  } finally {
    if (timer !== null) clearTimeout(timer);
  }
}

/** Совпадают ли границы HZ детали с текущими настройками (11.4). */
function hzMatches(detail: PlanetDetail, settings: ModelSettings): boolean {
  if (detail.hz === null) return true;

  const expected = computeHz({
    st_teff: detail.resolved.st_teff.value,
    L: detail.resolved.L.value,
    d: detail.resolved.d.value,
    e: detail.resolved.e.value,
    bounds: settings.hzBounds,
  });

  if (expected.d_in === null) return true;

  return Math.abs(detail.hz.d_in - expected.d_in) < 1e-9;
}

/** Переводит статусы слоёв в формат хранилища. */
function toStoreStatuses(statuses: SystemLayerStatusMap): Record<string, SystemLayerStatusEntry> {
  const result: Record<string, SystemLayerStatusEntry> = {};

  for (const [id, status] of Object.entries(statuses)) {
    result[id] = {
      available: status.available,
      reason: status.reason ?? (status.available ? null : ru['scene.layerUnavailable']),
    };
  }

  return result;
}

/** Машина состояний сцены. */
export class SystemController {
  private readonly store: AppStore;

  private readonly host: SceneHost;

  private readonly galaxy: GalaxyFlightView;

  private readonly createSystemScene: SystemSceneFactory;

  private readonly toast: (text: string) => void;

  private readonly reducedMotion: boolean;

  private readonly detailTimeoutMs: number;

  private readonly fadeMs: number;

  private readonly restoreCameraMs: number;

  /** Мост Exo.MAST: ленивая загрузка и подсказки атмосферы (задача 28). */
  private readonly exoMast: ExoMastBridge;

  /** Текущий режим контроллера. */
  private mode: ViewMode;

  /** Построенная сцена системы. */
  private systemScene: ControlledSystemScene | null = null;

  /** Состояние камеры карты перед перелётом. */
  private savedCamera: CameraState | null = null;

  /** Номер перелёта; старый onArrive его не пройдёт. */
  private flightToken = 0;

  /** Номер построения системы; старый загрузчик его не пройдёт. */
  private systemToken = 0;

  /** Ожидающий прибытия перелёт. */
  private pendingFlight: PendingFlight | null = null;

  /** Последний обработанный запрос перелёта. */
  private lastFlySeq = 0;

  /** Отписка от хранилища. */
  private unsubscribe: (() => void) | null = null;

  /** Отписка от прибытия карты. */
  private unsubscribeArrive: (() => void) | null = null;

  /** Контроллер запущен. */
  private started = false;

  /** Контроллер освобождён. */
  private disposed = false;

  /** Обработчик Esc. */
  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape' || event.defaultPrevented) return;
    if (this.mode !== 'system' && this.mode !== 'flying') return;

    event.preventDefault();
    this.returnToGalaxy();
  };

  /**
   * @param options Хранилище, хост, карта и фабрика сцены.
   */
  constructor(options: SystemControllerOptions) {
    this.store = options.store;
    this.host = options.host;
    this.galaxy = options.galaxy;
    this.createSystemScene =
      options.createSystemScene ??
      ((sceneOptions) => new SystemScene(sceneOptions) as ControlledSystemScene);
    this.toast = options.toast ?? showToast;
    this.reducedMotion = options.reducedMotion ?? prefersReducedMotion();
    this.detailTimeoutMs = options.detailTimeoutMs ?? 5000;
    this.fadeMs = options.fadeMs ?? 300;
    this.restoreCameraMs = options.restoreCameraMs ?? 600;
    this.mode = options.store.getState().viewMode;
    this.exoMast = new ExoMastBridge({
      store: this.store,
      getTarget: () => this.systemScene,
    });
  }

  /** Текущий режим контроллера. */
  get viewMode(): ViewMode {
    return this.mode;
  }

  /** Текущая сцена системы; null — карта. */
  get scene(): ControlledSystemScene | null {
    return this.systemScene;
  }

  /** Запускает подписки и обрабатывает уже записанный flyRequest. */
  start(): void {
    if (this.started || this.disposed) return;

    this.started = true;
    this.mode = 'galaxy';
    this.lastFlySeq = this.store.getState().flyRequest?.seq ?? 0;

    // После пересоздания вьюпорта система ещё не построена: показываем карту.
    if (this.store.getState().viewMode !== 'galaxy') {
      this.store.setState({ viewMode: 'galaxy' });
    }

    this.unsubscribe = this.store.subscribe((state, previous) => {
      this.handleStateChange(state, previous);
    });
    this.unsubscribeArrive = this.galaxy.onArrive(() => this.handleArrive());

    if (typeof document !== 'undefined') {
      document.addEventListener('keydown', this.handleKeyDown);
    }

    const flyRequest = this.store.getState().flyRequest;

    if (flyRequest !== null) this.handleFly(flyRequest.seq);
  }

  /** Снимает подписки и освобождает сцену системы. */
  dispose(): void {
    if (this.disposed) return;

    this.disposed = true;
    this.started = false;
    this.flightToken += 1;
    this.systemToken += 1;
    this.pendingFlight = null;
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.unsubscribeArrive?.();
    this.unsubscribeArrive = null;
    this.exoMast.dispose();

    if (typeof document !== 'undefined') {
      document.removeEventListener('keydown', this.handleKeyDown);
    }

    this.disposeSystem();

    if (this.mode !== 'galaxy') {
      this.mode = 'galaxy';
      this.store.setState({ viewMode: 'galaxy' });
    }
  }

  /** Возвращает на карту, освобождая сцену. */
  leaveSystem(): void {
    this.returnToGalaxy();
  }

  /** Обрабатывает изменения хранилища. */
  private handleStateChange(
    state: ReturnType<AppStore['getState']>,
    previous: ReturnType<AppStore['getState']>,
  ): void {
    if (this.disposed) return;

    if (state.flyRequest !== null && state.flyRequest.seq !== this.lastFlySeq) {
      this.handleFly(state.flyRequest.seq);
    }

    if (state.leaveSystemSeq !== previous.leaveSystemSeq && this.mode !== 'galaxy') {
      this.returnToGalaxy();
      return;
    }

    if (state.systemCameraResetSeq !== previous.systemCameraResetSeq) {
      if (this.mode === 'system') this.systemScene?.resetCamera();
    }

    // Деталь сцены обновляется при смене настроек или снимка независимо от
    // того, открыта ли сейчас система: к возврату данные уже свежие (6.2).
    if (
      state.scenePlanetId !== null &&
      (state.settings !== previous.settings || state.snapshotId !== previous.snapshotId)
    ) {
      void this.refreshDetail();
    }

    if (this.mode !== 'system' || this.systemScene === null) return;

    if (state.sceneTarget !== previous.sceneTarget) {
      this.systemScene.setTarget(state.sceneTarget);
    }

    if (state.scaleMode !== previous.scaleMode) {
      this.systemScene.setContext({ mode: state.scaleMode });
    }

    if (state.showOrbit !== previous.showOrbit || state.showHz !== previous.showHz) {
      this.systemScene.setToggles({
        showOrbit: state.showOrbit,
        showHz: state.showHz,
      });
    }
  }

  /** Загружает деталь при смене настроек или снимка. */
  private async refreshDetail(): Promise<void> {
    const planetId = this.store.getState().scenePlanetId;

    if (planetId === null) return;

    let detail = await this.store.getState().refreshSceneDetail();

    // Пересчёт Топ-50 идёт параллельно с запросом детали. Если воркер ещё
    // не применил новые настройки, границы HZ в детали не совпадут с
    // карточкой. Повторяем запрос, пока совпадение не установится (11.4).
    for (let attempt = 0; attempt < 6; attempt += 1) {
      if (this.disposed || detail === null) break;
      if (hzMatches(detail, this.store.getState().settings)) break;

      await new Promise((resolve) => setTimeout(resolve, 150));
      detail = await this.store.getState().refreshSceneDetail();
    }

    if (
      this.disposed ||
      this.mode !== 'system' ||
      this.systemScene === null ||
      detail === null ||
      detail.id !== planetId ||
      this.store.getState().scenePlanetId !== planetId
    ) {
      return;
    }

    this.systemScene.setContext({
      detail,
      settings: this.store.getState().settings,
    });
  }

  /** Запускает обработку запроса перелёта. */
  private handleFly(sequence: number): void {
    this.lastFlySeq = sequence;

    const state = this.store.getState();
    const request = state.flyRequest;

    if (request === null || request.seq !== sequence) return;

    if (
      this.mode === 'system' &&
      this.systemScene !== null &&
      state.scenePlanetId === request.planetId
    ) {
      if (this.systemScene.setTarget(request.target)) {
        this.store.getState().setSceneTarget(request.target);
      }

      return;
    }

    if (this.mode === 'system' && state.scenePlanetId !== request.planetId) {
      this.exoMast.begin(request.planetId);
      void this.beginSystem(request.planetId, request.target);
      return;
    }

    if (this.mode === 'flying') {
      // Новый перелёт отменяет предыдущий: старый onArrive не пройдёт токен.
      this.flightToken += 1;
      this.pendingFlight = null;
    }

    const position = this.galaxy.getSystemPosition(request.planetId);

    if (position === null) {
      // U44: без координат перелёт невозможен, но камеру карты всё равно
      // запоминаем, чтобы вернуть её после выхода из системы.
      if (this.mode === 'galaxy') this.savedCamera = this.galaxy.getCameraState();

      this.exoMast.begin(request.planetId);
      void this.beginSystem(request.planetId, request.target);
      return;
    }

    if (this.mode === 'galaxy') this.savedCamera = this.galaxy.getCameraState();

    const token = ++this.flightToken;

    // Ленивый Exo.MAST стартует вместе с перелётом и не ждёт ответа (10.1.4).
    this.exoMast.begin(request.planetId);

    this.pendingFlight = {
      token,
      planetId: request.planetId,
      target: request.target,
    };
    this.mode = 'flying';
    this.store.setState({ viewMode: 'flying' });
    this.galaxy.flyToSystem(position);
  }

  /** Прибытие карты: строит систему, если перелёт ещё актуален. */
  private handleArrive(): void {
    const pending = this.pendingFlight;

    if (pending === null || pending.token !== this.flightToken) return;

    this.pendingFlight = null;
    void this.beginSystem(pending.planetId, pending.target);
  }

  /**
   * Загружает деталь и строит сцену системы.
   *
   * @param planetId Планета.
   * @param target Начальная цель камеры.
   */
  private async beginSystem(planetId: string, target: SceneTarget): Promise<void> {
    if (this.disposed) return;

    // Переход в систему без перелёта тоже запускает ленивый запрос.
    this.exoMast.begin(planetId);

    const token = ++this.systemToken;

    this.pendingFlight = null;
    this.mode = 'flying';
    this.store.setState({
      scenePlanetId: planetId,
      sceneTarget: target,
      viewMode: 'flying',
    });

    const detail = await withTimeout(
      this.store.getState().refreshSceneDetail(),
      this.detailTimeoutMs,
    );

    if (this.disposed || token !== this.systemToken) return;
    if (this.store.getState().scenePlanetId !== planetId) return;

    if (detail === null || detail.id !== planetId) {
      this.toast(SCENE_DETAIL_ERROR);
      this.returnToGalaxy();
      return;
    }

    const state = this.store.getState();
    const toggles = { showOrbit: state.showOrbit, showHz: state.showHz };

    this.disposeSystem();
    this.systemScene = this.createSystemScene({
      detail,
      settings: state.settings,
      mode: state.scaleMode,
      target,
      toggles,
      reducedMotion: this.reducedMotion,
      onSelectTarget: (nextTarget) => {
        this.store.getState().setSceneTarget(nextTarget);
      },
      toast: this.toast,
      onLayerStatus: (statuses) => {
        this.store.setState({ systemLayerStatus: toStoreStatuses(statuses) });
      },
    });

    this.mode = 'system';
    setDebugSystemScene(this.systemScene as unknown as SystemScene);
    this.host.setScene(this.systemScene as unknown as ViewScene, {
      fadeMs: this.reducedMotion ? 0 : this.fadeMs,
    });
    this.store.setState({ viewMode: 'system', sceneTarget: target });
    // Подписки уже могли прийти раньше сцены — применяем то, что есть.
    this.exoMast.attach();
  }

  /** Освобождает объекты текущей сцены системы. */
  private disposeSystem(): void {
    const scene = this.systemScene;

    if (scene === null) return;

    // Явно освобождаем дерево объектов (11.6), затем сцену и её контролы.
    disposeObject3D(scene.scene);
    scene.dispose();
    setDebugSystemScene(null);
    this.systemScene = null;
  }

  /** Возвращает карту, восстанавливая сохранённую камеру. */
  private returnToGalaxy(): void {
    if (this.disposed) return;

    this.exoMast.end();
    this.flightToken += 1;
    this.systemToken += 1;
    this.pendingFlight = null;
    this.disposeSystem();
    this.mode = 'galaxy';
    this.host.setScene(this.galaxy as unknown as ViewScene, {
      fadeMs: this.reducedMotion ? 0 : this.fadeMs,
    });

    if (this.savedCamera !== null) {
      this.galaxy.setCameraState(this.savedCamera, {
        durationMs: this.reducedMotion ? 0 : this.restoreCameraMs,
      });
    }

    this.store.setState({ viewMode: 'galaxy' });
  }
}

/** Псевдоним фабрики для явного имени. */
export const createSystemController = (options: SystemControllerOptions): SystemController =>
  new SystemController(options);
