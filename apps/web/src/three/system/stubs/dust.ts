import { mulberry32 } from '@exo/shared';
import * as THREE from 'three';

import { QUALITY_PROFILES, type QualityLevel } from '../../host/quality';

/**
 * Облако пыли вокруг заглушки (задача 27; п. 9.2, 9.5; U51, U55).
 *
 * Точки распределены в сферическом слое `[1.5, 3.2]·radius`, сплющены по Y
 * на 25 %. Число точек задаёт профиль качества; при понижении меняется
 * только `drawRange`, буферы не пересоздаются. Анимация (вращение и
 * мерцание) отключается при `prefers-reduced-motion`.
 */

/** Минимальный множитель радиуса пыли. */
export const DUST_INNER_FACTOR = 1.5;

/** Максимальный множитель радиуса пыли. */
export const DUST_OUTER_FACTOR = 3.2;

/** Сплющивание облака по Y. */
export const DUST_FLATTEN_Y = 0.75;

/** Скорость вращения пыли [рад/с]. */
export const DUST_ROTATION_RAD_PER_SEC = 0.02;

/** Ширина точки в шейдере. */
export const DUST_POINT_SCALE = 10;

/** Порядок отрисовки пыли (после облаков планеты). */
export const DUST_RENDER_ORDER = 4;

/** Вершинный шейдер пыли. */
export const DUST_VERTEX_SHADER = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>

attribute float aSize;
attribute float aAlpha;
attribute float aPhase;

uniform float uTime;
uniform float uScale;
uniform float uFlicker;
uniform vec3 uColor;

varying vec3 vColor;
varying float vAlpha;

void main() {
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);

  float flicker = mix(1.0, 0.85 + 0.15 * sin(uTime + aPhase), uFlicker);
  float shade = 0.85 + 0.3 * fract(aPhase * 0.15915494309);

  vColor = uColor * shade;
  vAlpha = aAlpha * flicker;

  gl_PointSize = clamp(aSize * uScale / max(-mvPosition.z, 0.001), 1.0, 8.0);
  gl_Position = projectionMatrix * mvPosition;

  #include <logdepthbuf_vertex>
}
`;

/** Фрагментный шейдер пыли. */
export const DUST_FRAGMENT_SHADER = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>

varying vec3 vColor;
varying float vAlpha;

void main() {
  #include <logdepthbuf_fragment>

  vec2 offset = gl_PointCoord - vec2(0.5);
  float distance = length(offset);

  if (distance > 0.5) discard;

  float soft = smoothstep(0.5, 0.12, distance);
  gl_FragColor = vec4(vColor, vAlpha * soft);
}
`;

/** Настройки облака пыли. */
export interface DustOptions {
  /** Радиус объекта-заглушки [единицы сцены]. */
  radius: number;
  /** Seed для детерминированного распределения. */
  seed: number;
  /** Число точек (из профиля качества). */
  count: number;
  /** Цвет пыли (`--stub-dust`). */
  color: string;
  /** Отключить анимацию (U55). */
  reducedMotion?: boolean;
}

/** Живое облако пыли. */
export interface DustCloud {
  /** Объект, добавляемый в дерево заглушки. */
  object: THREE.Points;
  /** Сколько точек реально рисуется. */
  count: number;
  /** Смена профиля качества без пересоздания буферов. */
  setQuality(level: QualityLevel): void;
  /** Шаг анимации. */
  update(dtSec: number, timeSec: number): void;
  /** Освобождение геометрии и материала. */
  dispose(): void;
}

/** Ограничивает число точек. */
function safeCount(count: number): number {
  if (!Number.isFinite(count)) return 0;

  return Math.max(0, Math.floor(count));
}

/**
 * Создаёт облако пыли.
 *
 * @param options Радиус, seed, число точек, цвет и reduced motion.
 */
export function createDust(options: DustOptions): DustCloud {
  const allocated = safeCount(options.count);
  const radius = Number.isFinite(options.radius) && options.radius > 0 ? options.radius : 1;
  const random = mulberry32(options.seed >>> 0);
  const positions = new Float32Array(allocated * 3);
  const sizes = new Float32Array(allocated);
  const alphas = new Float32Array(allocated);
  const phases = new Float32Array(allocated);
  const reducedMotion = options.reducedMotion ?? false;

  for (let index = 0; index < allocated; index += 1) {
    const radial =
      radius * (DUST_INNER_FACTOR + (DUST_OUTER_FACTOR - DUST_INNER_FACTOR) * random() ** 0.7);
    const z = 2 * random() - 1;
    const phi = 2 * Math.PI * random();
    const ring = Math.sqrt(Math.max(0, 1 - z * z));

    positions[index * 3] = radial * ring * Math.cos(phi);
    positions[index * 3 + 1] = radial * z * DUST_FLATTEN_Y;
    positions[index * 3 + 2] = radial * ring * Math.sin(phi);
    sizes[index] = 2 + 4 * random();
    alphas[index] = 0.15 + 0.35 * random();
    phases[index] = 2 * Math.PI * random();
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute('aAlpha', new THREE.BufferAttribute(alphas, 1));
  geometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
  geometry.setDrawRange(0, allocated);

  const material = new THREE.ShaderMaterial({
    vertexShader: DUST_VERTEX_SHADER,
    fragmentShader: DUST_FRAGMENT_SHADER,
    uniforms: {
      uColor: { value: new THREE.Color(options.color) },
      uTime: { value: 0 },
      uScale: { value: DUST_POINT_SCALE },
      uFlicker: { value: reducedMotion ? 0 : 1 },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
    toneMapped: false,
  });

  const points = new THREE.Points(geometry, material);
  points.name = 'stub-dust';
  points.renderOrder = DUST_RENDER_ORDER;
  points.frustumCulled = false;
  points.userData['layer'] = 'dust';

  let drawn = allocated;
  let disposed = false;

  return {
    object: points,
    get count(): number {
      return drawn;
    },
    setQuality(level: QualityLevel): void {
      if (disposed) return;

      drawn = Math.min(allocated, QUALITY_PROFILES[level].dust);
      geometry.setDrawRange(0, drawn);
    },
    update(_dtSec: number, timeSec: number): void {
      if (disposed || reducedMotion) return;

      const time = Number.isFinite(timeSec) ? timeSec : 0;

      points.rotation.y = DUST_ROTATION_RAD_PER_SEC * time;
      material.uniforms['uTime']!.value = time;
    },
    dispose(): void {
      if (disposed) return;

      disposed = true;
      points.removeFromParent();
      geometry.dispose();
      material.dispose();
    },
  };
}
