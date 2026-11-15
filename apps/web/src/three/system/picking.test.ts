import * as THREE from 'three';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as helpApi from '../../help/api';
import {
  CLICK_MAX_DURATION_MS,
  CLICK_MAX_MOVE_PX,
  createSystemPicking,
  isClick,
  isClickGesture,
  pickTargetRadius,
  type SystemPickingController,
} from './picking';

/**
 * Тесты выбора мышью (задача 22; п. 9.1, 10.9; U38).
 *
 * Проверяются угловой минимум мишени, отличие клика от вращения камеры,
 * выбор планеты и звезды, недоступная звезда с Toast и курсор при наведении.
 */

/** Проверяет абсолютный допуск. */
function expectClose(actual: number, expected: number, tolerance: number): void {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tolerance);
}

/** Подменяет прямоугольник холста. */
function mockRect(canvas: HTMLCanvasElement): void {
  Object.defineProperty(canvas, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 800,
      bottom: 800,
      width: 800,
      height: 800,
      toJSON: () => ({}),
    }),
  });
}

/** Экранная координата точки сцены. */
function screenPoint(
  camera: THREE.PerspectiveCamera,
  point: THREE.Vector3,
): { x: number; y: number } {
  const projected = point.clone().project(camera);

  return {
    x: ((projected.x + 1) / 2) * 800,
    y: ((-projected.y + 1) / 2) * 800,
  };
}

/** Отправляет нажатие и отпускание указателя. */
function pointerClick(canvas: HTMLCanvasElement, x: number, y: number, endX = x, endY = y): void {
  canvas.dispatchEvent(
    new MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: x, clientY: y }),
  );
  canvas.dispatchEvent(
    new MouseEvent('pointerup', { bubbles: true, button: 0, clientX: endX, clientY: endY }),
  );
}

describe('pickTargetRadius', () => {
  it('даёт минимум около 12.4 единицы для dist = 1000 и высоты 800', () => {
    expectClose(pickTargetRadius(0, 1000, 45, 800), 12.4264, 1e-3);
  });

  it('берёт радиус объекта, если он больше экранного минимума', () => {
    expect(pickTargetRadius(50, 1000, 45, 800)).toBe(50);
  });
});

describe('isClickGesture', () => {
  it('клик — смещение меньше 5 px и длительность меньше 300 мс', () => {
    expect(CLICK_MAX_MOVE_PX).toBe(5);
    expect(CLICK_MAX_DURATION_MS).toBe(300);
    expect(isClick(100, 100, 102, 103, 100)).toBe(true);
    expect(isClick(100, 100, 110, 100, 100)).toBe(false);
    expect(isClick(100, 100, 101, 100, 300)).toBe(false);
    expect(isClickGesture({ startX: 0, startY: 0, endX: 10, endY: 0, durationMs: 100 })).toBe(
      false,
    );
  });
});

