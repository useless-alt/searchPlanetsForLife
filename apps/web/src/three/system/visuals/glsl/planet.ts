import { NOISE_GLSL } from './noise';

/**
 * Шейдер поверхности планеты (задача 25; п. 7; U41, U51).
 *
 * Один материал на класс: вариант выбирается директивой `#define KIND_*`,
 * поэтому в сцене живёт только один скомпилированный шейдер планеты.
 * Все цвета и коэффициенты приходят uniform-ами из `worldStyle.ts`.
 */

/** Вершинный шейдер планеты. */
export const PLANET_VERTEX_SHADER = /* glsl */ `
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

/** Фрагментный шейдер планеты. */
export const PLANET_FRAGMENT_SHADER = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>

${NOISE_GLSL}

uniform vec3 uColorA;
uniform vec3 uColorB;
uniform vec3 uColorC;
uniform vec3 uColorD;
uniform vec3 uOceanColor;
uniform vec3 uIceColor;
uniform vec3 uGlowColor;
uniform vec3 uSunColor;
uniform vec3 uSunDir;

uniform float uSeed;
uniform float uTime;
uniform float uSeaLevel;
uniform float uOceanFraction;
uniform float uIceCap;
uniform float uTerrainAmp;
uniform float uLavaGlow;
uniform float uSpecular;
uniform float uBandContrast;
uniform float uNightGlow;
uniform int uBandsCount;
uniform int uOctaves;
uniform int uBump;

varying vec3 vObjPos;
varying vec3 vNormalW;
varying vec3 vWorldPos;

vec3 seedVec() {
  return vec3(uSeed * 0.000011, uSeed * 0.000027, uSeed * 0.000019);
}

// Высота поверхности для рельефа и масок. Значения 0…1.
#ifdef KIND_EARTHLIKE
float surfaceHeight(vec3 p) {
  return 0.5 + 0.5 * fbm(p * 1.6 + seedVec(), uOctaves);
}
#endif

#ifdef KIND_ICE
float surfaceHeight(vec3 p) {
  float ridge = 1.0 - abs(2.0 * fbm(p * 4.2 + seedVec(), uOctaves) - 1.0);
  return 0.5 + 0.5 * ridge;
}
#endif

#ifdef KIND_DESERT
float surfaceHeight(vec3 p) {
  return 0.5 + 0.5 * fbm(vec3(p.x * 5.2, p.y * 1.1, p.z * 5.2) + seedVec(), uOctaves);
}
#endif

#ifdef KIND_LAVA
float surfaceHeight(vec3 p) {
  return 0.5 + 0.5 * fbm(p * 3.0 + seedVec(), uOctaves);
}
#endif

#ifdef KIND_MINI_NEPTUNE
float surfaceHeight(vec3 p) {
  return 0.5 + 0.5 * fbm(p * 2.0 + seedVec(), uOctaves);
}
#endif

#ifdef KIND_GAS_GIANT
float surfaceHeight(vec3 p) {
  return 0.5 + 0.5 * fbm(p * 1.7 + seedVec(), uOctaves);
}
#endif

// Возмущение нормали по градиенту высоты: три дополнительных вычисления.
vec3 reliefNormal(vec3 normal, vec3 local) {
#if defined(KIND_EARTHLIKE) || defined(KIND_ICE) || defined(KIND_DESERT) || defined(KIND_LAVA)
  if (uBump > 0) {
    vec3 helper = abs(normal.y) > 0.92 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
    vec3 tangent = normalize(cross(helper, normal));
    vec3 bitangent = cross(normal, tangent);
    float stepSize = 0.012;

    float h0 = surfaceHeight(local);
    float hx = surfaceHeight(local + tangent * stepSize);
    float hy = surfaceHeight(local + bitangent * stepSize);

    normal = normalize(normal + (tangent * (h0 - hx) + bitangent * (h0 - hy)) * uTerrainAmp * 18.0);
  }
#endif

  return normal;
}

void main() {
  #include <logdepthbuf_fragment>

  vec3 local = normalize(vObjPos);
  vec3 normal = reliefNormal(normalize(vNormalW), local);
  vec3 sunDir = normalize(uSunDir);
  vec3 viewDir = normalize(cameraPosition - vWorldPos);

  float ndl = max(dot(normal, sunDir), 0.0);
  float terminator = smoothstep(-0.05, 0.15, dot(normal, sunDir));
  vec3 halfDir = normalize(sunDir + viewDir);

  vec3 base = uColorA;
  vec3 emissive = vec3(0.0);
  float specular = 0.0;
  float lat = abs(local.y);

#ifdef KIND_EARTHLIKE
  float height = surfaceHeight(local);
  float oceanMask = 1.0 - smoothstep(uSeaLevel - 0.018, uSeaLevel + 0.018, height);
  oceanMask *= step(0.0001, uOceanFraction);

  vec3 land = mix(uColorA, uColorB, smoothstep(0.35, 0.72, height));
  land = mix(land, uColorC, smoothstep(0.6, 0.92, height) * smoothstep(0.2, 0.8, lat));
  float shoreline = 1.0 - smoothstep(0.0, 0.028, abs(height - uSeaLevel));
  land = mix(land, land * 1.06, shoreline * (1.0 - oceanMask));

  base = mix(land, uOceanColor, oceanMask);
  specular = uSpecular * oceanMask * pow(max(dot(normal, halfDir), 0.0), 72.0);

  float iceEdge = 1.0 - uIceCap + 0.04 * fbm(local * 7.0 + seedVec(), uOctaves);
  float ice = smoothstep(iceEdge - 0.02, iceEdge + 0.02, lat) * step(0.0001, uIceCap);
  base = mix(base, uIceColor, ice);
#endif

#ifdef KIND_ICE
  float iceHeight = surfaceHeight(local);
  float cracks = smoothstep(0.45, 0.9, iceHeight);
  base = mix(uColorA, uColorB, smoothstep(0.25, 0.7, iceHeight));
  base = mix(base, uColorC, smoothstep(0.55, 0.95, lat));
  base = mix(base, uColorD, cracks * 0.55);
  specular = uSpecular * (1.0 - cracks) * pow(max(dot(normal, halfDir), 0.0), 48.0);
#endif

#ifdef KIND_DESERT
  float dune = surfaceHeight(local);
  float stripes = 0.5 + 0.5 * sin(local.y * 17.0 + dune * 5.0);
  base = mix(uColorA, uColorB, stripes);
  base = mix(base, uColorC, smoothstep(0.55, 0.9, dune));
  base = mix(base, uColorD, smoothstep(0.6, 0.95, lat) * 0.55);
  specular = 0.0;
#endif

#ifdef KIND_LAVA
  float crust = surfaceHeight(local);
  float ridge = 1.0 - abs(2.0 * fbm(local * 5.0 + seedVec(), uOctaves) - 1.0);
  float cracks = smoothstep(0.62, 0.94, ridge);
  base = mix(uColorA, uColorB, crust * 0.7);
  emissive = uGlowColor * uLavaGlow * cracks;
  specular = uSpecular * 0.2 * pow(max(dot(normal, halfDir), 0.0), 28.0);
#endif

#if defined(KIND_MINI_NEPTUNE) || defined(KIND_GAS_GIANT)
  float turbulence = fbm(local * 2.0 + seedVec(), uOctaves);
  float bandPhase = local.y * float(uBandsCount) * 6.283185 + turbulence * 2.4;
  float band = 0.5 + 0.5 * sin(bandPhase);
  vec3 bandColor = mix(uColorB, uColorA, smoothstep(0.12, 0.88, band));
  bandColor = mix(bandColor, uColorC, smoothstep(0.6, 0.95, turbulence + 0.5));
  base = mix(uColorA, bandColor, 0.45 + 0.55 * uBandContrast);
  specular = uSpecular * pow(max(dot(normal, halfDir), 0.0), 24.0);
  emissive += uGlowColor * uNightGlow * (1.0 - smoothstep(-0.15, 0.2, dot(normal, sunDir))) * 0.22;
#endif

  vec3 ambient = base * 0.02;
  vec3 lit = ambient + base * ndl * terminator * uSunColor;
  lit += uSunColor * specular;
  lit += emissive;

  gl_FragColor = vec4(lit, 1.0);
}
`;
