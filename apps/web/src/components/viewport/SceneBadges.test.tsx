import {
  DEFAULT_SETTINGS,
  makeParam,
  nullParam,
  type ResolvedPlanet,
  type SolverFlags,
} from '@exo/shared';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import * as helpApi from '../../help/api';
import { ru } from '../../i18n/ru';
import { createAppStore } from '../../state/store';
import type { ComputeBackend } from '../../workers/computeBackend';
import type { PlanetDetail } from '../../workers/protocol';
import { SceneBadges } from './SceneBadges';

/**
 * Тесты бейджей 3D-сцены (задача 27; п. 9.5, 10.9.7).
 *
 * Проверяются условия реконструкции, заглушки и Q_data, а также подсказка
 * со списком недостающих параметров.
 */

afterEach(() => {
  cleanup();
  sessionStorage.clear();
  vi.restoreAllMocks();
});

/** Флаги решателя. */
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
    R: nullParam(),
    M: makeParam(1, 'model'),
    e: makeParam(0, 'measured'),
    d: makeParam(1, 'measured'),
    P: makeParam(4, 'measured'),
    S: makeParam(1, 'physics'),
    T_eq: nullParam(),
    rho: nullParam(),
    L: nullParam(),
    st_teff: nullParam(),
    st_rad: nullParam(),
    st_mass: nullParam(),
    dist_pc: nullParam(),
    ra: nullParam(),
    dec: nullParam(),
    flags: flags({ levelB_mass: true }),
  };
}

/** Деталь планеты. */
function detail(overrides: Partial<PlanetDetail> = {}): PlanetDetail {
  return {
    id: 'planet-1',
    name: 'Planet 1',
    hostname: 'Star',
    letter: 'b',
    aliases: [],
    sourcesCount: 1,
    resolved: resolved(),
    score: {
      mode: 'adaptive',
      ESI_R: null,
      ESI_rho: null,
      ESI_ve: null,
      ESI_S: 1,
      ESI_T: null,
      ESI_interior: null,
      F_HZ: null,
      HZD: null,
      P_rocky: 1,
      P_ecc: 1,
      P_star: 1,
      Q_data: 0.95,
      index: 0.5,
      k: 3,
      n: 4,
      insufficient_data: false,
      T_s: null,
      v_e: null,
    },
    classicRank: null,
    hz: null,
    world: 'unknown',
    gaps: {
      planet: ['R', 'T_eq'],
      star: ['st_teff'],
      planetStub: true,
      starStub: true,
    },
    inTop: true,
    ...overrides,
  };
}

/** Хранилище с деталью сцены. */
function makeStore(item = detail()) {
  const backend: ComputeBackend = {
    init: vi.fn(async () => 0),
    compute: vi.fn(async () => ({
      rows: [],
      counters: { total: 0, computed: 0, strictMeasured: 0, matching: 0 },
    })),
    getResolved: vi.fn(async () => []),
    getPositions: vi.fn(async () => []),
    getPlanetDetail: vi.fn(async () => item),
    dispose: vi.fn(),
  };
  const store = createAppStore({
    api: {
      getStatus: vi.fn(),
      getCatalog: vi.fn(),
      refresh: vi.fn(),
      getErrors: vi.fn(),
    } as never,
    backend,
    sleep: async () => {},
  });

  store.setState({
    phase: 'ready',
    viewMode: 'system',
    scenePlanetId: item.id,
    sceneDetail: item,
    settings: DEFAULT_SETTINGS,
  });

  return store;
}

describe('SceneBadges', () => {
  it('«Реконструкция по расчётной модели» видна при Уровне Б', () => {
    const store = makeStore();

    render(<SceneBadges store={store} />);

    expect(screen.getByText(ru['badge.reconstructed'])).toBeTruthy();
  });

  it('«Недостаточно данных для отрисовки» видна при заглушке', () => {
    const store = makeStore();

    render(<SceneBadges store={store} />);

    expect(screen.getByText(ru['badge.insufficient'])).toBeTruthy();
  });

  it('Q_data скрыт по умолчанию и появляется при включении режима', () => {
    const store = makeStore();

    render(<SceneBadges store={store} />);

    expect(screen.queryByText(/95%/)).toBeNull();

    act(() => store.getState().setShowExtraData(true));

    expect(screen.getByText(/95%/)).toBeTruthy();
    expect(document.querySelector('[data-extra="scene.qdata"]')).not.toBeNull();
  });

  it('подсказка заглушки содержит недостающие параметры', () => {
    const show = vi.spyOn(helpApi, 'showHelpAt').mockImplementation(() => {});
    const store = makeStore();

    render(<SceneBadges store={store} />);

    fireEvent.pointerEnter(screen.getByText(ru['badge.insufficient']));

    expect(show).toHaveBeenCalled();
    expect(show.mock.calls[0]?.[0].key).toBe('stub.missing');
    expect(show.mock.calls[0]?.[0].ctx?.missing).toEqual([
      'радиус планеты',
      'равновесная температура планеты',
      'температура звезды',
    ]);
  });

  it('не рендерится вне режима системы', () => {
    const store = makeStore();

    store.setState({ viewMode: 'galaxy' });
    render(<SceneBadges store={store} />);

    expect(document.querySelector('.scene-badges')).toBeNull();
  });
});
