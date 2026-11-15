import {
  DEFAULT_SETTINGS,
  makeScaleModel,
  makeParam,
  nullParam,
  type ResolvedPlanet,
  type SolverFlags,
} from '@exo/shared';
import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';

import type { PlanetDetail } from '../../../workers/protocol';
import type { VisualCtx } from '../visuals/types';
import { createDust } from './dust';
import { createPlanetStub, createStarStub } from './stubFactories';

/**
 * Тесты фабрик заглушек (задача 27; п. 9.2, 9.5; U38).
 *
 * Проверяются материалы, отсутствие атмосферы/короны, пыль, подписи,
 * качество и освобождение ресурсов.
 */

/** Флаги решателя по умолчанию. */
function flags(overrides: Partial<SolverFlags> = {}): SolverFlags {
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
    ...overrides,
  };
}

/** Разрешённая планета. */
function resolved(): ResolvedPlanet {
  return {
    id: 'planet-1',
    R: makeParam(2.5, 'measured'),
    M: nullParam(),
    e: makeParam(0, 'measured'),
    d: makeParam(1, 'measured'),
    P: makeParam(4, 'measured'),
    S: nullParam(),
    T_eq: nullParam(),
    rho: nullParam(),
    L: nullParam(),
    st_teff: nullParam(),
    st_rad: nullParam(),
    st_mass: nullParam(),
    dist_pc: nullParam(),
    ra: nullParam(),
    dec: nullParam(),
    flags: flags({ insufficient_data: true, excluded_subindices: ['ESI_rho'] }),
  };
}

/** Деталь заглушки. */
function detail(planetStub = true, starStub = true): PlanetDetail {
  return {
    id: 'planet-1',
    name: 'Planet 1',
    hostname: 'Star',
    letter: 'b',
    aliases: [],
    sourcesCount: 1,
    resolved: resolved(),
    score: null,
    classicRank: null,
    hz: null,
    world: 'unknown',
    gaps: {
      planet: planetStub ? ['R', 'T_eq'] : [],
      star: starStub ? ['st_teff', 'L_or_st_rad'] : [],
      planetStub,
      starStub,
    },
    inTop: true,
  };
}

/** Контекст визуала. */
function context(planetStub = true, starStub = true): VisualCtx {
  const item = detail(planetStub, starStub);

  return {
    detail: item,
    scale: makeScaleModel(item.resolved, 'overview'),
    quality: 'high',
    style: null,
    settings: DEFAULT_SETTINGS,
  };
}

describe('createPlanetStub', () => {
  it('строит серую сферу без карт, атмосферы и облаков', () => {
    const stub = createPlanetStub(context());
    const material = stub.surface.material as THREE.MeshStandardMaterial;

    expect(stub.surface).toBeInstanceOf(THREE.Mesh);
    expect(material).toBeInstanceOf(THREE.MeshStandardMaterial);
    expect(material.roughness).toBe(1);
    expect(material.metalness).toBe(0);
    expect(material.map).toBeNull();
    expect(material.normalMap).toBeNull();
    expect(stub.clouds).toBeNull();
    expect(stub.atmosphere).toBeNull();
    expect(stub.root.getObjectByName('stub-dust')).toBeInstanceOf(THREE.Points);
    expect(stub.root.getObjectByName('stub-label-planet')).toBeDefined();
  });

  it('сохраняет радиус планеты из модели масштаба', () => {
    const stub = createPlanetStub(context());
    const geometry = stub.surface.geometry as THREE.SphereGeometry;

    expect(geometry.parameters.radius).toBe(1);
  });

  it('не подключает вращение', () => {
    const stub = createPlanetStub(context());
    const controller = { update: vi.fn(), reset: vi.fn(), dispose: vi.fn() };

    stub.attachSpin(controller);
    stub.update(0.1, { timeSec: 1 });

    expect(controller.dispose).toHaveBeenCalledTimes(1);
    expect(stub.axisGroup.quaternion.equals(new THREE.Quaternion())).toBe(true);
  });

  it('setQuality меняет drawRange пыли', () => {
    const stub = createPlanetStub(context());
    const dust = stub.root.getObjectByName('stub-dust') as THREE.Points;

    stub.setQuality('low');

    expect(dust.geometry.drawRange.count).toBe(600);
  });
});

describe('createStarStub', () => {
  it('строит тёмно-серую сферу без короны', () => {
    const stub = createStarStub(context());
    const material = stub.root.getObjectByName('surface') as THREE.Mesh;

    expect(stub.root.name).toBe('star-stub');
    expect(stub.root.getObjectByName('corona')).toBeUndefined();
    expect((material.material as THREE.MeshStandardMaterial).emissive.getHex()).toBe(0);
    expect(stub.root.getObjectByName('stub-dust')).toBeInstanceOf(THREE.Points);
    expect(stub.root.getObjectByName('stub-label-star')).toBeDefined();
  });
});

describe('обе заглушки', () => {
  it('содержат два облака пыли и два набора подписей', () => {
    const planet = createPlanetStub(context());
    const star = createStarStub(context());
    const labels = [
      planet.root.getObjectByName('stub-label-planet'),
      star.root.getObjectByName('stub-label-star'),
    ];

    expect(planet.root.getObjectByName('stub-dust')).toBeInstanceOf(THREE.Points);
    expect(star.root.getObjectByName('stub-dust')).toBeInstanceOf(THREE.Points);
    expect(labels.every((label) => label !== undefined)).toBe(true);
  });

  it('dispose освобождает геометрию и материал заглушки', () => {
    const stub = createPlanetStub(context());
    const geometry = vi.spyOn(stub.surface.geometry, 'dispose');
    const material = vi.spyOn(stub.surface.material as THREE.Material, 'dispose');

    stub.dispose();
    stub.dispose();

    expect(geometry).toHaveBeenCalledTimes(1);
    expect(material).toHaveBeenCalledTimes(1);
    expect(stub.root.parent).toBeNull();
  });
});

describe('createDust — общие требования', () => {
  it('создаётся только из явного вызова с параметрами', () => {
    const dust = createDust({ radius: 1, seed: 1, count: 1, color: '#9aa3ad' });

    expect(dust.object).toBeInstanceOf(THREE.Points);
  });
});