describe('createSystemPicking', () => {
  let canvas: HTMLCanvasElement;
  let scene: THREE.Scene;
  let camera: THREE.PerspectiveCamera;
  let planet: THREE.Object3D;
  let star: THREE.Object3D;
  let controllers: SystemPickingController[];

  beforeEach(() => {
    canvas = document.createElement('canvas');
    mockRect(canvas);
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
    camera.position.set(0, 0, 100);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();

    planet = new THREE.Mesh(new THREE.SphereGeometry(2, 8, 6), new THREE.MeshBasicMaterial());
    planet.position.set(-10, 0, 0);
    planet.updateMatrixWorld();

    star = new THREE.Mesh(new THREE.SphereGeometry(4, 8, 6), new THREE.MeshBasicMaterial());
    star.position.set(10, 0, 0);
    star.updateMatrixWorld();

    scene.add(planet, star);
    controllers = [];
  });

  /** Собирает контроллер и запоминает его для очистки. */
  function create(
    onSelect: (target: 'planet' | 'star') => void,
    options: {
      isStarAvailable?: () => boolean;
      toast?: (text: string) => void;
      isStub?: (target: 'planet' | 'star') => boolean;
      missing?: (target: 'planet' | 'star') => string[];
      onHover?: (target: 'planet' | 'star' | null) => void;
    } = {},
  ): SystemPickingController {
    const controller = createSystemPicking({
      canvas,
      camera,
      scene,
      planet,
      star,
      planetRadius: 2,
      starRadius: 4,
      viewportHeight: () => 800,
      onSelect,
      isStarAvailable: options.isStarAvailable,
      toast: options.toast,
      isStub: options.isStub,
      missing: options.missing,
      onHover: options.onHover,
    });

    controllers.push(controller);

    return controller;
  }

  /** Клик по центру объекта. */
  function clickObject(object: THREE.Object3D): void {
    const point = screenPoint(camera, object.position);

    pointerClick(canvas, point.x, point.y);
  }

  it('клик по планете выбирает планету', () => {
    const onSelect = vi.fn();
    create(onSelect);

    clickObject(planet);

    expect(onSelect).toHaveBeenCalledWith('planet');
  });

  it('клик по звезде выбирает звезду', () => {
    const onSelect = vi.fn();
    create(onSelect);

    clickObject(star);

    expect(onSelect).toHaveBeenCalledWith('star');
  });

  it('смещение 10 px не считается кликом', () => {
    const onSelect = vi.fn();
    create(onSelect);
    const point = screenPoint(camera, planet.position);

    pointerClick(canvas, point.x, point.y, point.x + 10, point.y);

    expect(onSelect).not.toHaveBeenCalled();
  });

  it('недоступная звезда показывает Toast с причиной', () => {
    const onSelect = vi.fn();
    const toast = vi.fn();
    create(onSelect, { isStarAvailable: () => false, toast });

    clickObject(star);

    expect(onSelect).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalledTimes(1);
    expect(toast.mock.calls[0]?.[0]).toContain('Недостаточно данных звезды');
  });

  it('при наведении ставит курсор pointer', () => {
    create(() => undefined);
    const point = screenPoint(camera, planet.position);

    canvas.dispatchEvent(
      new MouseEvent('pointermove', { bubbles: true, clientX: point.x, clientY: point.y }),
    );
    expect(canvas.style.cursor).toBe('pointer');

    canvas.dispatchEvent(
      new MouseEvent('pointermove', { bubbles: true, clientX: 790, clientY: 790 }),
    );
    expect(canvas.style.cursor).toBe('');
  });

  it('наведение на заглушку показывает stub.missing, уход скрывает', () => {
    const show = vi.spyOn(helpApi, 'showHelpAt').mockImplementation(() => {});
    const hide = vi.spyOn(helpApi, 'hideHelp').mockImplementation(() => {});
    const onHover = vi.fn();

    create(() => undefined, {
      isStub: () => true,
      missing: () => ['радиус планеты'],
      onHover,
    });

    const point = screenPoint(camera, planet.position);

    canvas.dispatchEvent(
      new MouseEvent('pointermove', { bubbles: true, clientX: point.x, clientY: point.y }),
    );

    expect(show).toHaveBeenCalled();
    expect(show.mock.calls[0]?.[0].key).toBe('stub.missing');
    expect(show.mock.calls[0]?.[0].ctx?.missing).toEqual(['радиус планеты']);
    expect(onHover).toHaveBeenCalledWith('planet');

    canvas.dispatchEvent(new MouseEvent('pointerleave', { bubbles: true }));

    expect(hide).toHaveBeenCalled();
    expect(onHover).toHaveBeenCalledWith(null);
  });

  it('наведение на реальную планету не показывает stub.missing', () => {
    const show = vi.spyOn(helpApi, 'showHelpAt').mockImplementation(() => {});

    create(() => undefined, { isStub: () => false });

    const point = screenPoint(camera, planet.position);

    canvas.dispatchEvent(
      new MouseEvent('pointermove', { bubbles: true, clientX: point.x, clientY: point.y }),
    );

    expect(show).not.toHaveBeenCalled();
  });

  it('освобождает мишени и обработчики', () => {
    const controller = create(() => undefined);

    controller.dispose();

    expect(scene.children.some((child) => child.name.startsWith('pick-'))).toBe(false);
    expect(() => controller.dispose()).not.toThrow();
  });
});
