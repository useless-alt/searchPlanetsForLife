import {
  CAMERA_TRANSITION_MS,
  easeInOut,
  interpolateCameraPose,
  makeScaleModel,
  normalizeEccentricity,
  SYSTEM_CAMERA_FOV,
  SYSTEM_NEAR_PLANE,
  systemCameraPlan,
  type CameraPose,
  type ModelSettings,
  type ScaleMode,
  type ScaleModel,
  type SystemCameraPlan,
} from '@exo/shared';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

import { three as threeTokens } from '../../styles/theme';
import type { PlanetDetail } from '../../workers/protocol';
import type { RendererHost } from '../host/RendererHost';
import type { ViewScene } from '../host/ViewScene';
import { disposeObject3D } from './disposeObject3D';
import {
  layerVisible,
  listSystemLayers,
  type SystemLayerDefinition,
  type SystemLayerStatusMap,
} from './layers';
import {
  createSystemPicking,
  STAR_UNAVAILABLE_REASON,
  type SystemPickingController,
} from './picking';
import {
  createSystemContext,
  DEFAULT_SYSTEM_TOGGLES,
  type SceneTarget,
  type SystemContext,
  type SystemMotion,
  type SystemToggles,
} from './runtime';
import { SimClock } from './SimClock';
import { createVisual, type VisualInstance } from './visuals';

/**
 * 3D-сцена системы (задача 22; п. 9.1, 9.4, 10.9; U38, U40, U46–U50).
 *
 * Сцена строит звезду и планету в модели масштаба, добавляет свет и слои из
 * реестра, ведёт часы орбиты и камеру с переходами. Холст, WebGL-контекст и
 * CSS2D-слой принадлежат общему `RendererHost`, поэтому переключение
 * «карта ↔ система» не пересоздаёт канву (U40).
 */

/** Настройки сцены системы. */
export interface SystemSceneOptions {
  /** Деталь планеты. */
  detail: PlanetDetail;
  /** Настройки модели (границы HZ и режим). */
  settings: ModelSettings;
  /** Режим масштаба; по умолчанию обзорный. */
  mode?: ScaleMode;
  /** Начальная цель камеры; по умолчанию планета. */
  target?: SceneTarget;
  /** Переключатели слоёв. */
  toggles?: Partial<SystemToggles>;
  /** `prefers-reduced-motion`: переходы без анимации. */
  reducedMotion?: boolean;
  /** Явно заданное движение (перекрывает реестр задач 23). */
  motion?: SystemMotion;
  /** Обработчик выбора цели мышью. */
  onSelectTarget?: (target: SceneTarget) => void;
  /** Показ Toast при недоступной звезде. */
  toast?: (text: string) => void;
  /** Публикация статусов слоёв. */
  onLayerStatus?: (statuses: SystemLayerStatusMap) => void;
}

/** Обновление контекста сцены. */
export interface SystemSceneContextUpdate {
  /** Новая деталь планеты. */
  detail?: PlanetDetail;
  /** Новые настройки модели. */
  settings?: ModelSettings;
  /** Новый режим масштаба. */
  mode?: ScaleMode;
  /** Новые переключатели слоёв. */
  toggles?: Partial<SystemToggles>;
}

/** Переход камеры между позами. */
interface CameraTransition {
  startPosition: THREE.Vector3;
  endPosition: THREE.Vector3;
  startTarget: THREE.Vector3;
  endTarget: THREE.Vector3;
  elapsedMs: number;
  durationMs: number;
}

/** Построенный слой. */
interface BuiltLayer {
  definition: SystemLayerDefinition;
  object: THREE.Object3D;
}

/** Модель-заглушка для случая, когда радиус звезды неизвестен (задача 27). */
function placeholderScale(): ScaleModel {
  return {
    mode: 'overview',
    planetRadius: 1,
    starRadius: 1,
    unitsPerAU: 1,
    nominal: true,
    mapAU(radiusAU: number): number {
      return radiusAU;
    },
  };
}

/** Проверяет системную настройку уменьшенного движения. */
function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/** Ограничивает значение диапазоном. */
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Сцена системы. */
export class SystemScene implements ViewScene {
  /** Идентификатор вида. */
  readonly id = 'system' as const;

  /** Корневая сцена. */
  readonly scene = new THREE.Scene();

  /** Камера системы. */
  readonly camera = new THREE.PerspectiveCamera(SYSTEM_CAMERA_FOV, 1, SYSTEM_NEAR_PLANE, 1000);

  /** Текущая деталь планеты. */
  private detail: PlanetDetail;

