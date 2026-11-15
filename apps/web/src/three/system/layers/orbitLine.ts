import { RENDER_ORDER_ORBIT } from '@exo/shared';
import * as THREE from 'three';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';

import { three as threeTokens } from '../../../styles/theme';

/**
 * Двухслойная линия орбиты (задача 23; п. 11.3).
 *
 * Реализация — `Line2` с `LineMaterial` и `worldUnits: false`: толщина задана
 * в пикселях экрана, поэтому линия одинаково читается в обзорном режиме и в
 * 1:1. Под ядром лежит более широкий тёмный ореол: он отделяет линию от
 * светлого диска звезды. Оба слоя прозрачны, не пишут в буфер глубины, но
 * проверяют его, поэтому планета и звезда перекрывают линию, когда находятся
 * перед ней. Порядок отрисовки — `RENDER_ORDER_ORBIT = 10`, после зоны
 * обитаемости и непрозрачных объектов.
 *
 * Замкнутость: в геометрию добавляется первая точка в конец, поэтому контур
 * не имеет видимого разрыва. Вершины задаются уже в единицах сцены.
 */

/** Имя группы линии орбиты. */
export const ORBIT_LINE_NAME = 'orbit-line';

/** Имя слоя-ореола. */
export const ORBIT_HALO_NAME = 'orbit-halo';

/** Имя слоя-ядра. */
export const ORBIT_CORE_NAME = 'orbit-core';

/** Ширина ореола [px экрана]. */
export const ORBIT_HALO_WIDTH_PX = 3;

/** Ширина ядра [px экрана]. */
export const ORBIT_CORE_WIDTH_PX = 1.5;

/** Прозрачность ореола (п. 11.3). */
export const ORBIT_HALO_OPACITY = threeTokens.orbitHaloOpacity;

/** Точка контура в единицах сцены. */
export type OrbitLinePoint = readonly [number, number, number];

/** Построенная линия орбиты. */
export interface OrbitLineHandle {
  /** Корневая группа; её идентичность не меняется при перестройке. */
  readonly object: THREE.Group;
  /** Слой-ореол. */
  readonly halo: Line2;
  /** Слой-ядро. */
  readonly core: Line2;
  /** Есть ли в линии хотя бы две точки. */
  readonly hasPoints: boolean;
  /** Заменяет контур, освобождая прежние геометрию и материалы. */
  setPoints(points: readonly OrbitLinePoint[]): void;
  /** Показывает или скрывает линию, не освобождая ресурсы. */
  setVisible(visible: boolean): void;
  /** Обновляет разрешение экрана для пересчёта пиксельной толщины. */
  updateResolution(width: number, height: number): void;
  /** Освобождает геометрию, материалы и снимает группу со сцены. */
  dispose(): void;
}

/** Создаёт материал линии. */
function createLineMaterial(color: number, linewidth: number, opacity: number): LineMaterial {
  return new LineMaterial({
    color,
    linewidth,
    worldUnits: false,
    transparent: true,
    opacity,
    depthTest: true,
    depthWrite: false,
    toneMapped: false,
  });
}

/** Приводит точки к замкнутой последовательности вершин. */
function closedPositions(points: readonly OrbitLinePoint[]): Float32Array {
  const finite = points.filter(
    ([x, y, z]) => Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z),
  );

  if (finite.length < 2) return new Float32Array(0);

  const positions = new Float32Array((finite.length + 1) * 3);

  for (let index = 0; index < finite.length; index += 1) {
    const point = finite[index];

    if (point === undefined) continue;

    positions[index * 3] = point[0];
    positions[index * 3 + 1] = point[1];
    positions[index * 3 + 2] = point[2];
  }

  const first = finite[0];

  if (first !== undefined) {
    const offset = finite.length * 3;

    positions[offset] = first[0];
    positions[offset + 1] = first[1];
    positions[offset + 2] = first[2];
  }

  return positions;
}

/**
 * Создаёт двухслойную линию орбиты.
 *
 * @param initialPoints Начальный контур в единицах сцены.
 */
