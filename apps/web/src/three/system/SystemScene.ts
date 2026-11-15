import {
  buildPlanetStyle,
  buildStarStyle,
  CAMERA_TRANSITION_MS,
  computeRotation,
  easeInOut,
  fnv1a32,
  interpolateCameraPose,
  makeScaleModel,
  missingParams,
  normalizeAngle,
  normalizeEccentricity,
  orbitAvailability,
  sampleEllipse,
  SYSTEM_CAMERA_FOV,
  SYSTEM_NEAR_PLANE,
  systemCameraPlan,
  type CameraPose,
  type AtmosphereHints,
  type ModelSettings,
  type ScaleMode,
  type ScaleModel,
  type SystemCameraPlan,
} from '@exo/shared';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

import { three as threeTokens } from '../../styles/theme';
import { formatMessage, ru } from '../../i18n/ru';
import type { PlanetDetail } from '../../workers/protocol';
import { qualityMonitor } from '../host/quality';
import type { RendererHost } from '../host/RendererHost';
import type { ViewScene } from '../host/ViewScene';
import { disposeObject3D } from './disposeObject3D';
// Слои и движения регистрируются в реестрах при импорте (задачи 23–24).
import './layers/hzLayer';
import './layers/keplerMotion';
import './layers/orbitLayer';
import './spin/spinProvider';
import './stubs/stubFactories';
import {
  layerVisible,
  listSystemLayers,
  type SystemLayerDefinition,
  type SystemLayerStatusMap,
} from './layers';
import { createSystemPicking, type SystemPickingController } from './picking';
import {
  createSystemContext,
  DEFAULT_SYSTEM_TOGGLES,
  type SceneTarget,
  type SystemContext,
  type SystemMotion,
  type SystemToggles,
} from './runtime';
import { SimClock } from './SimClock';
import {
  createSpinController,
  createVisual,
  type PlanetVisualHandle,
  type SpinCtx,
  type StarVisualHandle,
} from './visuals';

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

/** Отладочная камера сцены системы (задача 31). */
export interface SystemDebugCamera {
  /** Позиция камеры. */
  position: [number, number, number];
  /** Точка взгляда. */
  target: [number, number, number];
  /** Расстояние до точки взгляда. */
  distance: number;
}

/** Отладочные объекты сцены системы (задача 31). */
export interface SystemDebugObjects {
  /** Звезда: позиция и радиус в единицах сцены. */
  star: { pos: [number, number, number]; radius: number };
  /** Планета: позиция и радиус в единицах сцены. */
  planet: { pos: [number, number, number]; radius: number };
}

/** Отладочная орбита в единицах сцены (задача 31). */
export interface SystemDebugOrbit {
  /** Точки контура. */
  points: [number, number, number][];
  /** Единиц сцены на астрономическую единицу. */
  unitsPerAU: number;
}

/** Отладочная зона обитаемости (задача 31). */
export interface SystemDebugHz {
  /** Внутренний радиус в единицах сцены. */
  inner: number;
  /** Внешний радиус в единицах сцены. */
  outer: number;
  /** Слой видим. */
  visible: boolean;
}

/** Отладочный статус слоя (задача 31). */
export interface SystemDebugLayer {
  /** Слой доступен по данным. */
  available: boolean;
  /** Слой видим. */
  visible: boolean;
  /** Причина недоступности. */
  reason: string | null;
}

/** Отладочное вращение планеты (задача 31). */
export interface SystemDebugRotation {
  /** Угол поверхности [рад]. */
  angle: number;
  /** Ось вращения в мировых координатах. */
  axis: [number, number, number];
  /** Наклон оси [°]. */
  tiltDeg: number;
  /** Режим вращения. */
  mode: 'locked' | 'assumed';
  /** Период вращения [сут]. */
  periodDays: number;
}

/** Преобразует `Vector3` в кортеж. */
function toTuple(vector: THREE.Vector3): [number, number, number] {
  return [vector.x, vector.y, vector.z];
}