  /** Текущие настройки модели. */
  private settings: ModelSettings;

  /** Текущий режим масштаба. */
  private mode: ScaleMode;

  /** Текущая цель камеры. */
  private activeTarget: SceneTarget;

  /** Переключатели слоёв. */
  private toggles: SystemToggles;

  /** Модель масштаба; null — радиус звезды неизвестен. */
  private model: ScaleModel | null = null;

  /** Есть ли пригодная модель масштаба. */
  private hasScale = false;

  /** Контекст выполнения. */
  private context!: SystemContext;

  /** Часы орбиты. */
  private sim = new SimClock(null);

  /** Группа звезды. */
  private readonly starGroup = new THREE.Group();

  /** Группа планеты. */
  private readonly planetGroup = new THREE.Group();

  /** Группа слоёв. */
  private readonly layerGroup = new THREE.Group();

  /** Заглушка или фабричный объект звезды. */
  private starVisual: VisualInstance | null = null;

  /** Заглушка или фабричный объект планеты. */
  private planetVisual: VisualInstance | null = null;

  /** Построенные слои. */
  private builtLayers: BuiltLayer[] = [];

  /** Опубликованные статусы слоёв. */
  private layerStatuses: SystemLayerStatusMap = {};

  /** Контролы камеры. */
  private controls: OrbitControls | null = null;

  /** Хост, к которому подключена сцена. */
  private host: RendererHost | null = null;

  /** Контроллер выбора мышью. */
  private picking: SystemPickingController | null = null;

  /** Текущий план камеры. */
  private currentPlan: SystemCameraPlan | null = null;

  /** Текущая точка взгляда камеры. */
  private readonly targetPoint = new THREE.Vector3();

  /** Активный переход камеры. */
  private transition: CameraTransition | null = null;

  /** Нужно ли учитывать уменьшенное движение. */
  private readonly reducedMotion: boolean;

  /** Явно заданное движение. */
  private readonly explicitMotion: SystemMotion | undefined;

  /** Колбэки сцены. */
  private readonly callbacks: Pick<
    SystemSceneOptions,
    'onSelectTarget' | 'toast' | 'onLayerStatus'
  >;

  /** Сцена освобождена. */
  private disposed = false;

  /** Обработчик изменения камеры. */
  private readonly handleControlsChange = (): void => {
    this.host?.requestRender();
  };

  /** Пользовательское вращение прерывает программный переход. */
  private readonly handleControlsStart = (): void => {
    this.transition = null;
  };

  /**
   * @param options Деталь, настройки и начальное состояние вида.
   */
  constructor(options: SystemSceneOptions) {
    this.detail = options.detail;
    this.settings = options.settings;
    this.mode = options.mode ?? 'overview';
    this.activeTarget = options.target ?? 'planet';
    this.toggles = {
      showOrbit: options.toggles?.showOrbit ?? DEFAULT_SYSTEM_TOGGLES.showOrbit,
      showHz: options.toggles?.showHz ?? DEFAULT_SYSTEM_TOGGLES.showHz,
    };
    this.reducedMotion = options.reducedMotion ?? prefersReducedMotion();
    this.explicitMotion = options.motion;
    this.callbacks = {
      onSelectTarget: options.onSelectTarget,
      toast: options.toast,
      onLayerStatus: options.onLayerStatus,
    };

    this.scene.background = new THREE.Color(threeTokens.space);
    this.scene.add(this.starGroup, this.planetGroup, this.layerGroup);

    const light = new THREE.PointLight(0xffffff, 2.2, 0, 0);
    light.position.set(0, 0, 0);
    light.name = 'star-light';
    this.scene.add(light);

    const ambient = new THREE.AmbientLight(0xffffff, 0.22);
    ambient.name = 'ambient-light';
    this.scene.add(ambient);

    this.buildContents();
  }

  /** Модель масштаба; null — звезда без радиуса, показывается заглушка. */
  get scaleModel(): ScaleModel | null {
    return this.model;
  }

  /** Доступна ли звезда как цель камеры и выбора (U38). */
  get starAvailable(): boolean {
    return this.hasScale && !this.detail.gaps.starStub;
  }

  /** Текущая цель. */
  get target(): SceneTarget {
    return this.activeTarget;
  }

  /** Статусы слоёв, опубликованные после последнего изменения контекста. */
  get systemLayerStatus(): SystemLayerStatusMap {
    return this.layerStatuses;
  }

  /** Текущий контекст сцены. */
  get systemContext(): SystemContext {
    return this.context;
  }

