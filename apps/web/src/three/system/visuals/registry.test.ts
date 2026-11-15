import {
  buildPlanetStyle,
  buildStarStyle,
  DEFAULT_SETTINGS,
  fnv1a32,
  makeParam,
  nullParam,
  type ResolvedPlanet,
  type ScaleModel,
  type SolverFlags,
} from '@exo/shared';
import * as THREE from 'three';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { PlanetDetail } from '../../../workers/protocol';
import { SimClock } from '../SimClock';
import { planetFactory, registerDefaultVisuals, starFactory } from './index';
import {
  createSpinController,
  createVisual,
  getVisualFactory,
  registerSpinProvider,
  registerStubFactory,
  registerVisualFactory,
  resetSpinProviders,
  resetStubFactories,
  resetVisualFactories,
} from './registry';
import type { PlanetVisualHandle, SpinController, StarVisualHandle, VisualCtx } from './types';

/**
 * Тесты реестра визуализаций (задачи 22, 25; п. 9.1, 9.2).
 *
 * Проверяются процедурные фабрики, заглушки задачи 27, поставщики
 * вращения задачи 26, замена и восстановление фабрик.
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
    P: makeParam(365, 'measured'),
    S: makeParam(1, 'measured'),
    T_eq: makeParam(255, 'physics'),
    rho: nullParam(),
    L: makeParam(1, 'measured'),
    st_teff: makeParam(5772, 'measured'),
    st_rad: makeParam(1, 'measured'),
    st_mass: makeParam(1, 'measured'),
    dist_pc: makeParam(10, 'measured'),
    ra: makeParam(10, 'measured'),
    dec: makeParam(20, 'measured'),
    flags: flags(),
  };
}

/** Деталь планеты. */
function detail(planetStub = false, starStub = false): PlanetDetail {
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
    gaps: { planet: [], star: [], planetStub, starStub },
    inTop: true,
  };
}

/** Модель масштаба. */
function scale(): ScaleModel {
  return {
    mode: 'overview',
    planetRadius: 1,
    starRadius: 5,
    unitsPerAU: 10,
    nominal: false,
    nominalStar: false,
    nominalPlanet: false,
    mapAU: (value: number) => value * 10,
  };
}

/** Полный контекст планеты. */
function planetContext(planetStub = false, starStub = false): VisualCtx {
  const item = detail(planetStub, starStub);

  return {
    detail: item,
    scale: scale(),
    quality: 'high',
    style: buildPlanetStyle(item),
    settings: DEFAULT_SETTINGS,
  };
}

/** Полный контекст звезды. */
function starContext(starStub = false): VisualCtx {
  const item = detail(false, starStub);

  return {
    detail: item,
    scale: scale(),
    quality: 'high',
    style: buildStarStyle(item.resolved, fnv1a32(item.id)),
    settings: DEFAULT_SETTINGS,
  };
}

/** Фиктивная звезда. */
function fakeStar(name: string): StarVisualHandle {
  const root = new THREE.Group();

  root.name = name;

  return {
    root,
    object: root,
    setQuality: vi.fn(),
    update: vi.fn(),
    dispose: vi.fn(),
  };
}

/** Фиктивная планета. */
function fakePlanet(name: string): PlanetVisualHandle {
  const root = new THREE.Group();
  const axisGroup = new THREE.Group();
  const surface = new THREE.Mesh(new THREE.SphereGeometry(1), new THREE.MeshBasicMaterial());

  root.name = name;
  root.add(axisGroup);
  axisGroup.add(surface);

  return {
    root,
    object: root,
    axisGroup,
    surface,
    clouds: null,
    atmosphere: null,
    setSunState: vi.fn(),
    setQuality: vi.fn(),
    setHints: vi.fn(),
    attachSpin: vi.fn(),
    update: vi.fn(),
    dispose: vi.fn(),
  };
}

