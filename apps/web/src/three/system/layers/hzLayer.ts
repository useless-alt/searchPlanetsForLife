import { hzAvailability, RENDER_ORDER } from '@exo/shared';
import * as THREE from 'three';

import { formatMessage, ru } from '../../../i18n/ru';
import { disposeObject3D } from '../disposeObject3D';
import { registerSystemLayer, type SystemLayerDefinition } from '../layers';
import type { SystemContext } from '../runtime';
import { createHzRingMaterial, HZ_RING_NAME, updateHzRingMaterial } from './hzRingMaterial';

/**
 * Слой зоны обитаемости (задача 24; п. 11.4).
 *
 * Кольцо строится по тем же `d_in`/`d_out`, что показывает карточка
 * (задача 19): повторного расчёта границ нет. Плоскость кольца — XZ, центр —
 * звезда в начале координат. Смена границ или режима масштаба перестраивает
 * только геометрию кольца; группа слоя и сцена остаются прежними объектами.
 */

/** Сегментов кольца и контуров (п. 11.4). */
export const HZ_RING_SEGMENTS = 128;

/** Состояние построенного слоя. */
interface HzLayerState {
  /** Корневая группа слоя. */
  root: THREE.Group | null;
  /** Mesh кольца; null — зона недоступна. */
  mesh: THREE.Mesh<THREE.RingGeometry, THREE.ShaderMaterial> | null;
  /** Ключ текущих чисел и настроек. */
  key: string | null;
}

/** Состояние единственного построенного слоя. */
const state: HzLayerState = { root: null, mesh: null, key: null };

/** Ключ перестройки: границы, режим и масштаб (п. 11.4). */
function geometryKey(ctx: SystemContext): string | null {
  const hz = ctx.detail.hz;

  if (hz === null) return null;

  return `${ctx.settings.hzBounds}:${ctx.scale.mode}:${hz.d_in}:${hz.d_out}:${ctx.scale.unitsPerAU}`;
}

/** Создаёт плоское кольцо в плоскости XZ. */
function createRingGeometry(innerRadius: number, outerRadius: number): THREE.RingGeometry {
  const geometry = new THREE.RingGeometry(innerRadius, outerRadius, HZ_RING_SEGMENTS, 1);

  geometry.rotateX(-Math.PI / 2);

  return geometry;
}

/** Радиусы кольца [единицы сцены]; null — числа непригодны. */
function ringRadii(ctx: SystemContext): { innerRadius: number; outerRadius: number } | null {
  const hz = ctx.detail.hz;

  if (hz === null) return null;

  const innerRadius = ctx.scale.unitsPerAU * hz.d_in;
  const outerRadius = ctx.scale.unitsPerAU * hz.d_out;

  if (
    !Number.isFinite(innerRadius) ||
    !Number.isFinite(outerRadius) ||
    innerRadius <= 0 ||
    outerRadius <= innerRadius
  ) {
    return null;
  }

  return { innerRadius, outerRadius };
}

/** Публикует радиусы в `userData` для проверок и подсказок. */
function applyRadii(mesh: THREE.Mesh, innerRadius: number, outerRadius: number): void {
  mesh.userData['innerRadius'] = innerRadius;
  mesh.userData['outerRadius'] = outerRadius;
  mesh.geometry.boundingSphere = null;
}

/** Освобождает построенную группу и её ресурсы. */
function clearState(): void {
  if (state.root !== null) disposeObject3D(state.root);

  state.root = null;
  state.mesh = null;
  state.key = null;
}

/**
 * Строит кольцо зоны обитаемости.
 *
 * @param ctx Контекст сцены.
 * @returns Группа слоя; для недоступной зоны — пустая группа без кольца.
 */
function build(ctx: SystemContext): THREE.Object3D {
  clearState();

  const availability = hzAvailability(ctx.detail, ctx.scale);
  const root = new THREE.Group();

  root.name = 'hz-layer';
  state.root = root;

  if (!availability.available) {
    root.visible = false;
    return root;
  }

  const radii = ringRadii(ctx);

  if (radii === null) {
    root.visible = false;
    return root;
  }

  const material = createHzRingMaterial(radii);
  const mesh = new THREE.Mesh(createRingGeometry(radii.innerRadius, radii.outerRadius), material);

  mesh.name = HZ_RING_NAME;
  mesh.renderOrder = RENDER_ORDER.hz;
  applyRadii(mesh, radii.innerRadius, radii.outerRadius);

  root.add(mesh);
  root.visible = ctx.toggles.showHz;
  state.mesh = mesh;
  state.key = geometryKey(ctx);

  return root;
}

/**
 * Обновляет слой: перестраивает только геометрию при смене границ или масштаба.
 *
 * @param ctx Контекст сцены.
 */
function update(ctx: SystemContext): void {
  const root = state.root;

  if (root === null) return;

  const availability = hzAvailability(ctx.detail, ctx.scale);

  if (!availability.available) {
    root.visible = false;
    return;
  }

  root.visible = ctx.toggles.showHz;

  const key = geometryKey(ctx);

  if (key === null || key === state.key) return;

  const radii = ringRadii(ctx);

  if (radii === null) {
    root.visible = false;
    return;
  }

  if (state.mesh !== null) {
    // Старая геометрия освобождается ровно один раз; материал переиспользуется.
    state.mesh.geometry.dispose();
    state.mesh.geometry = createRingGeometry(radii.innerRadius, radii.outerRadius);
    updateHzRingMaterial(state.mesh.material, radii.innerRadius, radii.outerRadius);
    applyRadii(state.mesh, radii.innerRadius, radii.outerRadius);
  } else {
    const material = createHzRingMaterial(radii);
    const mesh = new THREE.Mesh(createRingGeometry(radii.innerRadius, radii.outerRadius), material);

    mesh.name = HZ_RING_NAME;
    mesh.renderOrder = RENDER_ORDER.hz;
    applyRadii(mesh, radii.innerRadius, radii.outerRadius);
    root.add(mesh);
    state.mesh = mesh;
  }

  state.key = key;
}

/**
 * Причина недоступности для подсказки переключателя (задача 17; п. 11.4).
 *
 * @param ctx Контекст сцены.
 */
function reason(ctx: SystemContext): string | null {
  const availability = hzAvailability(ctx.detail, ctx.scale);

  if (availability.available) return null;

  return formatMessage(ru['scene.hzUnavailable'], {
    reason: availability.reason ?? ru['scene.layerUnavailable'],
  });
}

/** Определение слоя для реестра задачи 22. */
export const hzLayer: SystemLayerDefinition = {
  id: 'hz',
  toggleKey: 'showHz',
  status(ctx) {
    return hzAvailability(ctx.detail, ctx.scale).available ? 'available' : 'unavailable';
  },
  reason,
  build,
  update,
  dispose() {
    clearState();
  },
};

/** Регистрирует слой зоны обитаемости в реестре сцены. */
export const unregisterHzLayer = registerSystemLayer(hzLayer);
