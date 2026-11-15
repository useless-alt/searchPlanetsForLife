import { NOISE_GLSL } from './noise';

/**
 * Шейдер облачного слоя (задача 25; п. 7; U51).
 *
 * Альфа: `smoothstep(1 − cloudCover, 1, fbm(objPos · 2.4 + seed + shift))`.
 * Слой полупрозрачный, не пишет глубину и не использует alphaTest.
 * Сдвиг облаков — точка подключения задачи 26 (`uCloudShift`).
 */

/** Вершинный шейдер облаков. */
export const CLOUD_VERTEX_SHADER = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>

varying vec3 vObjPos;
varying vec3 vNormalW;
varying vec3 vWorldPos;

void main() {
  vObjPos = normalize(position);
  vNormalW = normalize(mat3(modelMatrix) * normal);
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorldPos = world.xyz;

  gl_Position = projectionMatrix * viewMatrix * world;

  #include <logdepthbuf_vertex>
}
`;

/** Фрагментный шейдер облаков. */
export const CLOUD_FRAGMENT_SHADER = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>

${NOISE_GLSL}

uniform vec3 uColor;
uniform vec3 uSunColor;
uniform vec3 uSunDir;
uniform vec3 uCloudShift;
uniform float uSeed;
uniform float uCloudCover;
uniform int uOctaves;

varying vec3 vObjPos;
varying vec3 vNormalW;
varying vec3 vWorldPos;

void main() {
  #include <logdepthbuf_fragment>

  vec3 seedOffset = vec3(uSeed * 0.000021, uSeed * 0.000013, uSeed * 0.000029);
  float field = fbm(normalize(vObjPos) * 2.4 + seedOffset + uCloudShift, uOctaves);
  float alpha = smoothstep(1.0 - uCloudCover, 1.0, field);

  vec3 normal = normalize(vNormalW);
  vec3 sunDir = normalize(uSunDir);
  float light = 0.18 + 0.82 * max(dot(normal, sunDir), 0.0);

  gl_FragColor = vec4(uColor * light * uSunColor, alpha);
}
`;
