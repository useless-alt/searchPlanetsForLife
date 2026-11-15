import {
  DEFAULT_SETTINGS,
  type ErrorLogEntry,
  type ScoreBreakdown,
  type StatusResponse,
} from '@exo/shared';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ru } from '../../i18n/ru';
import { createAppStore, type AppState, type AppStore } from '../../state/store';
import type { ComputeBackend } from '../../workers/computeBackend';
import type { PlanetPosition, RankedRowView } from '../../workers/protocol';
import { buildGalaxy, clearGalaxyCache } from './buildGalaxy';
import { GalaxyView } from './GalaxyView';
import type { GalaxyRenderer } from './GalaxyRenderer';

/**
 * Тесты компонента карты (задача 21; п. 6.2, 10.8; U40, U43, U44).
 *
 * WebGL подменяется заглушкой: проверяются команды рендереру при смене
 * строк, выбора, камеры и перелётов, клик по метке, один расчёт данных на
 * снимок и ровно один `dispose` при размонтировании.
 */

/** Минимальная оценка строки. */
function score(index = 0.8): ScoreBreakdown {
  return {
    mode: 'adaptive',
    ESI_R: 0.9,
    ESI_rho: 0.9,
    ESI_ve: 0.9,
    ESI_S: 0.9,
    ESI_T: 0.9,
    ESI_interior: 0.9,
    F_HZ: 0.7,
    HZD: 0.1,
    P_rocky: 1,
    P_ecc: 1,
    P_star: 1,
    Q_data: 0.95,
    index,
    k: 4,
    n: 4,
    insufficient_data: false,
    T_s: 288,
    v_e: 1,
  };
}

/** Строка Топ-50. */
function row(rank: number, planetId: string): RankedRowView {
  return {
    rank,
    rankClassic: rank,
    delta: 0,
    planetId,
    score: score(),
    name: `Планета ${planetId}`,
    hostname: `Звезда ${planetId}`,
    R: 1,
    M: 1,
    T_s: 288,
    e: 0.02,
    spectralClass: 'G',
    dist_pc: 10,
    sourcesCount: 3,
    Q_data: 0.95,
    qLevel: 'high',
    provenance: { R: 'measured', M: 'measured', e: 'measured' },
    lowReliability: false,
    insufficient: false,
    levelB_mass: false,
    levelB_radius: false,
    e_assumed_zero: false,
  };
}

/** Позиция планеты в центре Галактики на заданном расстоянии. */
function position(planetId: string, distancePc = 10): PlanetPosition {
  return {
    id: planetId,
    hostKey: `star-${planetId}`,
    ra: 266.405,
    dec: -28.936,
    dist_pc: distancePc,
    st_teff: 5772,
  };
}

/** Заглушка REST-клиента. */
function mockApi() {
  return {
    getStatus: vi.fn(
      async () =>
        ({
          phase: 'ready',
          refreshing: false,
          startedAt: null,
          finishedAt: null,
          sources: [],
          hasSnapshot: true,
        }) as StatusResponse,
    ),
    getCatalog: vi.fn(async () => ({ notModified: true as const })),
    refresh: vi.fn(async () => 'started' as const),
    getErrors: vi.fn(async () => [] as ErrorLogEntry[]),
  };
}

/** Заглушка рендерера и фабрика для неё. */
function makeRendererStub() {
  const spies = {
    setData: vi.fn(),
    setLeaders: vi.fn(),
    setSearchMatches: vi.fn(),
    setSelection: vi.fn(),
    setLabels: vi.fn((objects: ReadonlyArray<{ element: HTMLElement }>) => {
      for (const object of objects) document.body.appendChild(object.element);
    }),
    resetCamera: vi.fn(),
    focus: vi.fn(),
    flyToSystem: vi.fn(),
    onArrive: vi.fn(() => () => {}),
    getSystemPosition: vi.fn(() => null),
    getCameraState: vi.fn(() => ({
      position: { x: 0, y: 0, z: 0 },
      target: { x: 0, y: 0, z: 0 },
    })),
    setCameraState: vi.fn(),
    requestRender: vi.fn(),
    dispose: vi.fn(),
  };

  const renderer = spies as unknown as GalaxyRenderer;
  const factory = vi.fn(() => renderer);

  return { renderer, spies, factory };
}

/** Изолированное хранилище с готовыми данными карты. */
function setup(options: {
  rows: RankedRowView[];
  positions: PlanetPosition[];
  state?: Partial<AppState>;
}): { store: AppStore; getPositions: ReturnType<typeof vi.fn> } {
  const getPositions = vi.fn(async () => options.positions);

  const backend: ComputeBackend = {
    init: async () => options.positions.length,
    compute: async () => ({
      rows: [],
      counters: { total: 0, computed: 0, strictMeasured: 0, matching: 0 },
    }),
    getResolved: async () => [],
    getPositions,
    getPlanetDetail: async () => {
      throw new Error('Деталь в этих тестах не запрашивается');
    },
    dispose: () => {},
  };

  const store = createAppStore({
    api: mockApi(),
    backend,
    sleep: async () => {},
  });

  const catalogIndex: AppState['catalogIndex'] = {};

  for (const item of options.rows) {
    catalogIndex[item.planetId] = { name: item.name, hostname: item.hostname };
  }

  store.setState({
    phase: 'ready',
    snapshotId: 'snap-1',
    rows: options.rows,
    catalogIndex,
    settings: DEFAULT_SETTINGS,
    ...options.state,
  });

  return { store, getPositions };
}

beforeEach(() => {
  clearGalaxyCache();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
  clearGalaxyCache();
});

