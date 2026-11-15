import * as THREE from 'three';

import { showToast } from '../../components/ui/Toast';
import { ru } from '../../i18n/ru';
import { disposeObject3D } from './disposeObject3D';
import type { SceneTarget } from './runtime';

/**
 * Выбор мышью звезды и планеты в 3D-сцене (задача 22; п. 9.1, 10.9; U38).
 *
 * У звезды и планеты есть невидимые сферы-мишени. Радиус мишени не меньше
 * 12 px на экране: при дальнем обзоре маленькую планету всё равно можно
 * выбрать. Клик отличается от вращения камеры: смещение курсора меньше
 * 5 px, длительность меньше 300 мс.
 */

/** Минимальный угловой размер мишени [px]. */
export const PICK_MIN_SCREEN_PX = 12;

/** Максимальное смещение курсора для клика [px]. */
export const CLICK_MAX_MOVE_PX = 5;

/** Максимальная длительность клика [мс]. */
export const CLICK_MAX_DURATION_MS = 300;

/** Причина недоступности звезды по умолчанию. */
export const STAR_UNAVAILABLE_REASON = ru['scene.starUnavailable'];

/** Жест указателя. */
export interface PointerGesture {
  /** Начальная координата X [px]. */
  startX: number;
  /** Начальная координата Y [px]. */
  startY: number;
  /** Конечная координата X [px]. */
  endX: number;
  /** Конечная координата Y [px]. */
  endY: number;
  /** Длительность [мс]. */
  durationMs: number;
}

/**
 * Радиус сферы-мишени в единицах сцены (п. 9.1).
 *
 *   max(R, 2 · dist · tan(FOV / 2) · 12 / viewportHeight)
 *
 * @param objectRadius Радиус самого объекта [единицы сцены].
 * @param distanceToCamera Расстояние до камеры [единицы сцены].
 * @param fovDeg Вертикальный угол обзора [°].
 * @param viewportHeightPx Высота холста [px].
 */
export function pickTargetRadius(
  objectRadius: number,
  distanceToCamera: number,
  fovDeg: number,
  viewportHeightPx: number,
): number {
  const radius = Number.isFinite(objectRadius) && objectRadius > 0 ? objectRadius : 0;

  if (
    !Number.isFinite(distanceToCamera) ||
    distanceToCamera <= 0 ||
    !Number.isFinite(fovDeg) ||
    fovDeg <= 0 ||
    !Number.isFinite(viewportHeightPx) ||
    viewportHeightPx <= 0
  ) {
    return radius;
  }

  const angular =
    (2 * distanceToCamera * Math.tan((fovDeg * Math.PI) / 360) * PICK_MIN_SCREEN_PX) /
    viewportHeightPx;

  return Math.max(radius, angular);
}

/** Псевдоним `pickTargetRadius` для краткого имени. */
export const pickRadius = pickTargetRadius;

/**
 * Проверяет, является ли жест кликом, а не вращением камеры.
 *
 * @param gesture Начало, конец и длительность.
 */
export function isClickGesture(gesture: PointerGesture): boolean {
  if (!Number.isFinite(gesture.durationMs) || gesture.durationMs < 0) return false;
  if (gesture.durationMs >= CLICK_MAX_DURATION_MS) return false;

  const dx = gesture.endX - gesture.startX;
  const dy = gesture.endY - gesture.startY;

  return Math.hypot(dx, dy) < CLICK_MAX_MOVE_PX;
}

/**
 * Проверяет клик по координатам.
 *
 * @param startX Начальная X [px].
 * @param startY Начальная Y [px].
 * @param endX Конечная X [px].
 * @param endY Конечная Y [px].
 * @param durationMs Длительность [мс].
 */
export function isClick(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  durationMs: number,
): boolean {
  return isClickGesture({ startX, startY, endX, endY, durationMs });
}

/** Настройки контроллера выбора. */
export interface SystemPickingOptions {
  /** Холст, на котором слушаются указатель и клики. */
  canvas: HTMLCanvasElement;
  /** Камера сцены. */
  camera: THREE.PerspectiveCamera;
  /** Сцена, в которую добавляются невидимые мишени. */
  scene: THREE.Scene;
  /** Объект планеты; null — планета не построена (нет модели масштаба). */
  planet: THREE.Object3D | null;
  /** Объект звезды. */
  star: THREE.Object3D;
  /** Радиус планеты [единицы сцены]. */
  planetRadius: number;
  /** Радиус звезды [единицы сцены]. */
  starRadius: number;
  /** Высота холста [px]; по умолчанию измеряется у холста. */
  viewportHeight?: () => number;
  /** Доступна ли звезда как цель; по умолчанию доступна. */
  isStarAvailable?: () => boolean;
  /** Причина недоступности звезды для Toast. */
  starUnavailableReason?: string;
  /** Выбор цели. */
  onSelect: (target: SceneTarget) => void;
  /** Показ Toast; по умолчанию общий `showToast`. */
  toast?: (text: string) => void;
}

/** Контроллер выбора мышью. */
export interface SystemPickingController {
  /** Синхронизирует мишени с текущими положениями объектов. */
  update(): void;
  /** Освобождает обработчики и мишени. */
  dispose(): void;
}

/** Нажатие, с которого может начаться клик. */
interface PointerDownState {
  x: number;
  y: number;
  time: number;
  pointerId: number;
}

