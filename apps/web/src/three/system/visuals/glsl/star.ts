import { NOISE_GLSL } from './noise';

/**
 * Шейдер фотосферы звезды (задача 25; п. 6; U51).
 *
 * Цвет умножается на яркость, потемнение к краю задано
 * `I = 1 − limbU·(1 − μ)`. Грануляция и пятна считаются в объектном
 * пространстве по нормализованному радиус-вектору, без UV. Звезда
 * самосветящаяся: другие источники света её не освещают.
 */

/** Вершинный шейдер фотосферы. */
export const STAR_VERTEX_SHADER = /* glsl */ `
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

/** Фрагментный шейдер фотосферы. */
export const STAR_FRAGMENT_SHADER = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>

${NOISE_GLSL}

uniform vec3 uColor;
uniform float uBrightness;
uniform float uActivity;
uniform float uSpotCover;
uniform float uLimbU;
uniform float uGranulation;
uniform float uSeed;
uniform float uTime;
uniform int uOctaves;

varying vec3 vObjPos;
varying vec3 vNormalW;
varying vec3 vWorldPos;

void main() {
  #include <logdepthbuf_fragment>

  vec3 normal = normalize(vNormalW);
  vec3 viewDir = normalize(cameraPosition - vWorldPos);
  float mu = clamp(dot(normal, viewDir), 0.0, 1.0);

  // Потемнение к краю (п. 6).
  float limb = 1.0 - uLimbU * (1.0 - mu);

  // Грануляция: fbm(objPos · granulation + uTime · 0.05).
  vec3 seedOffset = vec3(uSeed * 0.000013, uSeed * 0.000031, uSeed * 0.000017);
  float granules = fbm(vObjPos * uGranulation + seedOffset + vec3(uTime * 0.05), uOctaves);

  // Пятна: выше порога 1 − spotCover, затемнение на 55 %.
  float spotField = fbm(vObjPos * 2.2 + seedOffset, uOctaves);
  float spot = step(1.0 - uSpotCover, spotField);
  float spotFactor = mix(1.0, 0.45, spot);

  float intensity = (0.78 + 0.32 * granules) * limb * spotFactor * uBrightness;
  vec3 color = mix(uColor, vec3(1.0), 0.16 * uActivity * granules) * intensity;

  gl_FragColor = vec4(color, 1.0);
}
`;
