import {
  buildStarStyle,
  fnv1a32,
  RENDER_ORDER_CORONA,
  RENDER_ORDER_STAR,
  type StarStyle,
} from '@exo/shared';
import * as THREE from 'three';

import {
  QUALITY_PROFILES,
  qualityMonitor,
  type QualityLevel,
  type QualityProfile,
} from '../../host/quality';
import { disposeObject3D } from '../disposeObject3D';
import { STAR_FRAGMENT_SHADER, STAR_VERTEX_SHADER } from './glsl/star';
import type { StarVisualHandle, VisualCtx } from './types';

/**
 * Процедурная звезда (задача 25; п. 6; U51).
 *
 * Фотосфера — шар единичного радиуса, масштабированный `scale.starRadius`.
 * Корона — два аддитивных Sprite с процедурной радиальной текстурой:
 * внутренний слой радиусом `coronaScale · starRadius`, внешний в 1.5 раза
 * шире и тусклее. Звезда самосветящаяся, `renderOrder` 0 и 1.
 */

/** Имя меша фотосферы. */
export const STAR_SURFACE_MESH_NAME = 'photosphere';

/** Имена спрайтов короны. */
export const STAR_CORONA_INNER_NAME = 'corona-inner';
export const STAR_CORONA_OUTER_NAME = 'corona-outer';

/** Размер процедурной текстуры короны. */
export const CORONA_TEXTURE_SIZE = 64;

/** Материал фотосферы. */
export type StarSurfaceMaterial = THREE.ShaderMaterial & {
  uniforms: {
    uColor: { value: THREE.Color };
    uBrightness: { value: number };
    uActivity: { value: number };
    uSpotCover: { value: number };
    uLimbU: { value: number };
    uGranulation: { value: number };
    uSeed: { value: number };
    uTime: { value: number };
    uOctaves: { value: number };
  };
};

/** Цвет Three.js из нормализованных каналов. */
function unitColor(channels: readonly [number, number, number]): THREE.Color {
  return new THREE.Color().setRGB(channels[0], channels[1], channels[2]);
}

/**
 * Процедурная радиальная текстура 64×64 для короны.
 *
 * Альфа спадает от центра к краю; `generateMipmaps` выключен, чтобы
 * текстура одинаково выглядела на всех профилях качества.
 */
export function createCoronaTexture(): THREE.DataTexture {
  const size = CORONA_TEXTURE_SIZE;
  const data = new Uint8Array(size * size * 4);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = (x + 0.5) / size - 0.5;
      const dy = (y + 0.5) / size - 0.5;
      const distance = Math.min(1, Math.sqrt(dx * dx + dy * dy) * 2);
      const alpha = Math.max(0, 1 - distance) ** 2.4;
      const index = (y * size + x) * 4;

      data[index] = 255;
      data[index + 1] = 255;
      data[index + 2] = 255;
      data[index + 3] = Math.round(alpha * 255);
    }
  }

  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.needsUpdate = true;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;

  return texture;
}

/** Создаёт материал фотосферы. */
function createSurfaceMaterial(style: StarStyle, profile: QualityProfile): StarSurfaceMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: STAR_VERTEX_SHADER,
    fragmentShader: STAR_FRAGMENT_SHADER,
    uniforms: {
      uColor: { value: unitColor(style.color) },
      uBrightness: { value: style.brightness },
      uActivity: { value: style.activity },
      uSpotCover: { value: style.spotCover },
      uLimbU: { value: style.limbU },
      uGranulation: { value: style.granulation },
      uSeed: { value: style.seed },
      uTime: { value: 0 },
      uOctaves: { value: profile.noiseOctaves },
    },
    toneMapped: false,
  }) as StarSurfaceMaterial;
}

/** Создаёт один спрайт короны. */
function createCoronaSprite(
  texture: THREE.Texture,
  color: THREE.Color,
  radius: number,
  opacity: number,
  name: string,
): THREE.Sprite {
  const material = new THREE.SpriteMaterial({
    map: texture,
    color,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    opacity,
  });
  const sprite = new THREE.Sprite(material);

  // Спрайты Three.js делят статическую геометрию; клонируем, чтобы
  // dispose каждого визуала освобождал только свои GPU-ресурсы.
  sprite.geometry = sprite.geometry.clone();
  sprite.scale.setScalar(radius * 2);
  sprite.name = name;
  sprite.renderOrder = RENDER_ORDER_CORONA;
  sprite.userData['layer'] = 'corona';

  return sprite;
}

/**
 * Создаёт звезду из рассчитанных данных.
 *
 * @param ctx Контекст визуала.
 */
export function createStarVisual(ctx: VisualCtx): StarVisualHandle {
  const style: StarStyle =
    ctx.style !== null && typeof ctx.style === 'object' && 'brightness' in ctx.style
      ? ctx.style
      : buildStarStyle(ctx.detail.resolved, fnv1a32(ctx.detail.id));
  const quality = ctx.quality ?? qualityMonitor.level;
  const profile = QUALITY_PROFILES[quality];

  const root = new THREE.Group();
  root.name = 'star';

  const geometry = new THREE.SphereGeometry(
    1,
    profile.sphereSegments,
    Math.max(24, Math.round(profile.sphereSegments / 2)),
  );
  const material = createSurfaceMaterial(style, profile);
  const surface = new THREE.Mesh(geometry, material);

  surface.scale.setScalar(ctx.scale.starRadius);
  surface.name = STAR_SURFACE_MESH_NAME;
  surface.renderOrder = RENDER_ORDER_STAR;
  surface.userData['layer'] = 'photosphere';
  root.add(surface);

  const coronaRadius = style.coronaScale * ctx.scale.starRadius;
  const coronaColor = unitColor(style.sunColor);
  const texture = createCoronaTexture();
  const inner = createCoronaSprite(
    texture,
    coronaColor,
    coronaRadius,
    0.55,
    STAR_CORONA_INNER_NAME,
  );
  const outer = createCoronaSprite(
    texture,
    coronaColor,
    coronaRadius * 1.5,
    0.25,
    STAR_CORONA_OUTER_NAME,
  );

  root.add(inner, outer);

  const unsubscribe =
    ctx.quality === undefined
      ? qualityMonitor.subscribe((level) => {
          material.uniforms.uOctaves.value = QUALITY_PROFILES[level].noiseOctaves;
        })
      : () => undefined;

  return {
    root,
    object: root,
    setQuality(level: QualityLevel): void {
      material.uniforms.uOctaves.value = QUALITY_PROFILES[level].noiseOctaves;
    },
    update(_dtSec: number, timeSec = 0): void {
      material.uniforms.uTime.value = timeSec;
    },
    dispose(): void {
      unsubscribe();
      disposeObject3D(root);
    },
  };
}
