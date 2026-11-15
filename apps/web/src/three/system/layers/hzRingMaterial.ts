import * as THREE from 'three';

import { HZ_FILL_OPACITY, tokens, three as threeTokens } from '../../../styles/theme';

/**
 * Материал кольца зоны обитаемости (задача 24; п. 11.4).
 *
 * Полупрозрачная заливка цвета `--hz-fill` с мягкими краями (затухание на 4 %
 * ширины кольца у обеих границ) и два контура толщиной около 1 px цветом
 * `--hz-edge`. Контуры рисуются в том же шейдере, поэтому у слоя одна
 * геометрия и один материал: смена границ освобождает ровно один буфер.
 *
 * Материал не пишет глубину и имеет `renderOrder` зоны обитаемости, поэтому
 * кольцо не перекрывает планету и орбиту.
 */

/** Доля ширины кольца, отведённая на мягкое затухание у каждой границы. */
export const HZ_FADE_FRACTION = 0.04;

/** Имя mesh кольца внутри группы слоя. */
export const HZ_RING_NAME = 'hz-ring';

/** Вершинный шейдер: радиальное расстояние считается в мировых координатах. */
const VERTEX_SHADER = /* glsl */ `
  varying float vRadius;

  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vRadius = length(worldPosition.xz);
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

/** Фрагментный шейдер: заливка с мягкими краями и два контура по 1 px. */
const FRAGMENT_SHADER = /* glsl */ `
  uniform vec3 uFill;
  uniform vec3 uEdge;
  uniform float uOpacity;
  uniform float uInnerRadius;
  uniform float uOuterRadius;
  uniform float uFadeFraction;

  varying float vRadius;

  void main() {
    float width = max(uOuterRadius - uInnerRadius, 0.000001);
    float fade = width * uFadeFraction;

    float fillAlpha =
      smoothstep(uInnerRadius, uInnerRadius + fade, vRadius) *
      (1.0 - smoothstep(uOuterRadius - fade, uOuterRadius, vRadius));

    // Один пиксель в единицах радиуса: fwidth даёт размер фрагмента на экране.
    float pixel = max(fwidth(vRadius), 0.000001);
    float innerLine = 1.0 - smoothstep(0.0, pixel, vRadius - uInnerRadius);
    float outerLine = 1.0 - smoothstep(0.0, pixel, uOuterRadius - vRadius);
    float edgeLine = max(innerLine, outerLine);

    vec3 color = mix(uFill, uEdge, edgeLine);
    float alpha = max(fillAlpha * uOpacity, edgeLine);

    gl_FragColor = vec4(color, alpha);

    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/** Параметры материала кольца. */
export interface HzRingMaterialOptions {
  /** Внутренний радиус кольца [единицы сцены]. */
  innerRadius: number;
  /** Внешний радиус кольца [единицы сцены]. */
  outerRadius: number;
  /** Непрозрачность заливки; по умолчанию 0.18, допустимо 0.12–0.30. */
  opacity?: number;
}

/**
 * Создаёт материал кольца зоны обитаемости.
 *
 * @param options Радиусы и необязательная непрозрачность.
 * @returns Настроенный `ShaderMaterial`.
 */
export function createHzRingMaterial(options: HzRingMaterialOptions): THREE.ShaderMaterial {
  const opacity = options.opacity ?? HZ_FILL_OPACITY;
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uFill: { value: new THREE.Color(tokens['hz-fill']) },
      uEdge: { value: new THREE.Color(threeTokens.hzEdge) },
      uOpacity: { value: opacity },
      uInnerRadius: { value: options.innerRadius },
      uOuterRadius: { value: options.outerRadius },
      uFadeFraction: { value: HZ_FADE_FRACTION },
    },
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    transparent: true,
    depthTest: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    opacity,
  });

  return material;
}

/**
 * Обновляет радиусы и непрозрачность материала без пересоздания.
 *
 * @param material Материал кольца.
 * @param innerRadius Новый внутренний радиус [единицы сцены].
 * @param outerRadius Новый внешний радиус [единицы сцены].
 * @param opacity Необязательная новая непрозрачность.
 */
export function updateHzRingMaterial(
  material: THREE.ShaderMaterial,
  innerRadius: number,
  outerRadius: number,
  opacity?: number,
): void {
  const uniforms = material.uniforms;

  if (uniforms['uInnerRadius'] !== undefined) uniforms['uInnerRadius'].value = innerRadius;
  if (uniforms['uOuterRadius'] !== undefined) uniforms['uOuterRadius'].value = outerRadius;

  if (opacity !== undefined) {
    material.opacity = opacity;
    if (uniforms['uOpacity'] !== undefined) uniforms['uOpacity'].value = opacity;
  }
}
