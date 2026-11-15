import { type Vec3 } from '@exo/shared';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';

import { ru } from '../../i18n/ru';
import { three as threeTokens, tokens, toHexString } from '../../styles/theme';
import type { RendererHost } from '../host/RendererHost';
import type { ViewScene } from '../host/ViewScene';
import type { GalaxyData } from './buildGalaxy';
import {
  easeInOut,
  flyToSystemPlan,
  focusPlan,
  overviewCameraPlan,
  type CameraMovePlan,
  type CameraPose,
} from './cameraPlan';

/**
 * Сцена 3D-карты Галактики (задачи 21–22; п. 6, 10.8; U44).
 *
 * Владение `WebGLRenderer`, холстом и CSS2D-слоем передано общему
 * `RendererHost` (U40). Сцена хранит только объекты карты, камеру и контролы,
 * а рендер выполняется по требованию через хост. При переходе в систему все
 * 51 метка скрываются и восстанавливаются при возврате без пересоздания.
 */

/** Состояние камеры, сохраняемое контроллером между кадрами. */
export type CameraState = CameraPose;

/** Настройки сцены карты. */
export interface GalaxySceneOptions {
  /** Данные карты для первого снимка. */
  data: GalaxyData;
  /** `prefers-reduced-motion`: без анимаций камеры (U55). */
  reducedMotion?: boolean;
}

/** Число совпадений поиска, до которого рисуются кольца (п. 6.2, 10.8). */
export const SEARCH_RING_LIMIT = 200;

/** Размер точки звёздного фона: минимум и максимум [px]. */
export const STAR_POINT_MIN_PX = 1.5;
export const STAR_POINT_MAX_PX = 6;

/** Прозрачность фоновых звёзд (п. 6.2). */
export const STAR_BACKGROUND_ALPHA = 0.35;

/** Опорные кольца масштаба [пк] (вне ТЗ, вспомогательная ориентация). */
export const SCALE_RING_RADII_PC = [10, 100, 1000, 5000] as const;

/**
 * Чистый интерфейс 3D-карты.
 *
 * `GalaxyScene` реализует его и `ViewScene`; тесты и React могут подставить
 * собственную заглушку с тем же набором методов.
 */
export interface GalaxyRenderer {
  /** Заменяет данные снимка (позиции, цвета, радиусы). */
  setData(data: GalaxyData): void;
  /** Обновляет только состояние лидеров Топ-50 (п. 6.2). */
  setLeaders(planetIds: readonly string[]): void;
  /** Подсвечивает совпадения поиска кольцом (не более 200). */
  setSearchMatches(planetIds: readonly string[]): void;
  /** Выделяет систему кольцом; null — снять выделение. */
  setSelection(systemIndex: number | null): void;
  /** Подключает CSS2D-метки (пул создаётся один раз, задача 21). */
  setLabels?(labels: readonly CSS2DObject[]): void;
  /** Возвращает камеру к обзорному положению (10.8.8). */
  resetCamera(): void;
  /** Фокусируется на позиции системы (10.8.5). */
  focus(position: Vec3): void;
  /** Плавно подлетает к системе (10.8.6). */
  flyToSystem(position: Vec3): void;
  /** Подписка на завершение перелёта; возвращает функцию отписки. */
  onArrive(callback: () => void): () => void;
  /** Позиция системы по идентификатору планеты; null — планета не размещена. */
  getSystemPosition(planetId: string): Vec3 | null;
  /** Текущее состояние камеры. */
  getCameraState(): CameraState;
  /**
   * Восстанавливает состояние камеры.
   *
   * `durationMs` задаёт плавный возврат (после выхода из системы — 600 мс).
   */
  setCameraState(state: CameraState, options?: CameraRestoreOptions): void;
  /** Запрашивает кадр вручную. */
  requestRender(): void;
  /** Освобождает GPU-ресурсы и обработчики. */
  dispose(): void;
}

/** Настройки восстановления камеры. */
export interface CameraRestoreOptions {
  /** Длительность возврата [мс]; 0 — мгновенно. */
  durationMs?: number;
}

