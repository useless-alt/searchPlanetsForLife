import { classifyWorld, RENDER_ORDER_PLANET, RENDER_ORDER_STAR, teffToRGB } from '@exo/shared';
import * as THREE from 'three';

import { three as threeTokens, tokens } from '../../styles/theme';
import { disposeObject3D } from './disposeObject3D';
import type { SystemContext } from './runtime';
import type { VisualInstance } from './visuals';

/**
 * Заглушки звезды и планеты (задача 22; п. 9.2; задача 27 — замена).
 *
 * Звезда — сфера `MeshBasicMaterial` цвета `teffToRGB(st_teff)`, планета —
 * сфера `MeshStandardMaterial` цвета класса мира. Настоящие текстуры,
 * атмосфера и вращение появятся в задачах 25–27; до этого заглушки дают
 * правильные размеры, цвета и освещение.
 */

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
export function createStarPlaceholder(ctx: SystemContext): VisualInstance {
  const color = teffToRGB(ctx.detail.resolved.st_teff.value);
  const geometry = new THREE.SphereGeometry(ctx.scale.starRadius, 48, 32);
  const material = new THREE.MeshBasicMaterial({
    color: new THREE.Color(color.r / 255, color.g / 255, color.b / 255),
    toneMapped: false,
  });
  const object = new THREE.Mesh(geometry, material);

  object.name = 'star-placeholder';
  object.renderOrder = RENDER_ORDER_STAR;
  object.userData['placeholder'] = true;

  return {
    object,
    dispose(): void {
      disposeObject3D(object);
    },
  };
}

/** Создаёт заглушку планеты. */
export function createPlanetPlaceholder(ctx: SystemContext): VisualInstance {
  const geometry = new THREE.SphereGeometry(ctx.scale.planetRadius, 48, 32);
  const material = new THREE.MeshStandardMaterial({
    color: worldColor(ctx.detail.resolved),
    roughness: 0.92,
    metalness: 0,
  });
  const object = new THREE.Mesh(geometry, material);

  object.name = 'planet-placeholder';
  object.renderOrder = RENDER_ORDER_PLANET;
  object.userData['placeholder'] = true;

  return {
    object,
    dispose(): void {
      disposeObject3D(object);
    },
  };
}
