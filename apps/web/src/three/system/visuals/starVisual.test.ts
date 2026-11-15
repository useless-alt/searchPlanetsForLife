import {
  buildStarStyle,
  DEFAULT_SETTINGS,
  fnv1a32,
  makeParam,
  nullParam,
  RENDER_ORDER_CORONA,
  RENDER_ORDER_STAR,
  type ResolvedPlanet,
  type ScaleModel,
  type SolverFlags,
} from '@exo/shared';
import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';

import type { PlanetDetail } from '../../../workers/protocol';
import { STAR_FRAGMENT_SHADER, STAR_VERTEX_SHADER } from './glsl/star';
import {
  CORONA_TEXTURE_SIZE,
  createStarVisual,
  STAR_CORONA_INNER_NAME,
  STAR_CORONA_OUTER_NAME,
  STAR_SURFACE_MESH_NAME,
  type StarSurfaceMaterial,
} from './starVisual';
import type { VisualCtx } from './types';

/**
 * Тесты процедурной звезды (задача 25; п. 6; U51).
 *
 * Проверяются единичная геометрия и масштаб, две спрайтовые короны,
 * материалы, порядок отрисовки, обновление времени и освобождение.
 */

/** Флаги решателя по умолчанию. */
function flags(): SolverFlags {
  return {
    insufficient_data: false,
    levelB_mass: false,
    levelB_radius: false,
    e_assumed_zero: false,
    excluded_subindices: [],
    k: 4,
    n: 4,
    strict_complete: false,
    available: {
      ESI_R: true,
      ESI_rho: true,
      ESI_ve: true,
      ESI_S: true,
      ESI_T: true,
      F_HZ: true,
    },
  };
}

/** Разрешённая планета вокруг звезды. */
function resolved(): ResolvedPlanet {
  return {
    id: 'star-1',
    R: makeParam(1, 'measured'),
    M: makeParam(1, 'measured'),
    e: makeParam(0, 'measured'),
    d: makeParam(1, 'measured'),
    P: makeParam(365, 'measured'),
    S: makeParam(1, 'measured'),
    T_eq: makeParam(255, 'physics'),
    rho: nullParam(),
    L: makeParam(1, 'measured'),
    st_teff: makeParam(5772, 'measured'),
    st_rad: makeParam(1, 'measured'),
    st_mass: makeParam(1, 'measured'),
    dist_pc: makeParam(10, 'measured'),
    ra: makeParam(1, 'measured'),
    dec: makeParam(2, 'measured'),
    flags: flags(),
  };
}

/** Деталь планеты. */
function detail(): PlanetDetail {
  return {
    id: 'star-1',
    name: 'Star 1 b',
    hostname: 'Star 1',
    letter: 'b',
    aliases: [],
    sourcesCount: 1,
    resolved: resolved(),
    score: null,
    classicRank: null,
    hz: null,
    world: 'earthlike',
    gaps: { planet: [], star: [], planetStub: false, starStub: false },
    inTop: true,
  };
}

/** Модель масштаба с радиусом звезды 6. */
function scale(): ScaleModel {
  return {
    mode: 'overview',
    planetRadius: 1,
    starRadius: 6,
    unitsPerAU: 10,
    nominal: false,
    nominalStar: false,
    nominalPlanet: false,
    mapAU: (value: number) => value * 10,
  };
}

/** Контекст визуала. */
function context(quality: VisualCtx['quality'] = 'high'): VisualCtx {
  const item = detail();

  return {
    detail: item,
    scale: scale(),
    quality,
    style: buildStarStyle(item.resolved, fnv1a32(item.id)),
    settings: DEFAULT_SETTINGS,
  };
}

/** Меш фотосферы. */
function surfaceOf(visual: ReturnType<typeof createStarVisual>): THREE.Mesh {
  const object = visual.root.getObjectByName(STAR_SURFACE_MESH_NAME);

  if (!(object instanceof THREE.Mesh)) throw new Error('нет фотосферы');

  return object;
}

