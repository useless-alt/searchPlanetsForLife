import { DEFAULT_SETTINGS } from '@exo/shared';
import { waitFor } from '@testing-library/react';
import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ApiClient } from '../../api/client';
import { createAppStore, type AppStore } from '../../state/store';
import type { ComputeBackend } from '../../workers/computeBackend';
import type { PlanetDetail } from '../../workers/protocol';
import { SystemController, type ControlledSystemScene, type SceneHost } from './SystemController';

/**
 * Тесты машины состояний сцены (задача 22; п. 9.1, 9.4, 10.9; U38, U40).
 *
 * WebGL, GalaxyScene и загрузчик детали подменяются: проверяются переходы
 * `galaxy → flying → system`, отмена перелёта, смена цели и планеты,
 * восстановление камеры и сохранение настроек сцены.
 */

/** Минимальная деталь планеты для контроллера. */
function detail(id: string): PlanetDetail {
  return {
    id,
    name: id.toUpperCase(),
    hostname: 'Звезда',
    letter: 'b',
    aliases: [],
    sourcesCount: 1,
    resolved: {} as PlanetDetail['resolved'],
    score: null,
    classicRank: null,
    hz: null,
    world: 'unknown',
    gaps: { planet: [], star: [], planetStub: false, starStub: false },
    inTop: true,
  };
}

/** Заглушка REST-клиента. */
function apiStub(): ApiClient {
  return {
    getStatus: vi.fn(),
    getCatalog: vi.fn(),
    refresh: vi.fn(),
    getErrors: vi.fn(),
  } as unknown as ApiClient;
}

/** Хранилище с подменённым загрузчиком детали. */
function makeStore(getPlanetDetail: ComputeBackend['getPlanetDetail']): AppStore {
  const backend: ComputeBackend = {
    init: vi.fn(async () => 0),
    compute: vi.fn(async () => ({
      rows: [],
      counters: { total: 0, computed: 0, strictMeasured: 0, matching: 0 },
    })),
    getResolved: vi.fn(async () => []),
    getPositions: vi.fn(async () => []),
    getPlanetDetail,
    dispose: vi.fn(),
  };
  const store = createAppStore({ api: apiStub(), backend, sleep: async () => {} });

  store.setState({
    phase: 'ready',
    snapshotId: 'snap-1',
    settings: DEFAULT_SETTINGS,
    selectedPlanetId: 'a',
  });

  return store;
}

/** Заглушка карты с управляемым прибытием. */
function makeGalaxy(positions: Record<string, { x: number; y: number; z: number }>) {
  const arriveCallbacks = new Set<() => void>();
  const camera = {
    position: { x: 1, y: 2, z: 3 },
    target: { x: 0, y: 0, z: 0 },
  };

  return {
    camera,
    getSystemPosition: vi.fn((planetId: string) => positions[planetId] ?? null),
    getCameraState: vi.fn(() => camera),
    setCameraState: vi.fn(),
    flyToSystem: vi.fn(),
    onArrive: vi.fn((callback: () => void) => {
      arriveCallbacks.add(callback);

      return () => {
        arriveCallbacks.delete(callback);
      };
    }),
    arrive(): void {
      for (const callback of [...arriveCallbacks]) callback();
    },
  };
}

/** Заглушка сцены системы. */
function makeSystemScene() {
  const scene = {
    scene: new THREE.Scene(),
    setTarget: vi.fn(() => true),
    resetCamera: vi.fn(),
    setContext: vi.fn(),
    setToggles: vi.fn(),
    setHints: vi.fn(),
    dispose: vi.fn(),
  } satisfies ControlledSystemScene;

  return scene;
}

/** Собирает контроллер и все заглушки. */
function setup(options: {
  positions?: Record<string, { x: number; y: number; z: number }>;
  details?: Record<string, PlanetDetail>;
  failDetail?: boolean;
  reducedMotion?: boolean;
}) {
  const details = options.details ?? { a: detail('a'), b: detail('b') };
  const getPlanetDetail = vi.fn(async (id: string) => {
    if (options.failDetail === true) throw new Error('нет данных');

    const found = details[id];

    if (found === undefined) throw new Error('нет планеты');

    return found;
  });
  const store = makeStore(getPlanetDetail);
  const host: SceneHost = { setScene: vi.fn() };
  const galaxy = makeGalaxy(options.positions ?? { a: { x: 10, y: 0, z: 0 } });
  const scenes: ControlledSystemScene[] = [];
  const createSystemScene = vi.fn(() => {
    const scene = makeSystemScene();

    scenes.push(scene);

    return scene;
  });
  const toast = vi.fn();
  const controller = new SystemController({
    store,
    host,
    galaxy,
    createSystemScene,
    toast,
    reducedMotion: options.reducedMotion ?? true,
    detailTimeoutMs: 50,
  });

  controller.start();

  return { store, host, galaxy, controller, createSystemScene, scenes, toast, getPlanetDetail };
}