/** Создаёт невидимую сферу-мишень. */
function createTarget(name: string, scene: THREE.Scene): THREE.Mesh {
  const geometry = new THREE.SphereGeometry(1, 16, 12);
  const material = new THREE.MeshBasicMaterial({ visible: false });
  const mesh = new THREE.Mesh(geometry, material);

  mesh.name = name;
  mesh.frustumCulled = false;
  mesh.userData['pickingTarget'] = name;
  scene.add(mesh);

  return mesh;
}

/**
 * Создаёт контроллер выбора.
 *
 * @param options Холст, камера, объекты и обработчик выбора.
 */
export function createSystemPicking(options: SystemPickingOptions): SystemPickingController {
  const { canvas, camera, scene, star, planetRadius, starRadius, onSelect } = options;
  const planet = options.planet ?? null;
  const toast = options.toast ?? showToast;
  const isStarAvailable = options.isStarAvailable ?? (() => true);
  const starUnavailableReason = options.starUnavailableReason ?? STAR_UNAVAILABLE_REASON;

  const planetTarget = planet === null ? null : createTarget('pick-planet', scene);
  const starTarget = createTarget('pick-star', scene);
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const worldPosition = new THREE.Vector3();
  const initialCursor = canvas.style.cursor;
  let down: PointerDownState | null = null;
  let disposed = false;

  /** Высота холста [px]. */
  function viewportHeight(): number {
    const measured = options.viewportHeight?.() ?? canvas.clientHeight;

    if (Number.isFinite(measured) && measured > 0) return measured;

    const rect = canvas.getBoundingClientRect();

    return Math.max(1, rect.height || 1);
  }

  /** Ставит мишень в мировую позицию объекта и задаёт её радиус. */
  function syncTarget(target: THREE.Mesh, object: THREE.Object3D, objectRadius: number): void {
    object.updateWorldMatrix(true, false);
    object.getWorldPosition(worldPosition);

    const distance = camera.position.distanceTo(worldPosition);
    const radius = pickTargetRadius(objectRadius, distance, camera.fov, viewportHeight());

    target.position.copy(worldPosition);
    target.scale.setScalar(radius);
    target.updateMatrixWorld(true);
  }

  /** Синхронизирует обе мишени. */
  function update(): void {
    if (disposed) return;

    if (planetTarget !== null && planet !== null) {
      syncTarget(planetTarget, planet, planetRadius);
    }
    syncTarget(starTarget, star, starRadius);
  }

  /** Возвращает цель под курсором или null. */
  function targetAt(clientX: number, clientY: number): SceneTarget | null {
    update();
    camera.updateMatrixWorld();

    const rect = canvas.getBoundingClientRect();
    const width = Math.max(1, rect.width || canvas.clientWidth || 1);
    const height = Math.max(1, rect.height || canvas.clientHeight || 1);

    pointer.x = ((clientX - rect.left) / width) * 2 - 1;
    pointer.y = -((clientY - rect.top) / height) * 2 + 1;

    raycaster.setFromCamera(pointer, camera);

    const targets = planetTarget === null ? [starTarget] : [planetTarget, starTarget];
    const hits = raycaster.intersectObjects(targets, false);
    const first = hits[0];

    if (first === undefined) return null;
    if (planetTarget !== null && first.object === planetTarget) return 'planet';
    if (first.object === starTarget) return 'star';

    return null;
  }

  /** Обновляет курсор при наведении. */
  function handlePointerMove(event: PointerEvent): void {
    if (disposed) return;

    const target = targetAt(event.clientX, event.clientY);

    canvas.style.cursor = target === null ? initialCursor : 'pointer';
  }

  /** Запоминает начало возможного клика. */
  function handlePointerDown(event: PointerEvent): void {
    if (disposed || event.button !== 0) return;

    down = {
      x: event.clientX,
      y: event.clientY,
      time: performance.now(),
      pointerId: event.pointerId,
    };
  }

  /** Завершает клик, если указатель почти не сдвинулся. */
  function handlePointerUp(event: PointerEvent): void {
    if (disposed || down === null) return;
    if (event.pointerId !== down.pointerId) return;

    const start = down;
    down = null;

    if (
      !isClickGesture({
        startX: start.x,
        startY: start.y,
        endX: event.clientX,
        endY: event.clientY,
        durationMs: performance.now() - start.time,
      })
    ) {
      return;
    }

    const target = targetAt(event.clientX, event.clientY);

    if (target === 'planet') {
      onSelect('planet');
      return;
    }

    if (target === 'star') {
      if (isStarAvailable()) {
        onSelect('star');
      } else {
        toast(starUnavailableReason);
      }
    }
  }

  /** Сбрасывает незавершённое нажатие. */
  function handlePointerLeave(): void {
    down = null;

    if (!disposed) canvas.style.cursor = initialCursor;
  }

  canvas.addEventListener('pointermove', handlePointerMove);
  canvas.addEventListener('pointerdown', handlePointerDown);
  canvas.addEventListener('pointerup', handlePointerUp);
  canvas.addEventListener('pointerleave', handlePointerLeave);

  update();

  return {
    update,

    dispose(): void {
      if (disposed) return;

      disposed = true;
      down = null;
      canvas.style.cursor = initialCursor;
      canvas.removeEventListener('pointermove', handlePointerMove);
      canvas.removeEventListener('pointerdown', handlePointerDown);
      canvas.removeEventListener('pointerup', handlePointerUp);
      canvas.removeEventListener('pointerleave', handlePointerLeave);
      if (planetTarget !== null) disposeObject3D(planetTarget);
      disposeObject3D(starTarget);
    },
  };
}

/** Псевдоним фабрики для явного имени. */
export const createSystemPickingController = createSystemPicking;