export function createOrbitLine(initialPoints: readonly OrbitLinePoint[] = []): OrbitLineHandle {
  const root = new THREE.Group();

  root.name = ORBIT_LINE_NAME;
  root.renderOrder = RENDER_ORDER_ORBIT;

  let geometry = new LineGeometry();
  let haloMaterial = createLineMaterial(
    threeTokens.orbitHalo,
    ORBIT_HALO_WIDTH_PX,
    ORBIT_HALO_OPACITY,
  );
  let coreMaterial = createLineMaterial(threeTokens.orbitLine, ORBIT_CORE_WIDTH_PX, 1);

  const halo = new Line2(geometry, haloMaterial);
  const core = new Line2(geometry, coreMaterial);

  halo.name = ORBIT_HALO_NAME;
  core.name = ORBIT_CORE_NAME;

  // Ореол рисуется раньше ядра: прозрачные объекты одного renderOrder
  // сортируются по material.id, но явный порядок надёжнее.
  halo.renderOrder = 0;
  core.renderOrder = 1;

  // Контур маленький; отсечение по границам только мешает при пустой
  // геометрии и при смене масштаба.
  halo.frustumCulled = false;
  core.frustumCulled = false;

  root.add(halo, core);

  let hasPoints = false;
  let requestedVisible = true;
  let disposed = false;
  const viewportSize = new THREE.Vector2();

  /** Применяет видимость с учётом наличия контура. */
  function applyVisibility(): void {
    root.visible = requestedVisible && hasPoints;
  }

  /** Подключает разрешение экрана к материалу. */
  function attachResolution(line: Line2, material: LineMaterial): void {
    line.onBeforeRender = (renderer: THREE.WebGLRenderer): void => {
      renderer.getSize(viewportSize);
      material.resolution.set(Math.max(1, viewportSize.x), Math.max(1, viewportSize.y));
    };
  }

  attachResolution(halo, haloMaterial);
  attachResolution(core, coreMaterial);

  /** Заменяет ресурсы линии, освобождая прежние ровно один раз. */
  function replaceResources(positions: Float32Array | null): void {
    geometry.dispose();
    haloMaterial.dispose();
    coreMaterial.dispose();

    const nextGeometry = new LineGeometry();

    if (positions !== null) nextGeometry.setPositions(positions);

    const nextHalo = createLineMaterial(
      threeTokens.orbitHalo,
      ORBIT_HALO_WIDTH_PX,
      ORBIT_HALO_OPACITY,
    );
    const nextCore = createLineMaterial(threeTokens.orbitLine, ORBIT_CORE_WIDTH_PX, 1);

    geometry = nextGeometry;
    haloMaterial = nextHalo;
    coreMaterial = nextCore;

    halo.geometry = nextGeometry;
    core.geometry = nextGeometry;
    halo.material = nextHalo;
    core.material = nextCore;

    attachResolution(halo, nextHalo);
    attachResolution(core, nextCore);
  }

  function setPoints(points: readonly OrbitLinePoint[]): void {
    if (disposed) return;

    const positions = closedPositions(points);

    // Пустой контур: линия скрывается, но группа остаётся в сцене. Пустая
    // геометрия нужна, чтобы последующее включение слоя не пересоздавало
    // объект сцены.
    replaceResources(positions.length === 0 ? null : positions);
    hasPoints = positions.length > 0;
    applyVisibility();
  }

  if (initialPoints.length > 0) setPoints(initialPoints);

  return {
    object: root,
    halo,
    core,
    get hasPoints(): boolean {
      return hasPoints;
    },
    setPoints,
    setVisible(visible: boolean): void {
      requestedVisible = visible;
      applyVisibility();
    },
    updateResolution(width: number, height: number): void {
      const safeWidth = Number.isFinite(width) && width > 0 ? width : 1;
      const safeHeight = Number.isFinite(height) && height > 0 ? height : 1;

      haloMaterial.resolution.set(safeWidth, safeHeight);
      coreMaterial.resolution.set(safeWidth, safeHeight);
    },
    dispose(): void {
      if (disposed) return;

      disposed = true;
      geometry.dispose();
      haloMaterial.dispose();
      coreMaterial.dispose();
      root.clear();
      root.removeFromParent();
    },
  };
}