let active: { controller: SystemController } | null = null;

afterEach(() => {
  active?.controller.dispose();
  active = null;
});

describe('SystemController — перелёт', () => {
  it('с координатами: galaxy → flying → system после onArrive', async () => {
    const test = setup({});
    active = test;

    test.store.getState().requestFly('a', 'planet');

    expect(test.store.getState().viewMode).toBe('flying');
    expect(test.galaxy.flyToSystem).toHaveBeenCalledWith({ x: 10, y: 0, z: 0 });
    expect(test.host.setScene).not.toHaveBeenCalled();

    test.galaxy.arrive();

    await waitFor(() => expect(test.store.getState().viewMode).toBe('system'));

    expect(test.createSystemScene).toHaveBeenCalledTimes(1);
    expect(test.host.setScene).toHaveBeenCalledTimes(1);
    expect(test.store.getState().scenePlanetId).toBe('a');
  });

  it('без координат сразу строит систему', async () => {
    const test = setup({ positions: {} });
    active = test;

    test.store.getState().requestFly('a', 'planet');

    await waitFor(() => expect(test.store.getState().viewMode).toBe('system'));

    expect(test.galaxy.flyToSystem).not.toHaveBeenCalled();
    expect(test.createSystemScene).toHaveBeenCalledTimes(1);
  });

  it('второй flyRequest во время перелёта отменяет первый', async () => {
    const test = setup({ positions: { a: { x: 1, y: 0, z: 0 }, b: { x: 2, y: 0, z: 0 } } });
    active = test;

    test.store.getState().requestFly('a', 'planet');
    test.store.getState().requestFly('b', 'star');
    test.galaxy.arrive();

    await waitFor(() => expect(test.store.getState().viewMode).toBe('system'));

    expect(test.getPlanetDetail).toHaveBeenCalledWith('b');
    expect(test.getPlanetDetail).not.toHaveBeenCalledWith('a');
    expect(test.store.getState().sceneTarget).toBe('star');
  });

  it('перелёт запускает Exo.MAST один раз и сброс выходит без ошибки', async () => {
    const test = setup({});
    active = test;
    const loadExoMast = vi.fn(async () => undefined);
    const cancelExoMast = vi.fn();
    test.store.setState({ loadExoMast, cancelExoMast });

    test.store.getState().requestFly('a', 'planet');
    test.store.getState().requestFly('a', 'planet');

    expect(loadExoMast).toHaveBeenCalledTimes(1);
    expect(loadExoMast).toHaveBeenCalledWith('a', 'approach');

    test.store.getState().leaveSystem();

    expect(cancelExoMast).toHaveBeenCalledWith('a', 'approach');
  });

  it('молекулы Exo.MAST применяются без пересоздания сцены', async () => {
    const test = setup({});
    active = test;

    test.store.getState().requestFly('a', 'planet');
    test.galaxy.arrive();
    await waitFor(() => expect(test.store.getState().viewMode).toBe('system'));

    test.store.setState({
      exoMast: {
        a: {
          state: 'updated',
          props: {
            planetId: 'a',
            fetchedAt: '2026-11-15T10:00:00.000Z',
            fromBackup: false,
            catalog: 'nexsci',
            raw: {},
            extracted: {},
            canonicalName: 'A',
            atmosphere: { molecules: ['H2O'], keys: ['atmosphere'] },
            spectraFiles: [],
          },
          errorReason: null,
          trigger: 'approach',
          spectra: {},
        },
      },
    });

    expect(test.createSystemScene).toHaveBeenCalledTimes(1);
    expect(test.scenes[0]?.setHints).toHaveBeenLastCalledWith({ molecules: ['H2O'] });
  });

  it('Esc во время перелёта возвращает карту и камеру', () => {
    const test = setup({});
    active = test;
    test.store.getState().requestFly('a', 'planet');

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(test.store.getState().viewMode).toBe('galaxy');
    expect(test.galaxy.setCameraState).toHaveBeenCalledWith(test.galaxy.camera, {
      durationMs: 0,
    });
    expect(test.createSystemScene).not.toHaveBeenCalled();
  });
});