  /** Вызывается хостом при подключении вида. */
  activate(host: RendererHost): void {
    if (this.disposed) return;

    this.host = host;

    if (this.controls === null) {
      const controls = new OrbitControls(this.camera, host.canvas);

      controls.enableRotate = true;
      controls.enableZoom = true;
      controls.enablePan = false;
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;
      controls.addEventListener('change', this.handleControlsChange);
      controls.addEventListener('start', this.handleControlsStart);
      this.controls = controls;
    }

    this.controls.enabled = true;
    this.controls.target.copy(this.targetPoint);
    this.applyPlanLimits(this.currentPlan);
    this.controls.update();

    if (this.starVisual !== null) {
      this.picking?.dispose();
      this.picking = createSystemPicking({
        canvas: host.canvas,
        camera: this.camera,
        scene: this.scene,
        planet: this.hasScale && this.planetVisual !== null ? this.planetGroup : null,
        star: this.starGroup,
        planetRadius: this.context.scale.planetRadius,
        starRadius: this.context.scale.starRadius,
        viewportHeight: () => host.viewportHeight,
        isStarAvailable: () => this.starAvailable,
        starUnavailableReason: STAR_UNAVAILABLE_REASON,
        onSelect: (target) => {
          this.setTarget(target);
        },
        toast: this.callbacks.toast,
      });
    }

    host.requestRender();
  }

  /** Вызывается перед отключением вида. */
  deactivate(): void {
    if (this.controls !== null) this.controls.enabled = false;

    this.picking?.dispose();
    this.picking = null;
    this.transition = null;
    this.host = null;
  }

  /**
   * Шаг анимации сцены.
   *
   * @param dtSec Время с прошлого кадра [с].
   * @returns true, если нужен новый кадр.
   */
  update(dtSec: number): boolean {
    if (this.disposed) return false;

    const days = this.sim.advance(dtSec);
    let moved = false;

    if (this.hasScale) {
      const [x, y, z] = this.context.motion.positionAU(days);
      const units = this.context.scale.unitsPerAU;
      const next = new THREE.Vector3(x * units, y * units, z * units);
      const delta = next.clone().sub(this.planetGroup.position);

      if (delta.lengthSq() > 1e-18) {
        this.planetGroup.position.copy(next);
        moved = true;

        // Центр управления следует за планетой: камера смещается на то же
        // приращение, поэтому относительный вид не меняется.
        if (this.activeTarget === 'planet') {
          this.camera.position.add(delta);
          this.targetPoint.add(delta);
          this.controls?.target.add(delta);
          this.shiftTransition(delta);
        }
      }
    }

    this.planetVisual?.update?.(dtSec, this.context);
    this.starVisual?.update?.(dtSec, this.context);

    for (const layer of this.builtLayers) {
      if (!layer.object.visible) continue;

      layer.definition.update?.(this.context, dtSec);
    }

    this.picking?.update();

    const transitioning = this.advanceTransition(dtSec);
    const controlsChanged = this.controls?.update() ?? false;

    return (
      moved ||
      transitioning ||
      controlsChanged ||
      this.planetVisual?.update !== undefined ||
      this.starVisual?.update !== undefined
    );
  }

  /**
   * Меняет цель камеры с переходом 900 мс (U47).
   *
   * @param target Планета или звезда.
   * @returns false, если звезда недоступна.
   */
  setTarget(target: SceneTarget): boolean {
    if (this.disposed) return false;

    if (target === 'star' && !this.starAvailable) {
      (this.callbacks.toast ?? (() => undefined))(STAR_UNAVAILABLE_REASON);
      return false;
    }

    this.callbacks.onSelectTarget?.(target);

    if (this.activeTarget === target && this.currentPlan !== null) return true;

    this.activeTarget = target;
    this.startTransition(this.planForCurrentTarget(), CAMERA_TRANSITION_MS);

    return true;
  }

  /** Возвращает вид по таблице для текущей цели (U47). */
  resetCamera(): void {
    if (this.disposed) return;

    this.startTransition(this.planForCurrentTarget(), CAMERA_TRANSITION_MS);
  }

