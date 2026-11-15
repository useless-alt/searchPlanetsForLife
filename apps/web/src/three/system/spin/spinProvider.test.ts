import { makeParam, nullParam, type ResolvedPlanet, type SolverFlags } from '@exo/shared';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';

import type { PlanetDetail } from '../../../workers/protocol';
import { SimClock } from '../SimClock';
import { createSpinController as createProviderController } from '../visuals/registry';
import type { PlanetVisualHandle } from '../visuals/types';
import { planetSpinProvider, spinProvider } from './spinProvider';

/**
 * Тесты провайдера вращения (задача 26; п. 9.3, 11.5).
 *
 * Провайдер создаёт контроллер для обычной планеты, возвращает null для
 * заглушки и зарегистрирован в реестре задачи 25.
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

/** Разрешённая планета. */
function resolved(): ResolvedPlanet {
  return {
    id: 'planet-1',
    R: makeParam(1, 'measured'),
    M: makeParam(1, 'measured'),
    e: makeParam(0, 'measured'),
    d: makeParam(1, 'measured'),
    P: makeParam(4, 'measured'),
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

/** Деталь планеты; можно включить заглушку. */
function detail(planetStub = false): PlanetDetail {
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
    world: 'earthlike',
    gaps: { planet: [], star: [], planetStub, starStub: false },
    inTop: true,
  };
}

/** Минимальная планета для контроллера. */
function handle(): PlanetVisualHandle {
  const root = new THREE.Group();
  const axisGroup = new THREE.Group();
  const surface = new THREE.Mesh(new THREE.SphereGeometry(1));
  const clouds = new THREE.Mesh(new THREE.SphereGeometry(1));
  const atmosphere = new THREE.Mesh(new THREE.SphereGeometry(1));

  root.add(axisGroup);
  axisGroup.add(surface, clouds, atmosphere);

  return {
    root,
    object: root,
    axisGroup,
    surface,
    clouds,
    atmosphere,
    setSunState: () => undefined,
    setQuality: () => undefined,
    setHints: () => undefined,
    attachSpin: () => undefined,
    update: () => undefined,
    dispose: () => undefined,
  };
}

describe('planetSpinProvider', () => {
  it('создаёт контроллер для обычной планеты', () => {
    const visual = handle();
    const sim = new SimClock(4);
    const controller = planetSpinProvider(visual, detail(), sim);

    expect(controller).not.toBeNull();
    controller?.update(0, { simDays: 1 });
    expect(visual.axisGroup.quaternion.angleTo(new THREE.Quaternion())).toBeGreaterThan(0);
  });

  it('возвращает null для заглушки', () => {
    expect(planetSpinProvider(handle(), detail(true), new SimClock(4))).toBeNull();
  });

  it('зарегистрирован в реестре задачи 25', () => {
    const visual = handle();
    const controller = createProviderController(visual, detail(), new SimClock(4));

    expect(spinProvider).toBe(planetSpinProvider);
    expect(controller).not.toBeNull();
    expect(createProviderController(handle(), detail(true), new SimClock(4))).toBeNull();
  });
});