describe('registry', () => {
  beforeEach(() => {
    resetVisualFactories();
    resetStubFactories();
    resetSpinProviders();
  });

  it('без фабрики отдаёт заглушку звезды и планеты', () => {
    expect(createVisual('star', starContext()).root.name).toBe('star-placeholder');
    expect(createVisual('planet', planetContext()).root.name).toBe('planet-placeholder');
  });

  it('вызывает зарегистрированную фабрику и передаёт quality/style', () => {
    const factory = vi.fn((_ctx: VisualCtx) => fakeStar('custom-star'));

    registerVisualFactory('star', factory);

    const visual = createVisual('star', starContext());
    const call = factory.mock.calls[0];

    expect(visual.root.name).toBe('custom-star');
    expect(factory).toHaveBeenCalledTimes(1);
    expect(call?.[0].quality).toBe('high');
    expect(call?.[0].style).not.toBeNull();
  });

  it('отмена регистрации восстанавливает предыдущую фабрику', () => {
    registerVisualFactory('planet', () => fakePlanet('first'));

    const undo = registerVisualFactory('planet', () => fakePlanet('second'));
    expect(createVisual('planet', planetContext()).root.name).toBe('second');

    undo();
    expect(createVisual('planet', planetContext()).root.name).toBe('first');
  });

  it('устаревшая отмена не снимает новую фабрику', () => {
    const undoFirst = registerVisualFactory('planet', () => fakePlanet('first'));

    registerVisualFactory('planet', () => fakePlanet('second'));
    undoFirst();

    expect(createVisual('planet', planetContext()).root.name).toBe('second');
  });

  it('регистрирует процедурные фабрики задачи 25', () => {
    const undo = registerDefaultVisuals();

    expect(createVisual('star', starContext()).root.name).toBe('star');
    expect(createVisual('planet', planetContext()).root.name).toBe('planet');
    expect(getVisualFactory('star')).toBe(starFactory);
    expect(getVisualFactory('planet')).toBe(planetFactory);

    undo();
  });
});

describe('stub factories', () => {
  beforeEach(() => {
    resetVisualFactories();
    resetStubFactories();
  });

  it('planetFactory при planetStub вызывает зарегистрированную заглушку', () => {
    const stub = vi.fn(() => fakePlanet('custom-stub'));

    registerStubFactory('planet', stub);
    registerVisualFactory('planet', planetFactory);

    const visual = createVisual('planet', planetContext(true));

    expect(visual.root.name).toBe('custom-stub');
    expect(stub).toHaveBeenCalledTimes(1);
  });

  it('без заглушки берётся серая сфера из placeholders', () => {
    registerVisualFactory('planet', planetFactory);

    expect(createVisual('planet', planetContext(true)).root.name).toBe('planet-placeholder');
  });

  it('starFactory при starStub вызывает зарегистрированную заглушку', () => {
    const stub = vi.fn(() => fakeStar('custom-star-stub'));

    registerStubFactory('star', stub);
    registerVisualFactory('star', starFactory);

    expect(createVisual('star', starContext(true)).root.name).toBe('custom-star-stub');
  });
});

describe('spin providers', () => {
  beforeEach(() => {
    resetSpinProviders();
  });

  it('использует последнего зарегистрированного поставщика', () => {
    const controller: SpinController = {
      update: vi.fn(),
      reset: vi.fn(),
      dispose: vi.fn(),
    };
    const first = vi.fn(() => null);
    const second = vi.fn(() => controller);

    registerSpinProvider(first);
    registerSpinProvider(second);

    const handle = fakePlanet('planet');
    const sim = new SimClock(10);
    const result = createSpinController(handle, detail(), sim);

    expect(result).toBe(controller);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith(handle, detail(), sim);
  });

  it('возвращает null без поставщиков', () => {
    expect(createSpinController(fakePlanet('planet'), detail(), new SimClock(1))).toBeNull();
  });
});