  /**
   * Обновляет контекст; при смене данных перестраивает содержимое сцены.
   *
   * @param update Новые части контекста.
   */
  setContext(update: SystemSceneContextUpdate): void {
    if (this.disposed) return;

    let rebuild = false;

    if (update.detail !== undefined && update.detail !== this.detail) {
      this.detail = update.detail;
      rebuild = true;
    }

    if (update.settings !== undefined && update.settings !== this.settings) {
      this.settings = update.settings;
      rebuild = true;
    }

    if (update.mode !== undefined && update.mode !== this.mode) {
      this.mode = update.mode;
      rebuild = true;
    }

    if (update.toggles !== undefined) {
      this.toggles = {
        showOrbit: update.toggles.showOrbit ?? this.toggles.showOrbit,
        showHz: update.toggles.showHz ?? this.toggles.showHz,
      };

      if (this.context !== undefined) this.context.toggles = this.toggles;
    }

    if (rebuild) {
      this.buildContents();
    } else {
      this.updateLayerVisibility();
      this.publishLayerStatus();
      this.host?.requestRender();
    }
  }

  /**
   * Меняет видимость слоя без освобождения ресурсов.
   *
   * @param toggles Новые значения переключателей.
   */
  setToggles(toggles: Partial<SystemToggles>): void {
    this.setContext({ toggles });
  }

  /** Освобождает GPU-ресурсы и обработчики. */
  dispose(): void {
    if (this.disposed) return;

    this.disposed = true;
    this.deactivate();
    this.clearContents();

    if (this.controls !== null) {
      this.controls.removeEventListener('change', this.handleControlsChange);
      this.controls.removeEventListener('start', this.handleControlsStart);
      this.controls.dispose();
      this.controls = null;
    }

    this.scene.clear();
  }

  /** Строит или перестраивает звезду, планету и слои. */
  private buildContents(): void {
    this.clearContents();

    this.model = makeScaleModel(this.detail.resolved, this.mode);
    this.hasScale = this.model !== null;

    const scale = this.model ?? placeholderScale();
    this.sim = new SimClock(this.detail.resolved.P.value);

    this.context = createSystemContext({
      detail: this.detail,
      settings: this.settings,
      scale,
      sim: this.sim,
      toggles: this.toggles,
      motion: this.explicitMotion,
    });

    if (!this.hasScale) this.activeTarget = 'star';

    this.starVisual = createVisual('star', this.context);
    this.starGroup.add(this.starVisual.object);

    if (this.hasScale) {
      this.planetVisual = createVisual('planet', this.context);
      this.planetGroup.add(this.planetVisual.object);

      const [x, y, z] = this.context.motion.positionAU(0);
      this.planetGroup.position.set(
        x * scale.unitsPerAU,
        y * scale.unitsPerAU,
        z * scale.unitsPerAU,
      );
    } else {
      this.planetVisual = null;
      this.planetGroup.position.set(0, 0, 0);
    }

    this.buildLayers();
    this.updateLayerVisibility();
    this.publishLayerStatus();
    this.applyPlanImmediate(this.planForCurrentTarget());
  }

  /** Создаёт доступные слои из реестра. */
  private buildLayers(): void {
    this.builtLayers = [];

    if (!this.hasScale) return;

    for (const definition of listSystemLayers()) {
      if (definition.status(this.context) !== 'available') continue;

      const object = definition.build(this.context);

      this.layerGroup.add(object);
      this.builtLayers.push({ definition, object });
    }
  }

  /** Показывает или скрывает слои по переключателям. */
  private updateLayerVisibility(): void {
    if (this.context === undefined) return;

    this.context.toggles = this.toggles;

    for (const layer of this.builtLayers) {
      layer.object.visible =
        layer.definition.status(this.context) === 'available' &&
        layerVisible(layer.definition, this.toggles);
    }
  }

  /** Публикует статусы всех зарегистрированных слоёв. */
  private publishLayerStatus(): void {
    const statuses: Record<string, { available: boolean; reason: string | null }> = {};

    if (this.context !== undefined) {
      for (const definition of listSystemLayers()) {
        const available = this.hasScale && definition.status(this.context) === 'available';

        statuses[definition.id] = {
          available,
          reason: available ? null : (definition.reason?.(this.context) ?? null),
        };
      }
    }

    this.layerStatuses = statuses;
    this.callbacks.onLayerStatus?.(statuses);
  }

  /** Освобождает визуальные объекты и слои. */
  private clearContents(): void {
    if (this.starVisual !== null) {
      this.starGroup.remove(this.starVisual.object);
      this.starVisual.dispose();
      this.starVisual = null;
    }

    if (this.planetVisual !== null) {
      this.planetGroup.remove(this.planetVisual.object);
      this.planetVisual.dispose();
      this.planetVisual = null;
    }

    for (const layer of this.builtLayers) {
      this.layerGroup.remove(layer.object);
      disposeLayer(layer);
    }

    this.builtLayers = [];
    this.picking?.dispose();
    this.picking = null;
  }

