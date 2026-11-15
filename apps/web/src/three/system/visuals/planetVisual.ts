import {
  applyHints,
  buildPlanetStyle,
  RENDER_ORDER_PLANET,
  type AtmosphereHints,
  type PlanetStyle,
} from '@exo/shared';
import * as THREE from 'three';

import {
  QUALITY_PROFILES,
  qualityMonitor,
  type QualityLevel,
  type QualityProfile,
} from '../../host/quality';
import { three } from '../../../styles/theme';
import { disposeObject3D } from '../disposeObject3D';
import { createPlanetPlaceholder } from '../placeholders';
import { createAtmosphereMesh, setAtmosphereLight, updateAtmosphereMesh } from './atmosphereMesh';
import { createCloudMesh, setCloudLight, updateCloudMesh } from './cloudMesh';
import { PLANET_FRAGMENT_SHADER, PLANET_VERTEX_SHADER } from './glsl/planet';
import type { PlanetVisualHandle, SpinController, SpinCtx, VisualCtx } from './types';

/**
 * Процедурная планета (задача 25; п. 7; U41, U51, U52).
 *
 * Иерархия: `root → axisGroup → surface, clouds, atmosphere`. Наклон оси и
 * вращение задаёт задача 26 через `attachSpin`; здесь `axisGroup` не наклонён.
 * Геометрия и материалы создаются один раз, качество и подсказки меняют
 * только uniform-ы и видимость слоёв.
 */

/** Имя меша поверхности. */
export const SURFACE_MESH_NAME = 'surface';

/** Класс мира → имя директивы шейдера. */
const KIND_DEFINE: Readonly<Record<PlanetStyle['kind'], string>> = {
  earthlike: 'KIND_EARTHLIKE',
  ice: 'KIND_ICE',
  desert: 'KIND_DESERT',
  lava: 'KIND_LAVA',
  mini_neptune: 'KIND_MINI_NEPTUNE',
  gas_giant: 'KIND_GAS_GIANT',
};

/** Цвет по умолчанию для отсутствующих полей палитры. */
const FALLBACK_COLOR = three.surfaceFallback;

/** Материал поверхности с типизированными uniform-ами. */
export type PlanetSurfaceMaterial = THREE.ShaderMaterial & {
  uniforms: {
    uColorA: { value: THREE.Color };
    uColorB: { value: THREE.Color };
    uColorC: { value: THREE.Color };
    uColorD: { value: THREE.Color };
    uOceanColor: { value: THREE.Color };
    uIceColor: { value: THREE.Color };
    uGlowColor: { value: THREE.Color };
    uSunColor: { value: THREE.Color };
    uSunDir: { value: THREE.Vector3 };
    uSeed: { value: number };
    uTime: { value: number };
    uSeaLevel: { value: number };
    uOceanFraction: { value: number };
    uIceCap: { value: number };
    uTerrainAmp: { value: number };
    uLavaGlow: { value: number };
    uSpecular: { value: number };
    uBandContrast: { value: number };
    uNightGlow: { value: number };
    uBandsCount: { value: number };
    uOctaves: { value: number };
    uBump: { value: number };
  };
};

/** Проверяет, что стиль относится к планете. */
function isPlanetStyle(style: VisualCtx['style']): style is PlanetStyle {
  return style !== null && typeof style === 'object' && 'palette' in style;
}

/** Цвет из палитры; пустое значение заменяется нейтральным. */
function colorOf(value: string | null | undefined): THREE.Color {
  return new THREE.Color(value ?? FALLBACK_COLOR);
}

/** Цвет поверхности по индексу палитры. */
function surfaceColor(style: PlanetStyle, index: number): THREE.Color {
  const surface = style.palette.surface;

  return colorOf(surface[index] ?? surface[0]);
}

/** Создаёт материал поверхности с директивой класса. */
function createSurfaceMaterial(style: PlanetStyle, profile: QualityProfile): PlanetSurfaceMaterial {
  const defines: Record<string, number> = {
    [KIND_DEFINE[style.kind]]: 1,
  };

  return new THREE.ShaderMaterial({
    vertexShader: PLANET_VERTEX_SHADER,
    fragmentShader: PLANET_FRAGMENT_SHADER,
    defines,
    uniforms: {
      uColorA: { value: surfaceColor(style, 0) },
      uColorB: { value: surfaceColor(style, 1) },
      uColorC: { value: surfaceColor(style, 2) },
      uColorD: { value: surfaceColor(style, 3) },
      uOceanColor: { value: colorOf(style.palette.ocean ?? style.palette.surface[0]) },
      uIceColor: { value: colorOf(style.palette.ice ?? style.palette.surface[2]) },
      uGlowColor: { value: colorOf(style.palette.glow[0] ?? style.palette.surface[0]) },
      uSunColor: { value: new THREE.Color(1, 1, 1) },
      uSunDir: { value: new THREE.Vector3(0, 0, 1) },
      uSeed: { value: style.seed },
      uTime: { value: 0 },
      uSeaLevel: { value: style.seaLevel },
      uOceanFraction: { value: style.oceanFraction },
      uIceCap: { value: style.iceCapExtent },
      uTerrainAmp: { value: style.terrainAmp },
      uLavaGlow: { value: style.lavaGlow },
      uSpecular: { value: style.specular },
      uBandContrast: { value: style.bands?.contrast ?? 0 },
      uNightGlow: { value: style.palette.glow.length > 0 && style.kind === 'gas_giant' ? 1 : 0 },
      uBandsCount: { value: style.bands?.count ?? 0 },
      uOctaves: { value: profile.noiseOctaves },
      uBump: { value: profile.bump ? 1 : 0 },
    },
    toneMapped: false,
  }) as PlanetSurfaceMaterial;
}

