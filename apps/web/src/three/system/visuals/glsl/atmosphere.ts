/**
 * Шейдер атмосферной оболочки (задача 25; п. 7; U51).
 *
 * Свечение `pow(max(0.7 − dot(N, V), 0), 3) · density` умножается на
 * освещённость стороны. Оболочка аддитивная и не пишет глубину; толщина
 * визуально преувеличена и не является физической.
 */

/** Вершинный шейдер атмосферы. */
export const ATMOSPHERE_VERTEX_SHADER = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>

varying vec3 vNormalW;
varying vec3 vWorldPos;

void main() {
  vNormalW = normalize(mat3(modelMatrix) * normal);
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorldPos = world.xyz;

  gl_Position = projectionMatrix * viewMatrix * world;

  #include <logdepthbuf_vertex>
}
`;

/** Фрагментный шейдер атмосферы. */
export const ATMOSPHERE_FRAGMENT_SHADER = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>

uniform vec3 uColor;
uniform vec3 uSunDir;
uniform float uDensity;

varying vec3 vNormalW;
varying vec3 vWorldPos;

void main() {
  #include <logdepthbuf_fragment>

  vec3 normal = normalize(vNormalW);
  vec3 viewDir = normalize(cameraPosition - vWorldPos);
  vec3 sunDir = normalize(uSunDir);

  float rim = pow(max(0.7 - dot(normal, viewDir), 0.0), 3.0);
  float light = 0.3 + 0.7 * smoothstep(-0.1, 0.25, dot(normal, sunDir));
  float alpha = clamp(rim * uDensity * light, 0.0, 0.9);

  gl_FragColor = vec4(uColor * light, alpha);
}
`;
