import { RENDER_ORDER_ORBIT } from '@exo/shared';
import * as THREE from 'three';
import type { Line2 } from 'three/examples/jsm/lines/Line2.js';
import type { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { three as threeTokens } from '../../../styles/theme';
import {
  createOrbitLine,
  ORBIT_CORE_NAME,
  ORBIT_CORE_WIDTH_PX,
  ORBIT_HALO_NAME,
  ORBIT_HALO_OPACITY,
  ORBIT_HALO_WIDTH_PX,
  ORBIT_LINE_NAME,
  type OrbitLineHandle,
} from './orbitLine';

/**
 * Тесты линии орбиты (задача 23; п. 11.3).
 *
 * Проверяются замкнутость контура, два слоя «ореол + ядро», пиксельная
 * толщина, состояние материала, порядок отрисовки, перестройка без смены
 * объекта сцены и освобождение ресурсов.
 */

/** Квадрат в плоскости XZ. */
const SQUARE = [
  [1, 0, 0],
  [0, 0, -1],
  [-1, 0, 0],
  [0, 0, 1],
] as const;

/** Читает вершины линии из interleaved-буфера `LineGeometry`. */
function verticesOf(line: Line2): number[][] {
  const attribute = line.geometry.getAttribute('instanceStart') as unknown as
    { data: { array: Float32Array } } | undefined;

  if (attribute === undefined) return [];

  const data = attribute.data.array;

  if (data.length < 6) return [];

  const segments = data.length / 6;
  const vertices: number[][] = [];

  for (let index = 0; index < segments; index += 1) {
    const offset = index * 6;

    vertices.push([data[offset] ?? 0, data[offset + 1] ?? 0, data[offset + 2] ?? 0]);
  }

  // Последняя точка контура — конец последнего сегмента.
  vertices.push([
    data[data.length - 3] ?? 0,
    data[data.length - 2] ?? 0,
    data[data.length - 1] ?? 0,
  ]);

  return vertices;
}

/** Материал линии. */
function materialOf(line: Line2): LineMaterial {
  return line.material as LineMaterial;
}

/** Строит линию и проверяет, что ручка вернула два слоя. */
function build(): OrbitLineHandle {
  return createOrbitLine(SQUARE);
}

let handle: OrbitLineHandle | null = null;

beforeEach(() => {
  handle?.dispose();
  handle = null;
});

describe('createOrbitLine — геометрия', () => {
  it('строит группу с ореолом и ядром', () => {
    handle = build();
    const root = handle.object;

    expect(root.name).toBe(ORBIT_LINE_NAME);
    expect(root.children).toHaveLength(2);
    expect(handle.halo.name).toBe(ORBIT_HALO_NAME);
    expect(handle.core.name).toBe(ORBIT_CORE_NAME);
    expect(handle.hasPoints).toBe(true);
    expect(root.visible).toBe(true);
  });

  it('замыкает контур: первая точка добавлена в конец', () => {
    handle = build();

    for (const line of [handle.halo, handle.core]) {
      const vertices = verticesOf(line);
      const first = vertices[0];
      const last = vertices[vertices.length - 1];

      expect(vertices).toHaveLength(SQUARE.length + 1);
      expect(last).toEqual(first);
    }
  });

  it('оба слоя используют одну геометрию контура', () => {
    handle = build();

    expect(handle.halo.geometry).toBe(handle.core.geometry);
  });

  it('толщина задана в пикселях экрана, а не в worldUnits', () => {
    handle = build();

    expect(materialOf(handle.halo).worldUnits).toBe(false);
    expect(materialOf(handle.core).worldUnits).toBe(false);
    expect(materialOf(handle.halo).linewidth).toBe(ORBIT_HALO_WIDTH_PX);
    expect(materialOf(handle.core).linewidth).toBe(ORBIT_CORE_WIDTH_PX);
  });

  it('ореол полупрозрачный и темнее ядра', () => {
    handle = build();

    expect(materialOf(handle.halo).opacity).toBe(ORBIT_HALO_OPACITY);
    expect(materialOf(handle.core).opacity).toBe(1);
    expect(materialOf(handle.halo).color.getHex()).not.toBe(materialOf(handle.core).color.getHex());
  });
});

describe('createOrbitLine — материал и порядок отрисовки', () => {
  it('проверяет глубину, но не пишет её', () => {
    handle = build();

    for (const line of [handle.halo, handle.core]) {
      const material = materialOf(line);

      expect(material.transparent).toBe(true);
      expect(material.depthTest).toBe(true);
      expect(material.depthWrite).toBe(false);
    }
  });

  it('рисуется после непрозрачных объектов и зоны обитаемости', () => {
    handle = build();

    expect(handle.object.renderOrder).toBe(RENDER_ORDER_ORBIT);
    expect(handle.halo.renderOrder).toBeLessThan(handle.core.renderOrder);
  });

  it('цвет ядра совпадает с токеном --orbit-line, ореол — с --orbit-halo', () => {
    handle = build();

    expect(materialOf(handle.core).color.getHex()).toBe(threeTokens.orbitLine);
    expect(materialOf(handle.halo).color.getHex()).toBe(threeTokens.orbitHalo);
  });

  it('обновляет разрешение экрана для пиксельной толщины', () => {
    handle = build();
    handle.updateResolution(1280, 720);

    expect(materialOf(handle.halo).resolution.x).toBe(1280);
    expect(materialOf(handle.halo).resolution.y).toBe(720);

    const renderer = {
      getSize(target: THREE.Vector2): THREE.Vector2 {
        return target.set(640, 480);
      },
    } as unknown as THREE.WebGLRenderer;

    handle.core.onBeforeRender(renderer);

    expect(materialOf(handle.core).resolution.x).toBe(640);
    expect(materialOf(handle.core).resolution.y).toBe(480);
  });
});

describe('createOrbitLine — перестройка и видимость', () => {
  it('заменяет контур, сохраняя объект сцены и освобождая прежние ресурсы', () => {
    handle = build();
    const root = handle.object;
    const oldGeometry = handle.halo.geometry;
    const oldHaloMaterial = materialOf(handle.halo);
    const oldCoreMaterial = materialOf(handle.core);
    const geometryDispose = vi.spyOn(oldGeometry, 'dispose');
    const haloDispose = vi.spyOn(oldHaloMaterial, 'dispose');
    const coreDispose = vi.spyOn(oldCoreMaterial, 'dispose');
    const next = [
      [2, 0, 0],
      [0, 0, -2],
      [-2, 0, 0],
      [0, 0, 2],
    ] as const;

    handle.setPoints(next);

    expect(handle.object).toBe(root);
    expect(handle.halo.geometry).not.toBe(oldGeometry);
    expect(geometryDispose).toHaveBeenCalledTimes(1);
    expect(haloDispose).toHaveBeenCalledTimes(1);
    expect(coreDispose).toHaveBeenCalledTimes(1);

    const vertices = verticesOf(handle.core);
    const first = vertices[0];

    expect(first).toEqual([2, 0, 0]);
    expect(vertices[vertices.length - 1]).toEqual(first);
  });

  it('скрытие переключателем не освобождает геометрию', () => {
    handle = build();
    const geometry = handle.halo.geometry;
    const dispose = vi.spyOn(geometry, 'dispose');

    handle.setVisible(false);

    expect(handle.object.visible).toBe(false);
    expect(handle.halo.geometry).toBe(geometry);
    expect(dispose).not.toHaveBeenCalled();

    handle.setVisible(true);

    expect(handle.object.visible).toBe(true);
    expect(handle.halo.geometry).toBe(geometry);
  });

  it('пустой контур скрывает линию и не оставляет точек', () => {
    handle = build();

    handle.setPoints([]);

    expect(handle.hasPoints).toBe(false);
    expect(handle.object.visible).toBe(false);
    expect(verticesOf(handle.core)).toHaveLength(0);
  });
});

describe('createOrbitLine — освобождение', () => {
  it('dispose освобождает геометрию и материалы ровно один раз', () => {
    handle = build();
    const geometry = vi.spyOn(handle.halo.geometry, 'dispose');
    const haloMaterial = vi.spyOn(materialOf(handle.halo), 'dispose');
    const coreMaterial = vi.spyOn(materialOf(handle.core), 'dispose');

    handle.dispose();
    handle.dispose();

    expect(geometry).toHaveBeenCalledTimes(1);
    expect(haloMaterial).toHaveBeenCalledTimes(1);
    expect(coreMaterial).toHaveBeenCalledTimes(1);
    expect(handle.object.children).toHaveLength(0);
  });

  it('dispose снимает группу со сцены', () => {
    handle = build();

    const scene = new THREE.Scene();

    scene.add(handle.object);
    handle.dispose();

    expect(scene.children).toHaveLength(0);
  });
});
