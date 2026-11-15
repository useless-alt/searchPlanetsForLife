import { classifyWorld, RENDER_ORDER_PLANET, RENDER_ORDER_STAR, teffToRGB } from '@exo/shared';
import * as THREE from 'three';

import { three as threeTokens, tokens } from '../../styles/theme';
import { disposeObject3D } from './disposeObject3D';
import type { SystemContext } from './runtime';
import type {
  PlanetVisualHandle,
  SpinController,
  SpinCtx,
  StarVisualHandle,
} from './visuals/types';

/**
 * Заглушки звезды и планеты (задача 22; п. 9.2; задачи 25, 27 — замена).
 *
 * Задача 25 использует заглушки как запасной вариант: серая сфера планеты
 * и сфера звезды. Задача 27 заменит их через `registerStubFactory`, не
 * меняя контракты `StarVisualHandle` и `PlanetVisualHandle`.
 */

/** Минимум данных, нужный заглушке. */
type PlaceholderCtx = Pick<SystemContext, 'detail' | 'scale'>;

/** Цвет планеты по классу мира. */
function worldColor(planet: Parameters<typeof classifyWorld>[0]): number {
  switch (classifyWorld(planet)) {
    case 'earthlike':
      return new THREE.Color(tokens['color-accent']).getHex();
    case 'ice':
      return threeTokens.hzEdge;
    case 'desert':
      return new THREE.Color(tokens['color-warning']).getHex();
    case 'lava':
      return new THREE.Color(tokens['color-negative']).getHex();
    case 'mini_neptune':
      return new THREE.Color(tokens['color-info']).getHex();
    case 'gas_giant':
      return new THREE.Color(tokens['color-quality-medium']).getHex();
    case 'unknown':
      return threeTokens.mapStarUnknown;
  }
}

/** Создаёт заглушку звезды. */
export function createStarPlaceholder(ctx: PlaceholderCtx): StarVisualHandle {
  const color = teffToRGB(ctx.detail.resolved.st_teff?.value ?? null);
  const geometry = new THREE.SphereGeometry(1, 48, 32);
  const material = new THREE.MeshBasicMaterial({
    color: new THREE.Color(color.r / 255, color.g / 255, color.b / 255),
    toneMapped: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  const root = new THREE.Group();

  mesh.scale.setScalar(Math.max(ctx.scale.starRadius, 1e-6));
  mesh.name = 'star-placeholder';
  mesh.renderOrder = RENDER_ORDER_STAR;
  mesh.userData['placeholder'] = true;
  root.name = 'star-placeholder';
  root.add(mesh);

  return {
    root,
    object: root,
    setQuality(): void {
      // Геометрия заглушки не зависит от профиля качества.
    },
    update(): void {
      // Заглушка статична.
    },
    dispose(): void {
      disposeObject3D(root);
    },
  };
}

/** Создаёт заглушку планеты. */
export function createPlanetPlaceholder(ctx: PlaceholderCtx): PlanetVisualHandle {
  const geometry = new THREE.SphereGeometry(1, 48, 32);
  const material = new THREE.MeshStandardMaterial({
    color: worldColor(ctx.detail.resolved),
    roughness: 0.92,
    metalness: 0,
  });
  const surface = new THREE.Mesh(geometry, material);
  const axisGroup = new THREE.Group();
  const root = new THREE.Group();
  let spin: SpinController | null = null;

  surface.scale.setScalar(Math.max(ctx.scale.planetRadius, 1e-6));
  surface.name = 'planet-placeholder';
  surface.renderOrder = RENDER_ORDER_PLANET;
  surface.userData['placeholder'] = true;
  axisGroup.add(surface);
  root.name = 'planet-placeholder';
  root.add(axisGroup);

  return {
    root,
    object: root,
    axisGroup,
    surface,
    clouds: null,
    atmosphere: null,
    setSunState(): void {
      // Заглушка освещается общим PointLight сцены.
    },
    setQuality(): void {
      // Геометрия заглушки не зависит от профиля качества.
    },
    setHints(): void {
      // У заглушки нет атмосферы.
    },
    attachSpin(controller: SpinController | null): void {
      if (spin === controller) return;

      spin?.dispose();
      spin = controller;
    },
    update(dtSec: number, spinCtx: SpinCtx): void {
      spin?.update(dtSec, spinCtx);
    },
    dispose(): void {
      spin?.dispose();
      spin = null;
      disposeObject3D(root);
    },
  };
}