/** Модель-заглушка для случая, когда радиус звезды неизвестен (задача 27). */
function placeholderScale(): ScaleModel {
  return {
    mode: 'overview',
    planetRadius: 1,
    starRadius: 1,
    unitsPerAU: 1,
    nominal: true,
    nominalStar: true,
    nominalPlanet: true,
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
  private starVisual: StarVisualHandle | null = null;

  /** Заглушка или фабричный объект планеты. */
  private planetVisual: PlanetVisualHandle | null = null;

  /** Мировая позиция звезды: начало координат сцены. */
  private readonly sunWorld = new THREE.Vector3(0, 0, 0);

  /** Цвет света звезды из `StarStyle.sunColor`. */
  private sunColor: [number, number, number] = [1, 1, 1];

  /** Отписка от монитора качества. */
  private unsubscribeQuality: (() => void) | null = null;

  /** Построенные слои. */
  private builtLayers: BuiltLayer[] = [];

  /** Опубликованные статусы слоёв. */
  private layerStatuses: SystemLayerStatusMap = {};

  /** Контролы камеры. */
  private controls: OrbitControls | null = null;

  /** Свет звезды: цвет и яркость стиля передаются на планету. */
  private readonly starLight = new THREE.PointLight(threeTokens.light, 2.2, 0, 0);

  /** Рассеянный свет для заглушки звезды (U38). */
  private readonly hemiLight = new THREE.HemisphereLight(
    threeTokens.light,
    threeTokens.lightGround,
    0.35,
  );

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

  /** Подсказки об атмосфере из Exo.MAST (задача 28; U52). */
  private hints: AtmosphereHints | null = null;

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

    const light = this.starLight;
    light.position.set(0, 0, 0);
    light.name = 'star-light';
    this.scene.add(light);

    this.hemiLight.name = 'stub-hemisphere-light';
    this.hemiLight.visible = false;
    this.scene.add(this.hemiLight);

    const ambient = new THREE.AmbientLight(threeTokens.light, 0.22);
    ambient.name = 'ambient-light';
    this.scene.add(ambient);

    this.buildContents();

    this.unsubscribeQuality = qualityMonitor.subscribe((level) => {
      this.starVisual?.setQuality(level);
      this.planetVisual?.setQuality(level);
    });
  }

  /** Модель масштаба; null — звезда без радиуса, показывается заглушка. */
  get scaleModel(): ScaleModel | null {
    return this.model;
  }

  /** Доступна ли звезда как цель камеры и выбора (U38). */
  get starAvailable(): boolean {
    return this.hasScale && !this.detail.gaps.starStub;
  }

  /** Причина недоступности звезды из недостающих параметров (11.6). */
  private get starUnavailableReason(): string {
    const labels = missingParams(this.detail, 'star').map((item) => item.label);

    return formatMessage(ru['scene.starMissing'], {
      list: labels.length === 0 ? ru['scene.gap.starFallback'] : labels.join(', '),
    });
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

  // --- 31: отладочный доступ (только чтение; sim.* — тестовый режим) ---

  /** Камера: позиция, точка взгляда и расстояние. */
  get debugCamera(): SystemDebugCamera {
    const target = this.controls?.target ?? this.targetPoint;

    return {
      position: toTuple(this.camera.position),
      target: toTuple(target),
      distance: this.camera.position.distanceTo(target),
    };
  }

  /** Звезда и планета в единицах сцены. */
  get debugObjects(): SystemDebugObjects {
    const scale = this.model ?? placeholderScale();

    return {
      star: { pos: [0, 0, 0], radius: scale.starRadius },
      planet: { pos: toTuple(this.planetGroup.position), radius: scale.planetRadius },
    };
  }

  /** Идентификатор построенной планеты сцены. */
  get debugPlanetId(): string {
    return this.detail.id;
  }

  /** Текущий режим масштаба. */
  get debugScaleMode(): ScaleMode {
    return this.mode;
  }

  /** Настройки и границы HZ, с которыми построена сцена (тестовая диагностика). */
  get debugInfo(): {
    hzBounds: ModelSettings['hzBounds'];
    detailHz: PlanetDetail['hz'];
    scaleMode: ScaleMode;
  } {
    return {
      hzBounds: this.settings.hzBounds,
      detailHz: this.detail.hz,
      scaleMode: this.mode,
    };
  }

  /** Признаки заглушек звезды и планеты (п. 9.2). */
  get debugStub(): { planet: boolean; star: boolean } {
    return {
      planet: this.detail.gaps.planetStub,
      star: this.detail.gaps.starStub,
    };
  }

  /**
   * Контур орбиты в единицах сцены.
   *
   * @param segments Число точек контура; по умолчанию 360.
   * @returns Точки и масштаб или null, если орбита недоступна.
   */
  debugOrbit(segments = 360): SystemDebugOrbit | null {
    if (!this.hasScale || this.model === null) return null;

    const availability = orbitAvailability(this.detail.resolved, this.model);

    if (!availability.available) return null;

    const distance = this.detail.resolved.d.value;

    if (distance === null) return null;

    const model = this.model;
    const eccentricity = this.detail.resolved.e.value ?? 0;
    const points = sampleEllipse(distance, eccentricity, segments).map(([x, y, z]) =>
      toTuple(new THREE.Vector3(model.mapAU(x), model.mapAU(y), model.mapAU(z))),
    );

    return { points, unitsPerAU: model.unitsPerAU };
  }

  /** Радиусы зоны обитаемости в единицах сцены. */
  get debugHz(): SystemDebugHz | null {
    const layer = this.builtLayers.find((item) => item.definition.id === 'hz');

    if (layer === undefined || !layer.object.visible) return null;

    const mesh = layer.object.children.find(
      (child): child is THREE.Mesh => child instanceof THREE.Mesh,
    );
    const inner = mesh?.userData['innerRadius'];
    const outer = mesh?.userData['outerRadius'];

    if (typeof inner !== 'number' || typeof outer !== 'number') return null;

    return { inner, outer, visible: layer.object.visible };
  }

  /** Доступность и видимость зарегистрированных слоёв. */
  get debugLayers(): Record<string, SystemDebugLayer> {
    const result: Record<string, SystemDebugLayer> = {};

    for (const definition of listSystemLayers()) {
      const status = this.layerStatuses[definition.id];
      const built = this.builtLayers.find((item) => item.definition.id === definition.id);

      result[definition.id] = {
        available: status?.available ?? false,
        visible: built?.object.visible ?? false,
        reason: status?.reason ?? null,
      };
    }

    return result;
  }

  /** Текущее вращение поверхности планеты (п. 11.5). */
  get debugRotation(): SystemDebugRotation {
    const spec = computeRotation(this.detail.resolved, buildPlanetStyle(this.detail));
    const surface = this.planetVisual?.surface ?? null;
    const axisGroup = this.planetVisual?.axisGroup ?? null;
    const angle =
      surface === null
        ? spec.theta0
        : normalizeAngle(2 * Math.atan2(surface.quaternion.y, surface.quaternion.w));
    const axis =
      axisGroup === null
        ? ([0, 1, 0] as [number, number, number])
        : toTuple(new THREE.Vector3(0, 1, 0).applyQuaternion(axisGroup.quaternion));

    return {
      angle,
      axis,
      tiltDeg: spec.tiltDeg,
      mode: spec.mode,
      periodDays: spec.periodDays,
    };
  }

  /** Прошедшие модельные сутки орбиты. */
  get debugDays(): number {
    return this.sim.days();
  }

  /** Накопленные часы вращения. */
  get debugSpinHours(): number {
    return this.sim.spinHours();
  }

  /** Множитель скорости часов (тестовый режим). */
  debugSetTimeScale(scale: number): void {
    this.sim.setTimeScale(scale);
  }

  /** Продвигает модельное время и сразу применяет его к сцене. */
  debugAdvanceDays(days: number): void {
    this.sim.advanceDays(days);
    this.update(0);
    this.host?.requestRender();
  }

  /** Продвигает часы вращения и сразу применяет их к сцене. */
  debugAdvanceHours(hours: number): void {
    this.sim.advanceHours(hours);
    this.update(0);
    this.host?.requestRender();
  }

  /** Приостанавливает часы сцены. */
  debugPause(): void {
    this.sim.pause();
  }

  /** Возобновляет часы сцены. */
  debugResume(): void {
    this.sim.resume();
  }

  // --- /31 ---

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
        starUnavailableReason: this.starUnavailableReason,
        isStub: (target) =>
          target === 'planet' ? this.detail.gaps.planetStub : this.detail.gaps.starStub,
        missing: (target) =>
          missingParams(this.detail, target === 'star' ? 'star' : 'all').map((item) => item.label),
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

    qualityMonitor.onFrame(dtSec * 1000);

    const days = this.sim.advance(dtSec);
    let moved = false;

    if (this.hasScale) {
      const [x, y, z] = this.context.motion.positionAU(days);
      const mapAU = (value: number): number => this.context.scale.mapAU(value);
      const next = new THREE.Vector3(mapAU(x), mapAU(y), mapAU(z));
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

    const spinCtx: SpinCtx = {
      scene: this.context,
      timeSec: this.sim.elapsedSeconds,
      simDays: days,
    };

    this.starVisual?.update(dtSec, this.sim.elapsedSeconds);

    if (this.planetVisual !== null) {
      this.planetVisual.update(dtSec, spinCtx);
      this.planetVisual.setSunState(this.sunWorld, this.sunColor);
    }

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
      this.planetVisual !== null ||
      this.starVisual !== null
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
      (this.callbacks.toast ?? (() => undefined))(this.starUnavailableReason);
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

  /**
   * Применяет подсказки об атмосфере без перестройки сцены (задача 28).
   *
   * @param hints Молекулы Exo.MAST; null — базовый вид.
   */
  setHints(hints: AtmosphereHints | null): void {
    this.hints = hints;
    this.planetVisual?.setHints(hints);
    this.host?.requestRender();
  }

  /** Освобождает GPU-ресурсы и обработчики. */
  dispose(): void {
    if (this.disposed) return;

    this.disposed = true;
    this.deactivate();
    this.unsubscribeQuality?.();
    this.unsubscribeQuality = null;
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
    this.sim = new SimClock(this.detail.resolved.P.value, {
      reducedMotion: this.reducedMotion,
    });

    this.context = createSystemContext({
      detail: this.detail,
      settings: this.settings,
      scale,
      sim: this.sim,
      toggles: this.toggles,
      motion: this.explicitMotion,
    });

    if (!this.hasScale) this.activeTarget = 'star';

    const starStyle = buildStarStyle(this.detail.resolved, fnv1a32(this.detail.id));
    const sunColor: [number, number, number] = this.detail.gaps.starStub
      ? [1, 1, 1]
      : [starStyle.sunColor[0], starStyle.sunColor[1], starStyle.sunColor[2]];

    this.sunColor = sunColor;
    this.sunWorld.set(0, 0, 0);

    this.starLight.color.setRGB(sunColor[0], sunColor[1], sunColor[2]);
    this.starLight.intensity = this.detail.gaps.starStub ? 0.4 : 2.2 * starStyle.brightness;
    this.hemiLight.visible = this.detail.gaps.starStub;

    this.starVisual = createVisual('star', this.context);
    this.starGroup.add(this.starVisual.root);

    if (this.hasScale) {
      this.planetVisual = createVisual('planet', this.context);
      this.planetGroup.add(this.planetVisual.root);

      const [x, y, z] = this.context.motion.positionAU(0);

      this.planetGroup.position.set(scale.mapAU(x), scale.mapAU(y), scale.mapAU(z));

      this.planetVisual.setSunState(this.sunWorld, this.sunColor);
      this.planetVisual.attachSpin(createSpinController(this.planetVisual, this.detail, this.sim));
      // Подсказки переживают перестройку сцены (задача 28).
      this.planetVisual.setHints(this.hints);
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
      this.starGroup.remove(this.starVisual.root);
      this.starVisual.dispose();
      this.starVisual = null;
    }

    if (this.planetVisual !== null) {
      this.planetGroup.remove(this.planetVisual.root);
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