describe('SystemController — сцена системы', () => {
  it('flyRequest той же планеты меняет только цель', async () => {
    const test = setup({ positions: {} });
    active = test;
    test.store.getState().requestFly('a', 'planet');
    await waitFor(() => expect(test.store.getState().viewMode).toBe('system'));
    const scene = test.scenes[0];
    const hostCalls = (test.host.setScene as ReturnType<typeof vi.fn>).mock.calls.length;

    test.store.getState().requestFly('a', 'star');

    expect(scene?.setTarget).toHaveBeenCalledWith('star');
    expect(test.createSystemScene).toHaveBeenCalledTimes(1);
    expect((test.host.setScene as ReturnType<typeof vi.fn>).mock.calls.length).toBe(hostCalls);
    expect(test.store.getState().sceneTarget).toBe('star');
  });

  it('другая планета освобождает предыдущую сцену и строит новую', async () => {
    const test = setup({ positions: {} });
    active = test;
    test.store.getState().requestFly('a', 'planet');
    await waitFor(() => expect(test.store.getState().viewMode).toBe('system'));
    const previous = test.scenes[0];

    test.store.getState().requestFly('b', 'planet');
    await waitFor(() => expect(test.createSystemScene).toHaveBeenCalledTimes(2));

    expect(test.store.getState().scenePlanetId).toBe('b');
    expect(previous?.dispose).toHaveBeenCalledTimes(1);
    expect(test.scenes[1]?.dispose).not.toHaveBeenCalled();
  });

  it('смена selectedPlanetId без flyRequest не меняет сцену', async () => {
    const test = setup({ positions: {} });
    active = test;
    test.store.getState().requestFly('a', 'planet');
    await waitFor(() => expect(test.store.getState().viewMode).toBe('system'));

    test.store.getState().selectPlanet('b');
    test.store.setState({ rows: [] });

    expect(test.store.getState().scenePlanetId).toBe('a');
    expect(test.createSystemScene).toHaveBeenCalledTimes(1);
    expect(test.scenes[0]?.dispose).not.toHaveBeenCalled();
  });

  it('leaveSystem восстанавливает камеру, освобождает сцену и сохраняет выбор', async () => {
    const test = setup({ positions: {}, reducedMotion: false });
    active = test;
    test.store.getState().requestFly('a', 'planet');
    await waitFor(() => expect(test.store.getState().viewMode).toBe('system'));
    const scene = test.scenes[0];

    test.store.getState().leaveSystem();

    expect(test.store.getState().viewMode).toBe('galaxy');
    expect(test.store.getState().selectedPlanetId).toBe('a');
    expect(scene?.dispose).toHaveBeenCalledTimes(1);
    expect(test.host.setScene).toHaveBeenLastCalledWith(test.galaxy, { fadeMs: 300 });
    expect(test.galaxy.setCameraState).toHaveBeenCalledWith(test.galaxy.camera, {
      durationMs: 600,
    });
  });

  it('сбой загрузки детали показывает Toast и возвращает карту', async () => {
    const test = setup({ positions: {}, failDetail: true });
    active = test;

    test.store.getState().requestFly('a', 'planet');

    await waitFor(() => expect(test.store.getState().viewMode).toBe('galaxy'));

    expect(test.toast).toHaveBeenCalledWith('Не удалось загрузить данные планеты');
    expect(test.createSystemScene).not.toHaveBeenCalled();
  });
});

describe('хранилище сцены', () => {
  it('деталь сцены загружается по scenePlanetId и переживает пустой ответ', async () => {
    let response: PlanetDetail | null = detail('a');
    const getPlanetDetail = vi.fn(async () => response as PlanetDetail);
    const store = makeStore(getPlanetDetail);

    store.setState({ scenePlanetId: 'a' });

    const first = await store.getState().refreshSceneDetail();

    expect(first?.id).toBe('a');
    expect(store.getState().sceneDetail?.id).toBe('a');

    response = null;

    const second = await store.getState().refreshSceneDetail();

    expect(second?.id).toBe('a');
    expect(store.getState().sceneDetail?.id).toBe('a');
    expect(store.getState().selectedPlanetId).toBe('a');
  });

  it('requestCameraReset в system меняет только счётчик системы', () => {
    const store = makeStore(async (id) => detail(id));

    store.setState({ viewMode: 'system', cameraResetSeq: 4, systemCameraResetSeq: 1 });
    store.getState().requestCameraReset();

    expect(store.getState().cameraResetSeq).toBe(4);
    expect(store.getState().systemCameraResetSeq).toBe(2);
  });

  it('масштаб и слои не сбрасываются при смене цели и планеты', () => {
    const store = makeStore(async (id) => detail(id));

    store.getState().setScaleMode('real');
    store.getState().setShowOrbit(false);
    store.getState().setShowHz(false);
    store.getState().setSceneTarget('star');
    store.getState().selectPlanet('b');

    expect(store.getState().scaleMode).toBe('real');
    expect(store.getState().showOrbit).toBe(false);
    expect(store.getState().showHz).toBe(false);
    expect(store.getState().selectedPlanetId).toBe('b');
    expect(store.getState().sceneTarget).toBe('star');
  });
});