describe('GalaxyView', () => {
  it('при смене rows обновляет лидеров рендерера', async () => {
    const { store } = setup({
      rows: [row(1, 'a')],
      positions: [position('a')],
    });
    const { spies, factory } = makeRendererStub();

    render(<GalaxyView store={store} rendererFactory={factory} />);

    await waitFor(() => expect(spies.setLeaders).toHaveBeenCalledWith(['a']));

    act(() => {
      store.setState({ rows: [row(1, 'b')] });
    });

    await waitFor(() => expect(spies.setLeaders).toHaveBeenLastCalledWith(['b']));
  });

  it('при смене selectedPlanetId выделяет систему кольцом', async () => {
    const { store } = setup({
      rows: [row(1, 'a')],
      positions: [position('a')],
    });
    const { spies, factory } = makeRendererStub();

    render(<GalaxyView store={store} rendererFactory={factory} />);

    await waitFor(() => expect(spies.setSelection).toHaveBeenCalledWith(null));

    act(() => {
      store.getState().selectPlanet('a');
    });

    await waitFor(() => expect(spies.setSelection).toHaveBeenLastCalledWith(0));
  });

  it('при росте cameraResetSeq возвращает камеру к обзору', async () => {
    const { store } = setup({
      rows: [row(1, 'a')],
      positions: [position('a')],
    });
    const { spies, factory } = makeRendererStub();

    render(<GalaxyView store={store} rendererFactory={factory} />);

    await waitFor(() => expect(factory).toHaveBeenCalledTimes(1));

    act(() => {
      store.getState().requestCameraReset();
    });

    await waitFor(() => expect(spies.resetCamera).toHaveBeenCalledTimes(1));
  });

  it('по mapFocusRequest фокусируется на позиции системы', async () => {
    const { store } = setup({
      rows: [row(1, 'a')],
      positions: [position('a', 10)],
    });
    const { spies, factory } = makeRendererStub();

    render(<GalaxyView store={store} rendererFactory={factory} />);

    await waitFor(() => expect(factory).toHaveBeenCalledTimes(1));

    act(() => {
      store.getState().requestMapFocus('a');
    });

    await waitFor(() => expect(spies.focus).toHaveBeenCalledTimes(1));

    const target = spies.focus.mock.calls[0]?.[0] as { x: number; y: number; z: number };

    expect(target.x).toBeCloseTo(10, 1);
    expect(target.y).toBeCloseTo(0, 1);
    expect(target.z).toBeCloseTo(0, 1);
  });

  it('по flyRequest выполняет перелёт к системе', async () => {
    const { store } = setup({
      rows: [row(1, 'a')],
      positions: [position('a', 10)],
    });
    const { spies, factory } = makeRendererStub();

    render(<GalaxyView store={store} rendererFactory={factory} />);

    await waitFor(() => expect(factory).toHaveBeenCalledTimes(1));

    act(() => {
      store.getState().requestFly('a', 'planet');
    });

    await waitFor(() => expect(spies.flyToSystem).toHaveBeenCalledTimes(1));

    const target = spies.flyToSystem.mock.calls[0]?.[0] as { x: number };

    expect(target.x).toBeCloseTo(10, 1);
  });

  it('по клику на метку выбирает планету и открывает карточку', async () => {
    const { store } = setup({
      rows: [row(1, 'a')],
      positions: [position('a')],
    });
    const { factory } = makeRendererStub();

    render(<GalaxyView store={store} rendererFactory={factory} />);

    const button = await waitFor(() => {
      const found = document.querySelector<HTMLButtonElement>('button[data-planet-id="a"]');
      expect(found).not.toBeNull();
      return found as HTMLButtonElement;
    });

    fireEvent.click(button);

    expect(store.getState().selectedPlanetId).toBe('a');
    expect(store.getState().planetCardOpen).toBe(true);
  });

  it('не пересчитывает данные карты при смене режима и настроек', async () => {
    const { store } = setup({
      rows: [row(1, 'a')],
      positions: [position('a')],
    });
    const buildSpy = vi.fn((snapshotId: string, positions: readonly PlanetPosition[]) =>
      buildGalaxy(snapshotId, positions),
    );
    const { factory } = makeRendererStub();

    const view = render(
      <GalaxyView store={store} rendererFactory={factory} buildGalaxyFactory={buildSpy} />,
    );

    await waitFor(() => expect(buildSpy).toHaveBeenCalledTimes(1));

    act(() => {
      store.getState().setMode('rhi');
      store.getState().setQMin(0.9);
    });

    await waitFor(() => expect(store.getState().settings.mode).toBe('rhi'));

    expect(buildSpy).toHaveBeenCalledTimes(1);

    act(() => {
      store.setState({ snapshotId: 'snap-2' });
    });

    await waitFor(() => expect(buildSpy).toHaveBeenCalledTimes(2));

    view.unmount();
  });

  it('при размонтировании вызывает dispose ровно один раз', async () => {
    const { store } = setup({
      rows: [row(1, 'a')],
      positions: [position('a')],
    });
    const { spies, factory } = makeRendererStub();

    const view = render(<GalaxyView store={store} rendererFactory={factory} />);

    await waitFor(() => expect(factory).toHaveBeenCalledTimes(1));

    view.unmount();

    expect(spies.dispose).toHaveBeenCalledTimes(1);
  });

  it('без WebGL показывает заголовок ошибки и список меток', async () => {
    const { store } = setup({
      rows: [row(1, 'a'), row(2, 'b')],
      positions: [position('a')],
    });

    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    render(<GalaxyView store={store} />);

    await waitFor(() => {
      expect(screen.getByText(ru['map.webglError'])).toBeTruthy();
    });

    expect(screen.getByRole('button', { name: '1. Планета a' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '2. Планета b' })).toBeTruthy();
  });
});
