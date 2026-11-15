import {
  buildPlanetStyle,
  DEFAULT_SETTINGS,
  makeParam,
  nullParam,
  RENDER_ORDER_ATMOSPHERE,
  RENDER_ORDER_CLOUDS,
  RENDER_ORDER_PLANET,
  type ResolvedPlanet,
  type ScaleModel,
  type SolverFlags,
  type WorldClass,
} from '@exo/shared';
import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';

import type { PlanetDetail } from '../../../workers/protocol';
import { atmosphereScaleFactor, ATMOSPHERE_MESH_NAME } from './atmosphereMesh';
import { CLOUD_MESH_NAME } from './cloudMesh';
import { PLANET_FRAGMENT_SHADER, PLANET_VERTEX_SHADER } from './glsl/planet';
import { createPlanetVisual, SURFACE_MESH_NAME } from './planetVisual';
import type { PlanetSurfaceMaterial } from './planetVisual';
import type { VisualCtx } from './types';

/**
 * Тесты процедурной планеты (задача 25; п. 7; U41, U51, U52).
 *
 * Проверяются иерархия, слои, масштаб, отсутствие облаков у лавы,
 * поведение на low, подсказки, материалы и освобождение ресурсов.
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

/** Разрешённая планета класса. */
function resolved(world: WorldClass): ResolvedPlanet {
  const radius = world === 'gas_giant' ? 10 : world === 'mini_neptune' ? 2 : 1;
  const temperature =
    world === 'ice'
      ? 180
      : world === 'desert'
        ? 450
        : world === 'lava'
          ? 967
          : world === 'mini_neptune'
            ? 240
            : world === 'gas_giant'
              ? 500
              : 255;

  return {
    id: `planet-${world}`,
    R: world === 'unknown' ? nullParam() : makeParam(radius, 'measured'),
    M: makeParam(radius ** 2, 'physics'),
    e: makeParam(0, 'measured'),
    d: makeParam(1, 'measured'),
    P: makeParam(365, 'measured'),
    S: makeParam(1, 'measured'),
    T_eq: makeParam(temperature, 'physics'),
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
function detail(world: WorldClass, planetStub = false): PlanetDetail {
  return {
    id: `planet-${world}`,
    name: 'Planet',
    hostname: 'Star',
    letter: 'b',
    aliases: [],
    sourcesCount: 1,
    resolved: resolved(world),
    score: null,
    classicRank: null,
    hz: null,
    world,
    gaps: {
      planet: planetStub ? ['R'] : [],
      star: [],
      planetStub,
      starStub: false,
    },
    inTop: true,
  };
}

/** Модель масштаба с радиусом планеты 2. */
function scale(): ScaleModel {
  return {
    mode: 'overview',
    planetRadius: 2,
    starRadius: 5,
    unitsPerAU: 10,
    nominal: false,
    nominalStar: false,
    nominalPlanet: false,
    mapAU: (value: number) => value * 10,
  };
}

/** Контекст визуала. */
function context(world: WorldClass, quality: VisualCtx['quality'] = 'high', planetStub = false) {
  const item = detail(world, planetStub);
  const style = buildPlanetStyle(item);

  return {
    ctx: {
      detail: item,
      scale: scale(),
      quality,
      style,
      settings: DEFAULT_SETTINGS,
    } satisfies VisualCtx,
    style,
  };
}

/** Меш по имени. */
function meshOf(visual: ReturnType<typeof createPlanetVisual>, name: string): THREE.Mesh {
  const object = visual.root.getObjectByName(name);

  if (!(object instanceof THREE.Mesh)) throw new Error(`нет меша ${name}`);

  return object;
}

describe('createPlanetVisual — иерархия и масштаб', () => {
  it('строит root → axisGroup → surface, clouds, atmosphere', () => {
    const { ctx } = context('earthlike');
    const visual = createPlanetVisual(ctx);

    const surface = meshOf(visual, SURFACE_MESH_NAME);
    const clouds = meshOf(visual, CLOUD_MESH_NAME);
    const atmosphere = meshOf(visual, ATMOSPHERE_MESH_NAME);

    expect(visual.root).toBeInstanceOf(THREE.Group);
    expect(visual.axisGroup).toBeInstanceOf(THREE.Group);
    expect(visual.axisGroup.parent).toBe(visual.root);
    expect(surface.parent).toBe(visual.axisGroup);
    expect(clouds.parent).toBe(visual.axisGroup);
    expect(atmosphere.parent).toBe(visual.axisGroup);
    expect(visual.root.rotation.x).toBe(0);
    expect(visual.root.rotation.z).toBe(0);
  });

  it('геометрия имеет радиус 1, а масштаб равен planetRadius', () => {
    const { ctx } = context('earthlike');
    const visual = createPlanetVisual(ctx);
    const surface = meshOf(visual, SURFACE_MESH_NAME);

    expect((surface.geometry as THREE.SphereGeometry).parameters.radius).toBe(1);
    expect(surface.scale.x).toBe(2);
    expect(meshOf(visual, CLOUD_MESH_NAME).scale.x).toBeCloseTo(2 * 1.012, 9);
    expect(meshOf(visual, ATMOSPHERE_MESH_NAME).scale.x).toBeCloseTo(
      2 * atmosphereScaleFactor(0.012),
      9,
    );
  });

  it('материал поверхности выбирает один KIND-define', () => {
    const { ctx } = context('earthlike');
    const visual = createPlanetVisual(ctx);
    const material = meshOf(visual, SURFACE_MESH_NAME).material as PlanetSurfaceMaterial;

    expect(material.defines['KIND_EARTHLIKE']).toBe(1);
    expect(Object.keys(material.defines)).toHaveLength(1);
    expect(material.uniforms.uBump.value).toBe(1);
  });
});

describe('createPlanetVisual — слои и качество', () => {
  it('у лавы облаков нет, атмосфера есть', () => {
    const visual = createPlanetVisual(context('lava').ctx);

    expect(visual.root.getObjectByName(CLOUD_MESH_NAME)).toBeUndefined();
    expect(visual.root.getObjectByName(ATMOSPHERE_MESH_NAME)).toBeInstanceOf(THREE.Mesh);
  });

  it('на low облака созданы, но скрыты; геометрия не пересоздаётся', () => {
    const visual = createPlanetVisual(context('earthlike', 'low').ctx);
    const clouds = meshOf(visual, CLOUD_MESH_NAME);
    const geometry = clouds.geometry;

    expect(clouds.visible).toBe(false);

    visual.setQuality('high');
    expect(clouds.visible).toBe(true);
    expect(clouds.geometry).toBe(geometry);

    visual.setQuality('low');
    expect(clouds.visible).toBe(false);
    expect(clouds.geometry).toBe(geometry);
  });

  it('облака и атмосфера не пишут глубину и имеют правильный renderOrder', () => {
    const visual = createPlanetVisual(context('earthlike').ctx);
    const surface = meshOf(visual, SURFACE_MESH_NAME);
    const clouds = meshOf(visual, CLOUD_MESH_NAME);
    const atmosphere = meshOf(visual, ATMOSPHERE_MESH_NAME);

    expect(surface.renderOrder).toBe(RENDER_ORDER_PLANET);
    expect(atmosphere.renderOrder).toBe(RENDER_ORDER_ATMOSPHERE);
    expect(clouds.renderOrder).toBe(RENDER_ORDER_CLOUDS);
    expect((clouds.material as THREE.ShaderMaterial).depthWrite).toBe(false);
    expect((atmosphere.material as THREE.ShaderMaterial).depthWrite).toBe(false);
    expect((atmosphere.material as THREE.ShaderMaterial).side).toBe(THREE.BackSide);
    expect((atmosphere.material as THREE.ShaderMaterial).blending).toBe(THREE.AdditiveBlending);
  });
});

describe('createPlanetVisual — подсказки атмосферы', () => {
  it('H₂O увеличивает облачность, число детей не меняется', () => {
    const visual = createPlanetVisual(context('earthlike').ctx);
    const clouds = meshOf(visual, CLOUD_MESH_NAME);
    const material = clouds.material as THREE.ShaderMaterial;
    const before = material.uniforms['uCloudCover']?.value as number;
    const children = visual.axisGroup.children.length;

    visual.setHints({ molecules: ['H2O'] });

    expect(material.uniforms['uCloudCover']?.value).toBeCloseTo(Math.min(0.9, before + 0.1), 12);
    expect(visual.axisGroup.children).toHaveLength(children);
  });

  it('CH₄ меняет атмосферу газового гиганта', () => {
    const visual = createPlanetVisual(context('gas_giant').ctx);
    const atmosphere = meshOf(visual, ATMOSPHERE_MESH_NAME);
    const material = atmosphere.material as THREE.ShaderMaterial;
    const before = (material.uniforms['uColor']?.value as THREE.Color).getHexString();

    visual.setHints({ molecules: ['CH4'] });

    expect((material.uniforms['uColor']?.value as THREE.Color).getHexString()).not.toBe(before);
  });

  it('setHints(null) возвращает базовые значения', () => {
    const visual = createPlanetVisual(context('earthlike').ctx);
    const clouds = meshOf(visual, CLOUD_MESH_NAME);
    const material = clouds.material as THREE.ShaderMaterial;
    const before = material.uniforms['uCloudCover']?.value as number;

    visual.setHints({ molecules: ['H2O'] });
    visual.setHints(null);

    expect(material.uniforms['uCloudCover']?.value).toBeCloseTo(before, 12);
  });
});

describe('createPlanetVisual — заглушка и освобождение', () => {
  it('для unknown возвращает заглушку', () => {
    const visual = createPlanetVisual(context('unknown').ctx);

    expect(visual.root.name).toBe('planet-placeholder');
  });

  it('освобождает все геометрии и материалы ровно по одному разу', () => {
    const visual = createPlanetVisual(context('earthlike').ctx);
    const meshes = [
      meshOf(visual, SURFACE_MESH_NAME),
      meshOf(visual, CLOUD_MESH_NAME),
      meshOf(visual, ATMOSPHERE_MESH_NAME),
    ];
    const spies = meshes.flatMap((mesh) => [
      vi.spyOn(mesh.geometry, 'dispose'),
      vi.spyOn(mesh.material as THREE.Material, 'dispose'),
    ]);

    visual.dispose();
    visual.dispose();

    for (const spy of spies) expect(spy).toHaveBeenCalledTimes(1);
    expect(visual.root.parent).toBeNull();
  });

  it('шейдеры содержат common и logdepthbuf', () => {
    expect(PLANET_VERTEX_SHADER.indexOf('#include <common>')).toBeLessThan(
      PLANET_VERTEX_SHADER.indexOf('#include <logdepthbuf_pars_vertex>'),
    );
    expect(PLANET_FRAGMENT_SHADER.indexOf('#include <common>')).toBeLessThan(
      PLANET_FRAGMENT_SHADER.indexOf('#include <logdepthbuf_pars_fragment>'),
    );
    expect(PLANET_VERTEX_SHADER).toContain('#include <logdepthbuf_vertex>');
    expect(PLANET_FRAGMENT_SHADER).toContain('#include <logdepthbuf_fragment>');
  });
});
