import { RENDER_ORDER_CLOUDS, type PlanetStyle } from '@exo/shared';
import * as THREE from 'three';

import { three } from '../../../styles/theme';
import type { QualityProfile } from '../../host/quality';
import { CLOUD_FRAGMENT_SHADER, CLOUD_VERTEX_SHADER } from './glsl/clouds';

/**
 * Облачный слой планеты (задача 25; п. 7; U51).
 *
 * Меш создаётся при `cloudCover > 0` и существует при любом качестве;
 * на `low` он только скрывается (`visible = false`), чтобы структура
 * дерева не зависела от профиля. Сфера — `1.012 · planetRadius`.
 */

/** Имя меша в дереве планеты. */
export const CLOUD_MESH_NAME = 'clouds';

/** Радиус облаков относительно радиуса планеты. */
export const CLOUD_RADIUS_FACTOR = 1.012;

/** Материал облаков с типизированными uniform-ами. */
export type CloudMaterial = THREE.ShaderMaterial & {
  uniforms: {
    uColor: { value: THREE.Color };
    uSunColor: { value: THREE.Color };
    uSunDir: { value: THREE.Vector3 };
    uCloudShift: { value: THREE.Vector3 };
    uSeed: { value: number };
    uCloudCover: { value: number };
    uOctaves: { value: number };
  };
};

/**
 * Создаёт облачный слой.
 *
 * @param planetRadius Радиус планеты в единицах сцены.
 * @param style Стиль планеты.
 * @param profile Профиль качества.
 */
export function createCloudMesh(
  planetRadius: number,
  style: PlanetStyle,
  profile: QualityProfile,
): THREE.Mesh {
  const geometry = new THREE.SphereGeometry(
    1,
    profile.sphereSegments,
    Math.max(24, Math.round(profile.sphereSegments / 2)),
  );
  const material = new THREE.ShaderMaterial({
    vertexShader: CLOUD_VERTEX_SHADER,
    fragmentShader: CLOUD_FRAGMENT_SHADER,
    uniforms: {
      uColor: { value: new THREE.Color(three.cloudColor) },
      uSunColor: { value: new THREE.Color(1, 1, 1) },
      uSunDir: { value: new THREE.Vector3(0, 0, 1) },
      uCloudShift: { value: new THREE.Vector3(0, 0, 0) },
      uSeed: { value: style.seed },
      uCloudCover: { value: style.cloudCover },
      uOctaves: { value: profile.noiseOctaves },
    },
    transparent: true,
    depthWrite: false,
    side: THREE.FrontSide,
    toneMapped: false,
  }) as CloudMaterial;
  const mesh = new THREE.Mesh(geometry, material);

  mesh.scale.setScalar(planetRadius * CLOUD_RADIUS_FACTOR);
  mesh.name = CLOUD_MESH_NAME;
  mesh.renderOrder = RENDER_ORDER_CLOUDS;
  mesh.userData['layer'] = 'clouds';

  return mesh;
}

/**
 * Обновляет uniform-ы облаков без пересоздания геометрии.
 *
 * @param mesh Меш, созданный `createCloudMesh`.
 * @param style Новый стиль.
 * @param profile Текущий профиль качества.
 */
export function updateCloudMesh(
  mesh: THREE.Mesh,
  style: PlanetStyle,
  profile: QualityProfile,
): void {
  const material = mesh.material as CloudMaterial;

  material.uniforms.uCloudCover.value = style.cloudCover;
  material.uniforms.uOctaves.value = profile.noiseOctaves;
  mesh.visible = profile.clouds && style.cloudCover > 0;
}

/**
 * Задаёт направление и цвет света звезды.
 *
 * @param mesh Меш облаков.
 * @param direction Единичный вектор от планеты к звезде.
 * @param color Цвет света 0…1.
 */
export function setCloudLight(
  mesh: THREE.Mesh,
  direction: THREE.Vector3,
  color?: readonly [number, number, number],
): void {
  const material = mesh.material as CloudMaterial;

  material.uniforms.uSunDir.value.copy(direction);
  if (color !== undefined) material.uniforms.uSunColor.value.setRGB(color[0], color[1], color[2]);
}