/** Копирует стиль в uniform-ы без пересоздания геометрии. */
function applyStyle(material: PlanetSurfaceMaterial, style: PlanetStyle): void {
  material.uniforms.uColorA.value.copy(surfaceColor(style, 0));
  material.uniforms.uColorB.value.copy(surfaceColor(style, 1));
  material.uniforms.uColorC.value.copy(surfaceColor(style, 2));
  material.uniforms.uColorD.value.copy(surfaceColor(style, 3));
  material.uniforms.uOceanColor.value.copy(
    colorOf(style.palette.ocean ?? style.palette.surface[0]),
  );
  material.uniforms.uIceColor.value.copy(colorOf(style.palette.ice ?? style.palette.surface[2]));
  material.uniforms.uGlowColor.value.copy(
    colorOf(style.palette.glow[0] ?? style.palette.surface[0]),
  );
  material.uniforms.uSeaLevel.value = style.seaLevel;
  material.uniforms.uOceanFraction.value = style.oceanFraction;
  material.uniforms.uIceCap.value = style.iceCapExtent;
  material.uniforms.uTerrainAmp.value = style.terrainAmp;
  material.uniforms.uLavaGlow.value = style.lavaGlow;
  material.uniforms.uSpecular.value = style.specular;
  material.uniforms.uBandContrast.value = style.bands?.contrast ?? 0;
  material.uniforms.uNightGlow.value =
    style.palette.glow.length > 0 && style.kind === 'gas_giant' ? 1 : 0;
  material.uniforms.uBandsCount.value = style.bands?.count ?? 0;
}

/** Направление от планеты к звезде. */
function sunDirection(root: THREE.Object3D, sunWorldPos: THREE.Vector3): THREE.Vector3 {
  const planetWorld = new THREE.Vector3();

  root.getWorldPosition(planetWorld);

  const direction = sunWorldPos.clone().sub(planetWorld);

  return direction.lengthSq() > 1e-18 ? direction.normalize() : new THREE.Vector3(0, 0, 1);
}

/**
 * Создаёт планету из рассчитанных данных.
 *
 * Если стиль не строится (`unknown` или `gaps.planetStub`), возвращается
 * заглушка задачи 22 — её заменит задача 27.
 *
 * @param ctx Контекст визуала.
 */
export function createPlanetVisual(ctx: VisualCtx): PlanetVisualHandle {
  const computed = isPlanetStyle(ctx.style) ? ctx.style : buildPlanetStyle(ctx.detail);

  if (computed === null) return createPlanetPlaceholder(ctx);

  const quality = ctx.quality ?? qualityMonitor.level;
  const profile = QUALITY_PROFILES[quality];

  let style = computed;
  let currentQuality = quality;
  let spin: SpinController | null = null;
  let sunColor: [number, number, number] = [1, 1, 1];
  let sunWorld = new THREE.Vector3(0, 0, 0);

  const root = new THREE.Group();
  root.name = 'planet';

  const axisGroup = new THREE.Group();
  axisGroup.name = 'planet-axis';
  root.add(axisGroup);

  const geometry = new THREE.SphereGeometry(
    1,
    profile.sphereSegments,
    Math.max(24, Math.round(profile.sphereSegments / 2)),
  );
  const material = createSurfaceMaterial(style, profile);
  const surface = new THREE.Mesh(geometry, material);

  surface.scale.setScalar(ctx.scale.planetRadius);
  surface.name = SURFACE_MESH_NAME;
  surface.renderOrder = RENDER_ORDER_PLANET;
  surface.userData['layer'] = 'surface';
  axisGroup.add(surface);

  // Облака создаются при любом качестве, если стиль их предусматривает:
  // на low меняется только видимость, структура дерева остаётся прежней.
  const clouds =
    style.cloudCover > 0 ? createCloudMesh(ctx.scale.planetRadius, style, profile) : null;
  if (clouds !== null) {
    clouds.visible = profile.clouds && style.cloudCover > 0;
    axisGroup.add(clouds);
  }

  const atmosphere = createAtmosphereMesh(ctx.scale.planetRadius, style, profile);
  axisGroup.add(atmosphere);

  const applySunState = (): void => {
    const direction = sunDirection(root, sunWorld);

    material.uniforms.uSunDir.value.copy(direction);
    material.uniforms.uSunColor.value.setRGB(sunColor[0], sunColor[1], sunColor[2]);

    if (clouds !== null) setCloudLight(clouds, direction, sunColor);
    setAtmosphereLight(atmosphere, direction);
  };

  const applyQuality = (level: QualityLevel): void => {
    currentQuality = level;
    const next = QUALITY_PROFILES[level];

    material.uniforms.uOctaves.value = next.noiseOctaves;
    material.uniforms.uBump.value = next.bump ? 1 : 0;
    if (clouds !== null) updateCloudMesh(clouds, style, next);
  };

  const unsubscribe =
    ctx.quality === undefined
      ? qualityMonitor.subscribe((level) => applyQuality(level))
      : () => undefined;

  return {
    root,
    object: root,
    axisGroup,
    surface,
    clouds,
    atmosphere,
    setSunState(sunWorldPos: THREE.Vector3, color: [number, number, number]): void {
      sunWorld = sunWorldPos.clone();
      sunColor = [color[0], color[1], color[2]];
      applySunState();
    },
    setQuality(level: QualityLevel): void {
      applyQuality(level);
    },
    setHints(hints: AtmosphereHints | null): void {
      style = applyHints(computed, hints);
      applyStyle(material, style);
      if (clouds !== null) updateCloudMesh(clouds, style, QUALITY_PROFILES[currentQuality]);
      updateAtmosphereMesh(atmosphere, style);
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
      unsubscribe();
      spin?.dispose();
      spin = null;
      disposeObject3D(root);
    },
  };
}
