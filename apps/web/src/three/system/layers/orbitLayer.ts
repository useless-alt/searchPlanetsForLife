import { orbitAvailability, sampleEllipse, type OrbitAvailability } from '@exo/shared';
import * as THREE from 'three';

import { HELP_TEXTS } from '../../../i18n/help.ru';
import { formatMessage, ru } from '../../../i18n/ru';
import { disposeObject3D } from '../disposeObject3D';
import { registerSystemLayer, type SystemLayerDefinition } from '../layers';
import type { SystemContext } from '../runtime';
import { createOrbitLine, type OrbitLineHandle, type OrbitLinePoint } from './orbitLine';

/**
 * Слой «Орбита» (задача 23; п. 11.3; U46, U49).
 *
 * Показывается одна орбита выбранной планеты, поэтому шум от множества
 * орбит исключён по построению. Контур строится той же функцией
 * `sampleEllipse`, что и положение планеты (`positionAU`), и в том же
 * масштабе: звезда находится в фокусе эллипса, а планета в любой момент
 * лежит на линии.
 *
 * Смена масштаба, большой полуоси, эксцентриситета или планеты перестраивает
 * только геометрию и материалы линии; группа слоя и сцена остаются прежними.
 * Переключатель `showOrbit` меняет лишь видимость и ничего не освобождает.
 */

/** Идентификатор слоя. */
export const ORBIT_LAYER_ID = 'orbit';

/** Имя корневой группы слоя. */
export const ORBIT_LAYER_NAME = 'orbit-layer';

/** Состояние единственного построенного слоя. */
interface OrbitLayerState {
  /** Корневая группа слоя. */
  root: THREE.Group | null;
  /** Линия орбиты; null — орбита недоступна. */
  line: OrbitLineHandle | null;
  /** Ключ текущих данных и масштаба. */
  key: string | null;
}

/** Состояние слоя. */
const state: OrbitLayerState = { root: null, line: null, key: null };

/** Причина недоступности для подсказки переключателя. */
function reasonText(availability: OrbitAvailability): string | null {
  if (availability.available) return null;

  const cause =
    availability.reason === 'nominal' ? ru['scene.orbitNominal'] : ru['scene.orbitMissing'];

  return formatMessage(HELP_TEXTS.orbitUnavailable, { reason: cause });
}

/** Ключ перестройки: планета, масштаб, большая полуось и эксцентриситет. */
function geometryKey(ctx: SystemContext): string {
  const resolved = ctx.detail.resolved;

  return [
    ctx.detail.id,
    ctx.scale.mode,
    resolved.d.value ?? 'null',
    resolved.e.value ?? 'null',
    ctx.scale.unitsPerAU,
  ].join(':');
}

/** Точки контура в единицах сцены; пустой массив — орбита недоступна. */
export function orbitScenePoints(ctx: SystemContext): OrbitLinePoint[] {
  const resolved = ctx.detail.resolved;
  const distance = resolved.d.value;

  if (!orbitAvailability(resolved, ctx.scale).available || distance === null) return [];

  const eccentricity = resolved.e.value ?? 0;
  const points = sampleEllipse(distance, eccentricity);

  return points.map(([x, y, z]) => [ctx.scale.mapAU(x), ctx.scale.mapAU(y), ctx.scale.mapAU(z)]);
}

/** Освобождает построенную группу и её ресурсы. */
function clearState(): void {
  if (state.root !== null) disposeObject3D(state.root);

  state.root = null;
  state.line = null;
  state.key = null;
}

/** Создаёт линию, если её ещё нет, и добавляет её в группу. */
function ensureLine(root: THREE.Group, points: readonly OrbitLinePoint[]): OrbitLineHandle {
  if (state.line !== null) {
    state.line.setPoints(points);

    return state.line;
  }

  const line = createOrbitLine(points);

  root.add(line.object);
  state.line = line;

  return line;
}

/**
 * Строит слой орбиты.
 *
 * @param ctx Контекст сцены.
 * @returns Группа слоя; для недоступной орбиты — пустая скрытая группа.
 */
function build(ctx: SystemContext): THREE.Object3D {
  clearState();

  const root = new THREE.Group();

  root.name = ORBIT_LAYER_NAME;
  state.root = root;

  const availability = orbitAvailability(ctx.detail.resolved, ctx.scale);

  if (!availability.available) {
    root.visible = false;

    return root;
  }

  const line = ensureLine(root, orbitScenePoints(ctx));

  state.key = geometryKey(ctx);
  root.visible = ctx.toggles.showOrbit;
  line.setVisible(ctx.toggles.showOrbit);

  return root;
}

/**
 * Обновляет слой: перестраивает только геометрию и материалы при смене
 * масштаба, большой полуоси, эксцентриситета или планеты.
 *
 * @param ctx Контекст сцены.
 */
function update(ctx: SystemContext): void {
  const root = state.root;

  if (root === null) return;

  const availability = orbitAvailability(ctx.detail.resolved, ctx.scale);

  if (!availability.available) {
    root.visible = false;

    return;
  }

  const key = geometryKey(ctx);

  if (key !== state.key) {
    const line = ensureLine(root, orbitScenePoints(ctx));

    state.key = key;
    root.visible = ctx.toggles.showOrbit;
    line.setVisible(ctx.toggles.showOrbit);

    return;
  }

  root.visible = ctx.toggles.showOrbit;

  if (state.line !== null) {
    state.line.setVisible(ctx.toggles.showOrbit);
  } else {
    root.visible = false;
  }
}

/** Причина недоступности для подсказки переключателя (задача 17). */
function reason(ctx: SystemContext): string | null {
  return reasonText(orbitAvailability(ctx.detail.resolved, ctx.scale));
}

/** Определение слоя для реестра задачи 22. */
export const orbitLayer: SystemLayerDefinition = {
  id: ORBIT_LAYER_ID,
  toggleKey: 'showOrbit',
  status(ctx) {
    return orbitAvailability(ctx.detail.resolved, ctx.scale).available
      ? 'available'
      : 'unavailable';
  },
  reason,
  build,
  update,
  dispose() {
    clearState();
  },
};

/** Регистрирует слой орбиты в реестре сцены. */
export const unregisterOrbitLayer = registerSystemLayer(orbitLayer);
