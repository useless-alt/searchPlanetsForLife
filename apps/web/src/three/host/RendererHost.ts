import * as THREE from 'three';
import { CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';

import { three as threeTokens } from '../../styles/theme';
import type { ViewScene } from './ViewScene';

/**
 * Общий хост WebGL-сцены (задача 22; п. 9.1, U40).
 *
 * Один экземпляр владеет единственным `WebGLRenderer`, холстом, CSS2D-слоем
 * и `ResizeObserver`. Виды (`galaxy`, `system`) переключаются через
 * `setScene`, поэтому при переходе «карта ↔ система» контекст не теряется
 * и холст не пересоздаётся.
 *
 * Рендер выполняется по требованию: кадр рисуется только после
 * `requestRender()`, изменения размера, возврата вкладки или пока
 * `ViewScene.update()` сообщает о необходимости нового кадра. При скрытой
 * вкладке цикл останавливается.
 */

/** Настройки общего хоста. */
export interface RendererHostOptions {
  /** Фон сцены; по умолчанию токен `color-space`. */
  background?: number;
  /** Ограничение `devicePixelRatio`; по умолчанию 2. */
  maxPixelRatio?: number;
  /** Класс CSS2D-слоя (для стилей конкретного вида). */
  labelClassName?: string;
  /** `prefers-reduced-motion`: переходы без анимации. */
  reducedMotion?: boolean;
}

/** Класс DOM-узла WebGL-холста. */
export const VIEW_CANVAS_CLASS = 'view-canvas';

/** Класс DOM-узла CSS2D-слоя по умолчанию. */
export const VIEW_LABELS_CLASS = 'view-labels';

/** Класс затемняющего слоя перехода между видами. */
export const VIEW_FADE_CLASS = 'view-fade';

/** Ограничивает значение диапазоном. */
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Определяет, скрыта ли вкладка. */
function isDocumentHidden(): boolean {
  return typeof document !== 'undefined' && document.visibilityState === 'hidden';
}

/**
 * Единственный WebGL-хост приложения.
 *
 * @example
 * const host = new RendererHost(container);
 * host.setScene(systemScene, { fadeMs: 200 });
 */
export class RendererHost {
  /** Единственный WebGL-рендерер. */
  readonly renderer: THREE.WebGLRenderer;

  /** Слой CSS2D-меток. */
  readonly labelRenderer: CSS2DRenderer;

  /** Контейнер, в который встроены холст и слой меток. */
  readonly container: HTMLElement;

  /** Текущая сцена; null — хост ещё не подключён. */
  private activeScene: ViewScene | null = null;

  /** Затемняющий слой для перехода между видами. */
  private readonly fadeOverlay: HTMLDivElement;

  /** Наблюдатель за размером контейнера. */
  private readonly resizeObserver: ResizeObserver | null = null;

  /** Ограничение плотности пикселей. */
  private readonly maxPixelRatio: number;

  /** `prefers-reduced-motion`. */
  private readonly reducedMotion: boolean;

  /** Текущая ширина холста [CSS px]. */
  private width = 1;

  /** Текущая высота холста [CSS px]. */
  private height = 1;

  /** Есть ли неотрисованные изменения. */
  private dirty = true;

  /** Идентификатор запрошенного кадра; 0 — кадр не запланирован. */
  private frameId = 0;

  /** Идёт отрисовка кадра. */
  private inFrame = false;

  /** Время предыдущего кадра [мс]; 0 — первый кадр после паузы. */
  private lastFrameTime = 0;

  /** WebGL-контекст потерян. */
  private contextLost = false;

  /** Хост освобождён. */
  private disposed = false;

  /**
   * @param container Контейнер сцены.
   * @param options Настройки фона, плотности пикселей и меток.
   */
  constructor(container: HTMLElement, options: RendererHostOptions = {}) {
    this.container = container;
    this.maxPixelRatio = Math.max(1, options.maxPixelRatio ?? 2);
    this.reducedMotion = options.reducedMotion ?? prefersReducedMotion();

    if (typeof window !== 'undefined' && window.getComputedStyle(container).position === 'static') {
      container.style.position = 'relative';
    }

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      logarithmicDepthBuffer: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setClearColor(options.background ?? threeTokens.space, 1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.domElement.className = VIEW_CANVAS_CLASS;
    Object.assign(this.renderer.domElement.style, {
      display: 'block',
      width: '100%',
      height: '100%',
      position: 'absolute',
      inset: '0',
    });
    container.appendChild(this.renderer.domElement);

    this.labelRenderer = new CSS2DRenderer();
    this.labelRenderer.domElement.className = options.labelClassName ?? VIEW_LABELS_CLASS;
    Object.assign(this.labelRenderer.domElement.style, {
      position: 'absolute',
      inset: '0',
      pointerEvents: 'none',
    });
    container.appendChild(this.labelRenderer.domElement);

    this.fadeOverlay = document.createElement('div');
    this.fadeOverlay.className = VIEW_FADE_CLASS;
    Object.assign(this.fadeOverlay.style, {
      position: 'absolute',
      inset: '0',
      pointerEvents: 'none',
      opacity: '0',
      background: `#${threeTokens.space.toString(16).padStart(6, '0')}`,
    });
    container.appendChild(this.fadeOverlay);

    this.handleContextLost = this.handleContextLost.bind(this);
    this.handleContextRestored = this.handleContextRestored.bind(this);
    this.handleVisibilityChange = this.handleVisibilityChange.bind(this);
    this.handleWindowResize = this.handleWindowResize.bind(this);
    this.frame = this.frame.bind(this);

    const ResizeObserverConstructor = globalThis.ResizeObserver;
    this.resizeObserver =
      typeof ResizeObserverConstructor === 'function'
        ? new ResizeObserverConstructor(() => this.resize())
        : null;

    this.resizeObserver?.observe(container);
    window.addEventListener('resize', this.handleWindowResize);
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
    this.renderer.domElement.addEventListener('webglcontextlost', this.handleContextLost);
    this.renderer.domElement.addEventListener('webglcontextrestored', this.handleContextRestored);

    this.resize();
  }

  /** WebGL-холст. */
  get canvas(): HTMLCanvasElement {
    return this.renderer.domElement;
  }

  /** DOM-узел CSS2D-меток. */
  get labelsElement(): HTMLElement {
    return this.labelRenderer.domElement;
  }

  /** Текущая сцена. */
  get scene(): ViewScene | null {
    return this.activeScene;
  }

  /** Ширина холста [CSS px]. */
  get viewportWidth(): number {
    return this.width;
  }

  /** Высота холста [CSS px]. */
  get viewportHeight(): number {
    return this.height;
  }

  /**
   * Подключает вид к хосту.
   *
   * Предыдущий вид получает `deactivate()`; его ресурсы не освобождаются,
   * чтобы возврат к нему не стоил повторной загрузки. `fadeMs` задаёт
   * длительность затемнения-перехода (0 — без анимации).
   *
   * @param scene Подключаемый вид.
   * @param options Длительность перехода.
   */
  setScene(scene: ViewScene, options: { fadeMs?: number } = {}): void {
    if (this.disposed || this.activeScene === scene) {
      this.requestRender();
      return;
    }

    this.activeScene?.deactivate();
    this.activeScene = scene;

    this.applyCameraAspect();
    scene.activate(this);
    scene.resize?.(this.width, this.height, this.renderer.getPixelRatio());
    this.dirty = true;
    this.showFade(options.fadeMs ?? 0);
    this.requestRender();
  }

  /** Запрашивает перерисовку на ближайшем кадре. */
  requestRender(): void {
    this.dirty = true;
    this.scheduleFrame();
  }

  /**
   * Пересчитывает размеры холста и камеры.
   *
   * Вызывается `ResizeObserver`; публичный, чтобы тесты и встраивание
   * могли повторить расчёт после изменения контейнера.
   */
  resize(): void {
    if (this.disposed) return;

    const rect = this.container.getBoundingClientRect();
    const width = Math.max(1, Math.round(this.container.clientWidth || rect.width || 1));
    const height = Math.max(1, Math.round(this.container.clientHeight || rect.height || 1));
    const pixelRatio = Math.min(window.devicePixelRatio || 1, this.maxPixelRatio);

    this.width = width;
    this.height = height;

    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(width, height, false);
    this.labelRenderer.setSize(width, height);
    this.applyCameraAspect();
    this.activeScene?.resize?.(width, height, this.renderer.getPixelRatio());
    this.requestRender();
  }

  /** Освобождает холст, обработчики и активную сцену. */
  dispose(): void {
    if (this.disposed) return;

    this.disposed = true;
    this.cancelFrame();

    this.resizeObserver?.disconnect();
    window.removeEventListener('resize', this.handleWindowResize);
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    this.renderer.domElement.removeEventListener('webglcontextlost', this.handleContextLost);
    this.renderer.domElement.removeEventListener(
      'webglcontextrestored',
      this.handleContextRestored,
    );

    this.activeScene?.deactivate();
    this.activeScene?.dispose();
    this.activeScene = null;

    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.labelRenderer.domElement.remove();
    this.fadeOverlay.remove();
  }

  /** Применяет текущие размеры к камере активного вида. */
  private applyCameraAspect(): void {
    const camera = this.activeScene?.camera;

    if (camera === undefined) return;

    camera.aspect = this.width / this.height;
    camera.updateProjectionMatrix();
  }

  /** Запускает кадр, если цикл ещё не идёт и вкладка видима. */
  private scheduleFrame(): void {
    if (this.disposed || this.contextLost || this.inFrame) return;
    if (isDocumentHidden()) return;
    if (this.frameId === 0) this.frameId = requestAnimationFrame(this.frame);
  }

  /** Отменяет запланированный кадр. */
  private cancelFrame(): void {
    if (this.frameId === 0) return;

    cancelAnimationFrame(this.frameId);
    this.frameId = 0;
  }

  /** Рисует кадр и решает, нужен ли следующий. */
  private frame(now: number): void {
    this.frameId = 0;

    if (this.disposed || this.contextLost || isDocumentHidden()) return;

    const dt = this.lastFrameTime === 0 ? 0 : clamp((now - this.lastFrameTime) / 1000, 0, 0.1);
    this.lastFrameTime = now;

    this.inFrame = true;
    const scene = this.activeScene;
    let needsFrame = false;

    if (scene !== null) {
      this.applyCameraAspect();
      needsFrame = scene.update(dt);
    }

    if (this.dirty || needsFrame) {
      if (scene !== null) {
        this.renderer.render(scene.scene, scene.camera);
        this.labelRenderer.render(scene.scene, scene.camera);
      } else {
        this.renderer.clear();
      }

      this.dirty = false;
    }

    this.inFrame = false;

    if (needsFrame || this.dirty) {
      this.scheduleFrame();
    } else {
      // Цикл останавливается: следующий кадр после паузы не должен
      // получить накопленный за простой шаг времени.
      this.lastFrameTime = 0;
    }
  }

  /** Показывает затемнение перехода. */
  private showFade(fadeMs: number): void {
    if (fadeMs <= 0 || this.reducedMotion) {
      this.fadeOverlay.style.transition = 'none';
      this.fadeOverlay.style.opacity = '0';
      return;
    }

    this.fadeOverlay.style.transition = 'none';
    this.fadeOverlay.style.opacity = '1';

    // Принудительный пересчёт стилей запускает переход.
    void this.fadeOverlay.offsetWidth;

    this.fadeOverlay.style.transition = `opacity ${fadeMs}ms ease-in-out`;
    this.fadeOverlay.style.opacity = '0';
  }

  /** Останавливает цикл при скрытой вкладке и возобновляет при возврате. */
  private handleVisibilityChange(): void {
    if (isDocumentHidden()) {
      this.cancelFrame();
      this.lastFrameTime = 0;
      return;
    }

    this.requestRender();
  }

  /** Обрабатывает потерю WebGL-контекста. */
  private handleContextLost(event: Event): void {
    event.preventDefault();
    this.contextLost = true;
    this.cancelFrame();
    this.lastFrameTime = 0;
  }

  /** Возобновляет рисование после восстановления контекста. */
  private handleContextRestored(): void {
    this.contextLost = false;
    this.lastFrameTime = 0;
    this.requestRender();
  }

  /** Повторяет расчёт после изменения окна. */
  private handleWindowResize(): void {
    this.resize();
  }
}

/** Проверяет системную настройку уменьшенного движения. */
function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}