/** Анимация камеры между двумя позами. */
interface CameraAnimation {
  startPosition: THREE.Vector3;
  endPosition: THREE.Vector3;
  startTarget: THREE.Vector3;
  endTarget: THREE.Vector3;
  elapsedMs: number;
  durationMs: number;
  notifyArrive: boolean;
}

/** Ограничивает значение диапазоном. */
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Создаёт 2D-контекст холста или выбрасывает ошибку. */
function canvasContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = canvas.getContext('2d');

  if (context === null) throw new Error('Canvas 2D недоступен');

  return context;
}

/** Текстура-кольцо для выделенной системы. */
function createRingTexture(color: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const context = canvasContext(canvas);

  context.clearRect(0, 0, 128, 128);
  context.strokeStyle = color;
  context.lineWidth = 5;
  context.shadowColor = color;
  context.shadowBlur = 10;
  context.beginPath();
  context.arc(64, 64, 50, 0, Math.PI * 2);
  context.stroke();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;

  return texture;
}

/** Текстура маркера Земли. */
function createDotTexture(color: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const context = canvasContext(canvas);

  context.clearRect(0, 0, 64, 64);
  context.fillStyle = color;
  context.beginPath();
  context.arc(32, 32, 11, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = color;
  context.globalAlpha = 0.45;
  context.lineWidth = 2;
  context.beginPath();
  context.arc(32, 32, 20, 0, Math.PI * 2);
  context.stroke();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;

  return texture;
}

/**
 * Создаёт спрайт с подписью.
 *
 * Размер спрайта пересчитывается по расстоянию до камеры, поэтому подпись
 * остаётся читаемой и в обзоре, и вблизи.
 */
function createTextSprite(text: string, color: string, billboardFactor: number): THREE.Sprite {
  const canvas = document.createElement('canvas');
  const font = `500 48px ${tokens['font-text']}`;
  const measure = canvasContext(canvas);
  measure.font = font;
  const textWidth = Math.ceil(measure.measureText(text).width);
  const padding = 16;
  canvas.width = Math.max(1, textWidth + padding * 2);
  canvas.height = 72;
  const context = canvasContext(canvas);

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.font = font;
  context.textBaseline = 'middle';
  context.fillStyle = color;
  context.fillText(text, padding, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;

  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(material);

  sprite.center.set(0, 0.5);
  sprite.renderOrder = 30;
  sprite.userData['billboardFactor'] = billboardFactor;
  sprite.userData['billboardAspect'] = canvas.width / canvas.height;

  return sprite;
}

/** Освобождает материал и его текстуры. */
function disposeMaterial(material: THREE.Material | THREE.Material[]): void {
  const list = Array.isArray(material) ? material : [material];

  for (const item of list) {
    const map = (item as THREE.Material & { map?: THREE.Texture | null }).map;

    if (map instanceof THREE.Texture) map.dispose();

    item.dispose();
  }
}

/** Освобождает геометрию и материалы объекта вместе с потомками. */
function disposeObject(object: THREE.Object3D): void {
  object.traverse((child) => {
    if (
      child instanceof THREE.Mesh ||
      child instanceof THREE.Points ||
      child instanceof THREE.Line ||
      child instanceof THREE.Sprite
    ) {
      child.geometry.dispose();
      disposeMaterial(child.material);
    }
  });
}

/** Очищает группу, освобождая ресурсы её детей. */
function clearGroup(group: THREE.Group): void {
  for (const child of [...group.children]) {
    group.remove(child);
    disposeObject(child);
  }
}

/** Вершинный шейдер звёздного фона. */
const STAR_VERTEX_SHADER = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_vertex>

  attribute vec3 color;
  attribute float aState;

  uniform float uScale;
  uniform float uPixelRatio;

  varying vec3 vColor;
  varying float vState;

  void main() {
    vColor = color;
    vState = aState;

    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    float minSize = ${STAR_POINT_MIN_PX.toFixed(1)} * uPixelRatio;
    float maxSize = ${STAR_POINT_MAX_PX.toFixed(1)} * uPixelRatio;
    float size = clamp(uScale / max(-mvPosition.z, 1.0), minSize, maxSize);

    // Лидер Топ-50 ярче и крупнее фоновой звезды (п. 6.2).
    if (aState > 0.5 && aState < 2.5) {
      size = clamp(size * 2.0, minSize, maxSize);
    }

    gl_PointSize = size;
    gl_Position = projectionMatrix * mvPosition;

    #include <logdepthbuf_vertex>
  }
`;

/** Фрагментный шейдер звёздного фона. */
const STAR_FRAGMENT_SHADER = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_fragment>

  uniform vec3 uLeaderColor;
  uniform vec3 uAccentColor;
  uniform float uBackgroundAlpha;

  varying vec3 vColor;
  varying float vState;

  void main() {
    #include <logdepthbuf_fragment>

    vec2 offset = gl_PointCoord - vec2(0.5);
    float radius = length(offset);

    if (radius > 0.5) discard;

    vec3 color;
    float alpha;

    if (vState > 2.5) {
      // Совпадение поиска: звезда и кольцо-акцент вокруг неё.
      float ring = smoothstep(0.26, 0.30, radius) * (1.0 - smoothstep(0.40, 0.44, radius));
      float core = 1.0 - smoothstep(0.16, 0.28, radius);
      color = mix(vColor, uAccentColor, ring);
      alpha = max(core, ring);
    } else if (vState > 0.5) {
      // Лидер Топ-50: изумрудный цвет и полная непрозрачность.
      color = uLeaderColor;
      alpha = 1.0 - smoothstep(0.34, 0.5, radius);
    } else {
      // Остальные системы: цвет звезды с приглушённой альфой.
      color = vColor;
      alpha = (1.0 - smoothstep(0.28, 0.5, radius)) * uBackgroundAlpha;
    }

    gl_FragColor = vec4(color, alpha);
  }
`;

/** Снимок состояния метки до скрытия. */
interface LabelSnapshot {
  visible: boolean;
  hidden: boolean;
  ariaHidden: string | null;
  tabIndex: number;
  pointerEvents: string;
}

/**
 * Сцена карты Галактики.
 *
 * Реализует `ViewScene` и старый интерфейс `GalaxyRenderer`: React-компонент
 * продолжает управлять данными, лидерами и метками, а общий `RendererHost`
 * отвечает за WebGL-контекст и отрисовку.
 */
export class GalaxyScene implements ViewScene, GalaxyRenderer {
  /** Идентификатор вида. */
  readonly id = 'galaxy' as const;

  /** Корневая сцена карты. */
  readonly scene = new THREE.Scene();

  /** Камера карты. */
  readonly camera: THREE.PerspectiveCamera;

  /** Текущие данные снимка. */
  private currentData: GalaxyData;

  /** `prefers-reduced-motion`. */
  private readonly reducedMotion: boolean;

  /** Контролы камеры; создаются при подключении к хосту. */
  private controls: OrbitControls | null = null;

  /** Хост, к которому подключена сцена. */
  private host: RendererHost | null = null;

  /** Активная анимация камеры. */
  private animation: CameraAnimation | null = null;

  /** Точка взгляда камеры до создания контролов. */
  private readonly targetPoint = new THREE.Vector3();

  /** CSS2D-метки карты. */
  private labelObjects: readonly CSS2DObject[] = [];

  /** Состояния меток до скрытия при переходе в систему. */
  private readonly labelSnapshots = new Map<HTMLElement, LabelSnapshot>();

  /** Метки скрыты, пока активна сцена системы. */
  private labelsSuppressed = false;

  /** Идентификаторы лидеров Топ-50. */
  private leaderIds: readonly string[] = [];

  /** Идентификаторы совпадений поиска. */
  private searchIds: readonly string[] = [];

  /** Выбранная система. */
  private selectedSystemIndex: number | null = null;

  /** Сцена освобождена. */
  private disposed = false;

  /** Подписчики на завершение перелёта. */
  private readonly arriveCallbacks = new Set<() => void>();

  /** Материал звёздного фона. */
  private readonly starMaterial: THREE.ShaderMaterial;

  /** Точки звёздного фона. */
  private readonly stars: THREE.Points;

  /** Кольца масштаба. */
  private readonly scaleRings = new THREE.Group();

  /** Кольцо выбранной системы. */
  private readonly selectionRing: THREE.Sprite;

  /** Отметка Земли. */
  private readonly earthDot: THREE.Sprite;

  /** Подпись Земли. */
  private readonly earthLabel: THREE.Sprite;

  /**
   * @param options Первый снимок данных и режим движения.
   */
  constructor(options: GalaxySceneOptions) {
    const prefersReducedMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    this.reducedMotion = options.reducedMotion ?? prefersReducedMotion;
    this.currentData = options.data;

    this.scene.background = new THREE.Color(threeTokens.mapBackground);

    const initialPlan = overviewCameraPlan(this.currentData.radiusP95, this.currentData.radiusMax);

    this.camera = new THREE.PerspectiveCamera(55, 1, initialPlan.near, initialPlan.far);
    this.targetPoint.set(initialPlan.target.x, initialPlan.target.y, initialPlan.target.z);
    this.camera.position.set(
      initialPlan.position.x,
      initialPlan.position.y,
      initialPlan.position.z,
    );

    this.starMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uScale: { value: 1 },
        uPixelRatio: { value: 1 },
        uLeaderColor: { value: new THREE.Color(threeTokens.leader) },
        uAccentColor: { value: new THREE.Color(threeTokens.leader) },
        uBackgroundAlpha: { value: STAR_BACKGROUND_ALPHA },
      },
      vertexShader: STAR_VERTEX_SHADER,
      fragmentShader: STAR_FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
    });

    this.stars = new THREE.Points(new THREE.BufferGeometry(), this.starMaterial);
    this.stars.frustumCulled = false;
    this.scene.add(this.stars);

    this.scene.add(this.scaleRings);

    this.selectionRing = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: createRingTexture(`#${toHexString(threeTokens.leader)}`),
        transparent: true,
        depthTest: false,
        depthWrite: false,
      }),
    );
    this.selectionRing.visible = false;
    this.selectionRing.renderOrder = 20;
    this.selectionRing.userData['billboardFactor'] = 0.035;
    this.selectionRing.userData['billboardAspect'] = 1;
    this.scene.add(this.selectionRing);

    this.earthDot = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: createDotTexture(tokens['color-text-inverse']),
        transparent: true,
        depthTest: false,
        depthWrite: false,
      }),
    );
    this.earthDot.userData['billboardFactor'] = 0.02;
    this.earthDot.userData['billboardAspect'] = 1;
    this.earthDot.renderOrder = 25;
    this.scene.add(this.earthDot);

    this.earthLabel = createTextSprite(ru['map.earth'], tokens['color-text-inverse'], 0.035);
    this.earthLabel.userData['billboardFactor'] = 0.035;
    this.earthLabel.position.set(0, 0, 0);
    this.scene.add(this.earthLabel);

    this.rebuildStarGeometry();
    this.rebuildScaleRings();
    this.updateSelectionRing();
    this.applyCameraLimits(initialPlan);
    this.setPose(initialPlan);
  }

  /** Подключает сцену к общему хосту. */
  activate(host: RendererHost): void {
    if (this.disposed) return;

    this.host = host;

    if (this.controls === null) {
      const plan = overviewCameraPlan(this.currentData.radiusP95, this.currentData.radiusMax);
      const controls = new OrbitControls(this.camera, host.canvas);

      controls.target.copy(this.targetPoint);
      controls.enableRotate = plan.controls.enableRotate;
      controls.enableZoom = plan.controls.enableZoom;
      controls.enablePan = plan.controls.enablePan;
      controls.enableDamping = plan.controls.enableDamping;
      controls.dampingFactor = plan.controls.dampingFactor;
      controls.minDistance = plan.controls.minDistance;
      controls.maxDistance = plan.controls.maxDistance;
      controls.addEventListener('change', this.handleControlsChange);
      controls.addEventListener('start', this.handleControlsStart);
      this.controls = controls;
    }

    this.controls.enabled = true;
    this.camera.aspect = host.viewportWidth / host.viewportHeight;
    this.camera.updateProjectionMatrix();
    this.controls.update();
    this.showLabels();
    host.requestRender();
  }

  /** Отключает карту; все метки скрываются до возврата. */
  deactivate(): void {
    if (this.controls !== null) this.controls.enabled = false;

    this.animation = null;
    this.hideLabels();
    this.host = null;
  }

  /**
   * Шаг анимации карты.
   *
   * @param dtSec Время с прошлого кадра [с].
   * @returns true, если нужен новый кадр.
   */
  update(dtSec: number): boolean {
    if (this.disposed) return false;

    const dt = clamp(dtSec, 0, 0.1);
    let animating = false;

    if (this.animation !== null) {
      const animation = this.animation;

      animation.elapsedMs += dt * 1000;
      const progress =
        animation.durationMs <= 0 ? 1 : clamp(animation.elapsedMs / animation.durationMs, 0, 1);
      const eased = easeInOut(progress);

      this.camera.position.lerpVectors(animation.startPosition, animation.endPosition, eased);
      this.targetPoint.lerpVectors(animation.startTarget, animation.endTarget, eased);
      if (this.controls !== null) this.controls.target.copy(this.targetPoint);

      if (progress >= 1) {
        const notify = animation.notifyArrive;
        this.animation = null;
        if (notify) this.notifyArrive();
      } else {
        animating = true;
      }
    }

    const changed = this.controls?.update() ?? false;

    this.updateBillboards();

    return animating || changed;
  }

  /** Обновляет размеры точек звёзд под новый холст (задача 21). */
  resize(width: number, height: number, pixelRatio: number): void {
    void width;
    const scaleUniform = this.starMaterial.uniforms['uScale'];
    const ratioUniform = this.starMaterial.uniforms['uPixelRatio'];
    const bufferHeight = Math.max(1, height * pixelRatio);

    if (scaleUniform !== undefined) scaleUniform.value = bufferHeight * 0.5 * 8;
    if (ratioUniform !== undefined) ratioUniform.value = pixelRatio;

    this.requestRender();
  }

  /** Запрашивает перерисовку через хост. */
  requestRender(): void {
    this.host?.requestRender();
  }

  /** Заменяет данные снимка. */
  setData(data: GalaxyData): void {
    this.currentData = data;
    this.rebuildStarGeometry();
    this.rebuildScaleRings();
    this.updateCameraLimits();

    if (this.selectedSystemIndex !== null && this.selectedSystemIndex >= data.systems.length) {
      this.selectedSystemIndex = null;
    }

    this.updateSelectionRing();
    this.rebuildPointStates();

    const plan = overviewCameraPlan(data.radiusP95, data.radiusMax);

    this.animateTo(
      {
        ...plan,
        durationMs: this.reducedMotion ? 0 : 800,
        easing: 'ease-in-out',
        animate: !this.reducedMotion,
      },
      false,
    );
  }

  /** Обновляет лидеров Топ-50. */
  setLeaders(planetIds: readonly string[]): void {
    this.leaderIds = [...planetIds];
    this.rebuildPointStates();
    this.requestRender();
  }

  /** Обновляет совпадения поиска. */
  setSearchMatches(planetIds: readonly string[]): void {
    this.searchIds = [...planetIds];
    this.rebuildPointStates();
    this.requestRender();
  }

  /** Выделяет систему кольцом. */
  setSelection(systemIndex: number | null): void {
    this.selectedSystemIndex = systemIndex;
    this.updateSelectionRing();
    this.requestRender();
  }

  /** Подключает CSS2D-метки пула. */
  setLabels(labels: readonly CSS2DObject[]): void {
    for (const object of this.labelObjects) this.scene.remove(object);

    this.labelObjects = [...labels];

    for (const object of this.labelObjects) this.scene.add(object);

    this.labelSnapshots.clear();

    if (this.labelsSuppressed) this.hideLabels();

    this.requestRender();
  }

  /** Возвращает камеру к обзору. */
  resetCamera(): void {
    const plan = overviewCameraPlan(this.currentData.radiusP95, this.currentData.radiusMax);

    this.animateTo(
      {
        ...plan,
        durationMs: this.reducedMotion ? 0 : 800,
        easing: 'ease-in-out',
        animate: !this.reducedMotion,
      },
      false,
    );
  }

  /** Фокусируется на системе. */
  focus(position: Vec3): void {
    const viewDirection = this.camera.position.clone().sub(this.currentTarget());
    const plan = focusPlan(position, {
      reducedMotion: this.reducedMotion,
      direction: { x: viewDirection.x, y: viewDirection.y, z: viewDirection.z },
    });

    this.animateTo(plan, false);
  }

  /** Плавно подлетает к системе. */
  flyToSystem(position: Vec3): void {
    const viewDirection = this.camera.position.clone().sub(this.currentTarget());
    const plan = flyToSystemPlan(position, {
      reducedMotion: this.reducedMotion,
      direction: { x: viewDirection.x, y: viewDirection.y, z: viewDirection.z },
    });

    this.animateTo(plan, true);
  }

  /** Подписка на завершение перелёта. */
  onArrive(callback: () => void): () => void {
    this.arriveCallbacks.add(callback);

    return () => {
      this.arriveCallbacks.delete(callback);
    };
  }

  /** Позиция системы по идентификатору планеты. */
  getSystemPosition(planetId: string): Vec3 | null {
    const index = this.currentData.systemIndexByPlanet.get(planetId);

    if (index === undefined) return null;

    const system = this.currentData.systems[index];

    return system === undefined ? null : { ...system.position };
  }

  /** Текущее состояние камеры. */
  getCameraState(): CameraState {
    const target = this.currentTarget();

    return {
      position: { x: this.camera.position.x, y: this.camera.position.y, z: this.camera.position.z },
      target: { x: target.x, y: target.y, z: target.z },
    };
  }

  /** Восстанавливает состояние камеры, при необходимости плавно. */
  setCameraState(state: CameraState, options: CameraRestoreOptions = {}): void {
    const durationMs = options.durationMs ?? 0;

    if (durationMs <= 0 || this.reducedMotion) {
      this.setPose(state);
      this.requestRender();
      return;
    }

    this.startAnimation(
      {
        position: { ...state.position },
        target: { ...state.target },
      },
      durationMs,
      false,
    );
  }

  /** Освобождает ресурсы сцены и обработчики. */
  dispose(): void {
    if (this.disposed) return;

    this.disposed = true;
    this.animation = null;
    this.arriveCallbacks.clear();

    if (this.controls !== null) {
      this.controls.removeEventListener('change', this.handleControlsChange);
      this.controls.removeEventListener('start', this.handleControlsStart);
      this.controls.dispose();
      this.controls = null;
    }

    this.labelObjects = [];
    this.labelSnapshots.clear();
    this.scene.traverse((object) => disposeObject(object));
    this.scene.clear();
    this.host = null;
  }

  /** Обработчик изменения камеры. */
  private readonly handleControlsChange = (): void => {
    this.requestRender();
  };

  /** Любое взаимодействие пользователя отменяет программный перелёт. */
  private readonly handleControlsStart = (): void => {
    this.animation = null;
  };

  /** Создаёт буферы позиций, цветов и состояний звёзд. */
  private createStarGeometry(data: GalaxyData): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();

    geometry.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(data.colors, 3));
    geometry.setAttribute(
      'aState',
      new THREE.BufferAttribute(new Float32Array(data.systems.length), 1),
    );

    return geometry;
  }

  /** Пересоздаёт буферы звёзд. */
  private rebuildStarGeometry(): void {
    const oldGeometry = this.stars.geometry;

    this.stars.geometry = this.createStarGeometry(this.currentData);
    oldGeometry.dispose();
    this.rebuildPointStates();
  }

  /** Пересчитывает атрибут состояния точек. */
  private rebuildPointStates(): void {
    const count = this.currentData.systems.length;
    const leaderSet = new Set(this.leaderIds);
    const searchSet = new Set(this.searchIds);
    const leaderFlags = new Uint8Array(count);
    const searchFlags = new Uint8Array(count);

    for (const [planetId, index] of this.currentData.systemIndexByPlanet) {
      if (index < 0 || index >= count) continue;
      if (leaderSet.has(planetId)) leaderFlags[index] = 1;
      if (searchSet.has(planetId)) searchFlags[index] = 1;
    }

    const searchActive = searchSet.size <= SEARCH_RING_LIMIT;
    const states = new Float32Array(count);

    for (let index = 0; index < count; index += 1) {
      if (searchActive && searchFlags[index] === 1) {
        states[index] = 3;
      } else if (leaderFlags[index] === 1) {
        states[index] = 1;
      }
    }

    this.stars.geometry.setAttribute('aState', new THREE.BufferAttribute(states, 1));
  }

  /** Пересчитывает опорные кольца масштаба. */
  private rebuildScaleRings(): void {
    clearGroup(this.scaleRings);

    for (const radius of SCALE_RING_RADII_PC) {
      if (radius > 1.2 * this.currentData.radiusMax) continue;

      const segments = 128;
      const points: THREE.Vector3[] = [];

      for (let index = 0; index < segments; index += 1) {
        const angle = (index / segments) * Math.PI * 2;
        points.push(new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius));
      }

      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      const material = new THREE.LineBasicMaterial({
        color: threeTokens.mapRing,
        transparent: true,
        opacity: threeTokens.mapRingOpacity,
        depthWrite: false,
      });

      this.scaleRings.add(new THREE.LineLoop(geometry, material));

      const label = createTextSprite(
        ru['map.scaleRing'].replace('{value}', String(radius)),
        tokens['map-ring'],
        0.035,
      );

      label.position.set(radius, 0, 0);
      this.scaleRings.add(label);
    }
  }

  /** Обновляет кольцо выбранной системы. */
  private updateSelectionRing(): void {
    if (
      this.selectedSystemIndex === null ||
      this.selectedSystemIndex < 0 ||
      this.selectedSystemIndex >= this.currentData.systems.length
    ) {
      this.selectionRing.visible = false;
      return;
    }

    const system = this.currentData.systems[this.selectedSystemIndex];

    if (system === undefined) {
      this.selectionRing.visible = false;
      return;
    }

    this.selectionRing.position.set(system.position.x, system.position.y, system.position.z);
    this.selectionRing.visible = true;
  }

  /** Применяет лимиты камеры к новому снимку. */
  private updateCameraLimits(): void {
    const plan = overviewCameraPlan(this.currentData.radiusP95, this.currentData.radiusMax);

    this.camera.near = plan.near;
    this.camera.far = plan.far;
    this.camera.updateProjectionMatrix();

    if (this.controls !== null) {
      this.controls.minDistance = plan.controls.minDistance;
      this.controls.maxDistance = plan.controls.maxDistance;
    }
  }

  /** Применяет план камеры к текущим контролам. */
  private applyCameraLimits(plan: {
    controls: {
      minDistance: number;
      maxDistance: number;
      enableRotate: boolean;
      enableZoom: boolean;
      enablePan: boolean;
      enableDamping: boolean;
      dampingFactor: number;
    };
  }): void {
    if (this.controls === null) return;

    this.controls.minDistance = plan.controls.minDistance;
    this.controls.maxDistance = plan.controls.maxDistance;
    this.controls.enableRotate = plan.controls.enableRotate;
    this.controls.enableZoom = plan.controls.enableZoom;
    this.controls.enablePan = plan.controls.enablePan;
    this.controls.enableDamping = plan.controls.enableDamping;
    this.controls.dampingFactor = plan.controls.dampingFactor;
  }

  /** Текущая точка взгляда: контролы важнее сохранённой позы. */
  private currentTarget(): THREE.Vector3 {
    return this.controls?.target ?? this.targetPoint;
  }

  /** Мгновенно ставит камеру в позу. */
  private setPose(pose: CameraPose): void {
    this.camera.position.set(pose.position.x, pose.position.y, pose.position.z);
    this.targetPoint.set(pose.target.x, pose.target.y, pose.target.z);

    if (this.controls !== null) {
      this.controls.target.copy(this.targetPoint);
      this.controls.update();
    }

    this.requestRender();
  }

  /** Сообщает подписчикам о завершении перелёта. */
  private notifyArrive(): void {
    for (const callback of [...this.arriveCallbacks]) callback();
  }

  /** Запускает анимацию камеры или ставит позу мгновенно. */
  private animateTo(plan: CameraMovePlan, notifyOnArrive: boolean): void {
    this.animation = null;

    if (!plan.animate || plan.durationMs <= 0 || this.reducedMotion) {
      this.setPose(plan);
      if (notifyOnArrive) this.notifyArrive();
      this.requestRender();
      return;
    }

    this.startAnimation(plan, plan.durationMs, notifyOnArrive);
  }

  /** Создаёт анимацию между текущей и заданной позой. */
  private startAnimation(pose: CameraPose, durationMs: number, notifyOnArrive: boolean): void {
    this.animation = {
      startPosition: this.camera.position.clone(),
      endPosition: new THREE.Vector3(pose.position.x, pose.position.y, pose.position.z),
      startTarget: this.currentTarget().clone(),
      endTarget: new THREE.Vector3(pose.target.x, pose.target.y, pose.target.z),
      elapsedMs: 0,
      durationMs,
      notifyArrive: notifyOnArrive,
    };

    this.requestRender();
  }

  /** Пересчитывает размеры подписей под расстояние до камеры. */
  private updateBillboards(): void {
    this.scene.traverse((object) => {
      if (!(object instanceof THREE.Sprite)) return;

      const factor = object.userData['billboardFactor'] as number | undefined;

      if (factor === undefined) return;

      const aspect = (object.userData['billboardAspect'] as number | undefined) ?? 1;
      const distance = Math.max(0.01, this.camera.position.distanceTo(object.position));
      const height = distance * factor;

      object.scale.set(height * aspect, height, 1);
    });
  }

  /** Скрывает все 51 метку без пересоздания DOM. */
  private hideLabels(): void {
    this.labelsSuppressed = true;

    for (const object of this.labelObjects) {
      const element = object.element;

      if (element === null) continue;

      if (!this.labelSnapshots.has(element)) {
        this.labelSnapshots.set(element, {
          visible: object.visible,
          hidden: element.hidden,
          ariaHidden: element.getAttribute('aria-hidden'),
          tabIndex: element.tabIndex,
          pointerEvents: element.style.pointerEvents,
        });
      }

      object.visible = false;
      element.hidden = true;
      element.setAttribute('aria-hidden', 'true');
      element.tabIndex = -1;
      element.style.pointerEvents = 'none';
    }
  }

  /** Восстанавливает метки после возврата на карту. */
  private showLabels(): void {
    if (!this.labelsSuppressed) return;

    this.labelsSuppressed = false;

    for (const object of this.labelObjects) {
      const element = object.element;

      if (element === null) continue;

      const snapshot = this.labelSnapshots.get(element);

      if (snapshot === undefined) continue;

      object.visible = snapshot.visible;
      element.hidden = snapshot.hidden;
      element.tabIndex = snapshot.tabIndex;
      element.style.pointerEvents = snapshot.pointerEvents;

      if (snapshot.ariaHidden === null) element.removeAttribute('aria-hidden');
      else element.setAttribute('aria-hidden', snapshot.ariaHidden);
    }

    this.labelSnapshots.clear();
    this.requestRender();
  }
}

/** Псевдоним класса для кода задачи 21. */
export const createGalaxyScene = (options: GalaxySceneOptions): GalaxyScene =>
  new GalaxyScene(options);