  /** Строит план камеры для текущей цели и положения планеты. */
  private planForCurrentTarget(): SystemCameraPlan {
    const scale = this.model ?? placeholderScale();
    const distanceAU = this.detail.resolved.d.value ?? 1;
    const eccentricity = normalizeEccentricity(this.detail.resolved.e.value);
    const planetPosition = {
      x: this.planetGroup.position.x,
      y: this.planetGroup.position.y,
      z: this.planetGroup.position.z,
    };
    const hzOutAU =
      this.model !== null && !this.model.nominal ? (this.detail.hz?.d_out ?? null) : null;

    return systemCameraPlan({
      target: this.activeTarget,
      mode: this.mode,
      model: scale,
      dAU: distanceAU,
      e: eccentricity,
      planetPosition,
      hzOutAU,
    });
  }

  /** Ставит камеру в позу без анимации. */
  private applyPlanImmediate(plan: SystemCameraPlan): void {
    this.currentPlan = plan;
    this.transition = null;
    this.targetPoint.set(plan.target.x, plan.target.y, plan.target.z);

    this.camera.position.set(plan.position.x, plan.position.y, plan.position.z);
    this.camera.near = plan.near;
    this.camera.far = plan.far;
    this.camera.updateProjectionMatrix();

    if (this.controls !== null) {
      this.controls.target.copy(this.targetPoint);
      this.applyPlanLimits(plan);
      this.controls.update();
    }

    this.host?.requestRender();
  }

  /** Применяет пределы OrbitControls. */
  private applyPlanLimits(plan: SystemCameraPlan | null): void {
    if (plan === null || this.controls === null) return;

    this.controls.minDistance = plan.controls.minDistance;
    this.controls.maxDistance = plan.controls.maxDistance;
    this.controls.enablePan = plan.controls.enablePan;
    this.controls.enableDamping = plan.controls.enableDamping;
    this.controls.dampingFactor = plan.controls.dampingFactor;
  }

  /** Начинает переход камеры к плану. */
  private startTransition(plan: SystemCameraPlan, durationMs: number): void {
    this.currentPlan = plan;

    if (this.reducedMotion || durationMs <= 0) {
      this.applyPlanImmediate(plan);
      return;
    }

    const startPosition = this.camera.position.clone();
    const startTarget = (this.controls?.target ?? this.targetPoint).clone();
    const endPosition = new THREE.Vector3(plan.position.x, plan.position.y, plan.position.z);
    const endTarget = new THREE.Vector3(plan.target.x, plan.target.y, plan.target.z);

    this.camera.near = plan.near;
    this.camera.far = plan.far;
    this.camera.updateProjectionMatrix();
    this.applyPlanLimits(plan);
    this.targetPoint.copy(endTarget);
    this.transition = {
      startPosition,
      endPosition,
      startTarget,
      endTarget,
      elapsedMs: 0,
      durationMs,
    };
    this.host?.requestRender();
  }

  /** Продвигает переход; возвращает true, пока кадр нужен. */
  private advanceTransition(dtSec: number): boolean {
    const transition = this.transition;

    if (transition === null) return false;

    transition.elapsedMs += Math.max(0, dtSec) * 1000;
    const progress = clamp(transition.elapsedMs / transition.durationMs, 0, 1);
    const pose: CameraPose = interpolateCameraPose(
      {
        position: vectorToVec3(transition.startPosition),
        target: vectorToVec3(transition.startTarget),
      },
      {
        position: vectorToVec3(transition.endPosition),
        target: vectorToVec3(transition.endTarget),
      },
      easeInOut(progress),
    );

    this.camera.position.set(pose.position.x, pose.position.y, pose.position.z);
    this.targetPoint.set(pose.target.x, pose.target.y, pose.target.z);

    if (this.controls !== null) this.controls.target.copy(this.targetPoint);

    if (progress >= 1) this.transition = null;

    return true;
  }

  /** Сдвигает начало и конец перехода вместе с планетой. */
  private shiftTransition(delta: THREE.Vector3): void {
    if (this.transition === null) return;

    this.transition.startPosition.add(delta);
    this.transition.endPosition.add(delta);
    this.transition.startTarget.add(delta);
    this.transition.endTarget.add(delta);
  }
}

/** Освобождает объект слоя и его внутренние ресурсы. */
function disposeLayer(layer: BuiltLayer): void {
  disposeObject3D(layer.object);
  layer.definition.dispose?.();
}

/** Преобразует `Vector3` в простой вектор. */
function vectorToVec3(vector: THREE.Vector3): { x: number; y: number; z: number } {
  return { x: vector.x, y: vector.y, z: vector.z };
}