describe('createStarVisual', () => {
  it('строит фотосферу единичного радиуса с масштабом starRadius', () => {
    const visual = createStarVisual(context());
    const surface = surfaceOf(visual);

    expect(visual.root.name).toBe('star');
    expect((surface.geometry as THREE.SphereGeometry).parameters.radius).toBe(1);
    expect(surface.scale.x).toBe(6);
    expect(surface.renderOrder).toBe(RENDER_ORDER_STAR);
  });

  it('строит две спрайтовые короны: внешняя в 1.5 раза шире и тусклее', () => {
    const visual = createStarVisual(context());
    const inner = visual.root.getObjectByName(STAR_CORONA_INNER_NAME);
    const outer = visual.root.getObjectByName(STAR_CORONA_OUTER_NAME);

    expect(inner).toBeInstanceOf(THREE.Sprite);
    expect(outer).toBeInstanceOf(THREE.Sprite);
    if (!(inner instanceof THREE.Sprite) || !(outer instanceof THREE.Sprite)) return;

    expect(inner.scale.x).toBeCloseTo(2 * 1.8 * 6, 9);
    expect(outer.scale.x).toBeCloseTo(inner.scale.x * 1.5, 9);
    expect(outer.material.opacity).toBeLessThan(inner.material.opacity);
    expect(inner.renderOrder).toBe(RENDER_ORDER_CORONA);
    expect(outer.renderOrder).toBe(RENDER_ORDER_CORONA);
    expect(inner.material.depthWrite).toBe(false);
    expect(inner.material.blending).toBe(THREE.AdditiveBlending);
    expect(inner.material.map?.image.width).toBe(CORONA_TEXTURE_SIZE);
  });

  it('берёт цвет, яркость и активность из StarStyle', () => {
    const visual = createStarVisual(context());
    const material = surfaceOf(visual).material as StarSurfaceMaterial;

    expect(material.uniforms.uColor.value.r).toBeCloseTo(1, 3);
    expect(material.uniforms.uColor.value.g).toBeCloseTo(0.9502, 3);
    expect(material.uniforms.uBrightness.value).toBeCloseTo(0.85, 12);
    expect(material.uniforms.uActivity.value).toBe(0);
    expect(material.uniforms.uLimbU.value).toBe(0.6);
    expect(material.uniforms.uOctaves.value).toBe(6);
  });

  it('обновляет uTime и профиль качества без пересоздания', () => {
    const visual = createStarVisual(context());
    const surface = surfaceOf(visual);
    const material = surface.material as StarSurfaceMaterial;
    const geometry = surface.geometry;

    visual.update(0.016, 12.5);
    expect(material.uniforms.uTime.value).toBe(12.5);

    visual.setQuality('low');
    expect(material.uniforms.uOctaves.value).toBe(3);
    expect(surface.geometry).toBe(geometry);
  });

  it('освобождает геометрию, материалы и общую текстуру ровно по одному разу', () => {
    const visual = createStarVisual(context());
    const surface = surfaceOf(visual);
    const inner = visual.root.getObjectByName(STAR_CORONA_INNER_NAME);
    const outer = visual.root.getObjectByName(STAR_CORONA_OUTER_NAME);

    if (!(inner instanceof THREE.Sprite) || !(outer instanceof THREE.Sprite)) {
      throw new Error('нет короны');
    }

    const texture = inner.material.map;
    if (texture === null) throw new Error('нет текстуры короны');

    const spies = [
      vi.spyOn(surface.geometry, 'dispose'),
      vi.spyOn(surface.material as THREE.Material, 'dispose'),
      vi.spyOn(inner.material, 'dispose'),
      vi.spyOn(outer.material, 'dispose'),
      vi.spyOn(texture, 'dispose'),
    ];

    visual.dispose();
    visual.dispose();

    for (const spy of spies) expect(spy).toHaveBeenCalledTimes(1);
    expect(outer.material.map).toBe(texture);
  });

  it('шейдеры содержат common до logdepthbuf', () => {
    expect(STAR_VERTEX_SHADER.indexOf('#include <common>')).toBeLessThan(
      STAR_VERTEX_SHADER.indexOf('#include <logdepthbuf_pars_vertex>'),
    );
    expect(STAR_FRAGMENT_SHADER.indexOf('#include <common>')).toBeLessThan(
      STAR_FRAGMENT_SHADER.indexOf('#include <logdepthbuf_pars_fragment>'),
    );
    expect(STAR_VERTEX_SHADER).toContain('#include <logdepthbuf_vertex>');
    expect(STAR_FRAGMENT_SHADER).toContain('#include <logdepthbuf_fragment>');
  });
});
