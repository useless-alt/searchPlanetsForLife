import { RENDER_ORDER_ATMOSPHERE, type PlanetStyle } from '@exo/shared';
import * as THREE from 'three';

import { three } from '../../../styles/theme';
import type { QualityProfile } from '../../host/quality';
import { ATMOSPHERE_FRAGMENT_SHADER, ATMOSPHERE_VERTEX_SHADER } from './glsl/atmosphere';

/**
 * Атмосферная оболочка планеты (задача 25; п. 7; U51).
 *
 * Геометрия создаётся один раз по профилю качества; смена качества и
 * подсказки об атмосфере меняют только uniform-значения. Толщина
 * визуально преувеличена: `planetRadius · (1 + clamp(3·thickness, 0.03, 0.15))`.
 */

/** Имя меша в дереве планеты. */
export const ATMOSPHERE_MESH_NAME = 'atmosphere';

/** Цвет по умолчанию, если стиль ещё не применён. */
const FALLBACK_COLOR = three.atmosphereFallback;

/** Материал атмосферы с типизированными uniform-ами. */
export type AtmosphereMaterial = THREE.ShaderMaterial & {
  uniforms: {
    uColor: { value: THREE.Color };
    uSunDir: { value: THREE.Vector3 };
    uDensity: { value: number };
  };
};

/** Визуальный коэффициент толщины атмосферы. */
export function atmosphereScaleFactor(thickness: number): number {
  return 1 + Math.min(0.15, Math.max(0.03, 3 * thickness));
}

/**
 * Создаёт атмосферную оболочку.
 *
 * @param planetRadius Радиус планеты в единицах сцены.
 * @param style Стиль планеты.
 * @param profile Профиль качества (число сегментов).
 */
export function createAtmosphereMesh(
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
    vertexShader: ATMOSPHERE_VERTEX_SHADER,
    fragmentShader: ATMOSPHERE_FRAGMENT_SHADER,
    uniforms: {
      uColor: { value: new THREE.Color(style.atmosphere.color || FALLBACK_COLOR) },
      uSunDir: { value: new THREE.Vector3(0, 0, 1) },
      uDensity: { value: style.atmosphere.density },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide,
    toneMapped: false,
  }) as AtmosphereMaterial;
  const mesh = new THREE.Mesh(geometry, material);

  mesh.scale.setScalar(planetRadius * atmosphereScaleFactor(style.atmosphere.thickness));
  mesh.name = ATMOSPHERE_MESH_NAME;
  mesh.renderOrder = RENDER_ORDER_ATMOSPHERE;
  mesh.userData['layer'] = 'atmosphere';

  return mesh;
}

/**
 * Обновляет uniform-ы атмосферы без пересоздания геометрии.
 *
 * @param mesh Меш, созданный `createAtmosphereMesh`.
 * @param style Новый стиль.
 */
export function updateAtmosphereMesh(mesh: THREE.Mesh, style: PlanetStyle): void {
  const material = mesh.material as AtmosphereMaterial;

  material.uniforms.uColor.value.set(style.atmosphere.color || FALLBACK_COLOR);
  material.uniforms.uDensity.value = style.atmosphere.density;
}

/**
 * Задаёт направление на звезду для освещения оболочки.
 *
 * @param mesh Меш атмосферы.
 * @param direction Единичный вектор от планеты к звезде.
 */
export function setAtmosphereLight(mesh: THREE.Mesh, direction: THREE.Vector3): void {
  const material = mesh.material as AtmosphereMaterial;

  material.uniforms.uSunDir.value.copy(direction);
}
