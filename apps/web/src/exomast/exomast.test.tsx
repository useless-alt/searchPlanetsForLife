import type { ExoMastProps, ResolvedPlanet } from '@exo/shared';
import { waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { ApiClient } from '../api/client';
import { ExoMastApiError, createExoMastApi, type ExoMastApi } from './api';
import { ExoMastBridge } from './bridge';
import type { ExoMastEntry } from './slice';
import { createAppStore, type AppStore } from '../state/store';
import type { ComputeBackend } from '../workers/computeBackend';

/**
 * Тесты клиентского кэша Exo.MAST и моста в 3D-сцену (задача 28).
 *
 * Сети нет: клиент Exo.MAST подменён, запросы управляются вручную.
 */

/** Заглушка REST-клиента каталога. */
function apiStub(): ApiClient {
  return {
    getStatus: vi.fn(),
    getCatalog: vi.fn(),
    refresh: vi.fn(),
    getErrors: vi.fn(),
  } as unknown as ApiClient;
}

/** Заглушка вычислительного бэкенда. */
function backendStub(): ComputeBackend {
  return {
    init: vi.fn(async () => 0),
    compute: vi.fn(async () => ({
      rows: [],
      counters: { total: 0, computed: 0, strictMeasured: 0, matching: 0 },
    })),
    getResolved: vi.fn(async () => []),
    getPositions: vi.fn(async () => []),
    getPlanetDetail: vi.fn(),
    dispose: vi.fn(),
  } as unknown as ComputeBackend;
}

/** Свойства планеты. */
function props(planetId: string, options: Partial<ExoMastProps> = {}): ExoMastProps {
  return {
    planetId,
    fetchedAt: '2026-11-15T10:00:00.000Z',
    fromBackup: false,
    catalog: 'nexsci',
    raw: {},
    extracted: {},
    canonicalName: 'WASP-12 b',
    atmosphere: { molecules: [], keys: [] },
    spectraFiles: [],
    ...options,
  };
}

/** Отложенный промис. */
function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

/** Клиент, отвечающий по сценарию. */
function apiWith(
  handler: (
    planetId: string,
    signal?: AbortSignal,
  ) => Promise<{ props: ExoMastProps; status: 'updated' | 'backup' }>,
): ExoMastApi & { calls: string[] } {
  const calls: string[] = [];

  return {
    calls,
    async getExoMast(planetId, signal) {
      calls.push(planetId);
      return handler(planetId, signal);
    },
    async getSpectrum() {
      throw new ExoMastApiError('spectrum_not_listed', 404);
    },
  };
}

/** Хранилище с минимальными зависимостями. */
function makeStore(exoMastApi: ExoMastApi): AppStore {
  return createAppStore({
    api: apiStub(),
    backend: backendStub(),
    exoMastApi,
    sleep: async () => {},
  });
}

/** Планета для кэша (поля не важны). */
const RESOLVED = { id: 'p' } as ResolvedPlanet;

describe('клиент Exo.MAST', () => {
  it('дополняет ответ сервера прежней версии полями задачи 28', async () => {
    const legacy = {
      planetId: 'p',
      fetchedAt: '2026-11-15T10:00:00.000Z',
      fromBackup: false,
      catalog: 'nexsci',
      raw: {},
      extracted: {},
    };
    const fetchImpl = vi.fn(async () => ({
      status: 200,
      ok: true,
      json: async () => ({ props: legacy, status: 'updated' }),
    }));
    const api = createExoMastApi({ fetchImpl: fetchImpl as unknown as typeof fetch });

    const result = await api.getExoMast('p');

    expect(result.props.canonicalName).toBeNull();
    expect(result.props.atmosphere).toEqual({ molecules: [], keys: [] });
    expect(result.props.spectraFiles).toBeNull();
  });
});

describe('клиентский кэш Exo.MAST', () => {
  it('приближение к планете запрашивает данные один раз', async () => {
    const api = apiWith(async () => ({ props: props('p'), status: 'updated' }));
    const store = makeStore(api);

    await store.getState().loadExoMast('p', 'approach');
    await store.getState().loadExoMast('p', 'approach');

    expect(api.calls).toEqual(['p']);
    expect(store.getState().exoMast['p']?.state).toBe('updated');
  });

  it('ручное обновление повторяет запрос и при готовых данных', async () => {
    const api = apiWith(async () => ({ props: props('p'), status: 'updated' }));
    const store = makeStore(api);

    await store.getState().loadExoMast('p', 'approach');
    await store.getState().loadExoMast('p', 'manual');

    expect(api.calls).toEqual(['p', 'p']);
  });

  it('отмена автоматического запроса не помечает его ошибкой', async () => {
    const pending = deferred<{ props: ExoMastProps; status: 'updated' }>();
    const api = apiWith((planetId, signal) => {
      signal?.addEventListener('abort', () => {
        const error = new Error('отменено');
        error.name = 'AbortError';
        pending.reject(error);
      });
      return pending.promise;
    });
    const store = makeStore(api);

    const loading = store.getState().loadExoMast('p', 'approach');
    store.getState().cancelExoMast('p', 'approach');

    await loading;

    const entry: ExoMastEntry | undefined = store.getState().exoMast['p'];
    expect(entry?.state).toBe('idle');
    expect(entry?.errorReason).toBeNull();
  });

  it('ошибка сохраняет прежние props и записывает причину', async () => {
    let fail = false;
    const api = apiWith(async () => {
      if (fail) throw new ExoMastApiError('timeout', 0);
      return { props: props('p'), status: 'updated' };
    });
    const store = makeStore(api);

    await store.getState().loadExoMast('p', 'approach');
    fail = true;
    await store.getState().loadExoMast('p', 'manual');

    const entry = store.getState().exoMast['p'];
    expect(entry?.state).toBe('error');
    expect(entry?.errorReason).toBe('timeout');
    expect(entry?.props?.planetId).toBe('p');
  });

  it('кэш вытесняет давно не использованные записи, но не запись текущей сцены', async () => {
    const api = apiWith(async (planetId) => ({
      props: props(planetId, { atmosphere: { molecules: [], keys: [] } }),
      status: 'updated',
    }));
    const store = makeStore(api);

    store.setState({ scenePlanetId: 'p0', resolvedCache: { p0: RESOLVED } });

    for (let index = 0; index <= 30; index += 1) {
      await store.getState().loadExoMast(`p${String(index)}`, 'approach');
    }

    const entries = store.getState().exoMast;
    expect(Object.keys(entries)).toHaveLength(30);
    expect(entries['p0']).toBeDefined();
    expect(entries['p1']).toBeUndefined();
    expect(entries['p30']).toBeDefined();
  });
});

describe('мост Exo.MAST → 3D', () => {
  it('после загрузки молекул вызывает setHints без перестройки сцены', async () => {
    const api = apiWith(async () => ({
      props: props('p', { atmosphere: { molecules: ['H2O', 'CH4'], keys: ['atmosphere'] } }),
      status: 'updated',
    }));
    const store = makeStore(api);
    const target = { setHints: vi.fn() };
    const bridge = new ExoMastBridge({ store, getTarget: () => target });

    bridge.begin('p');

    await waitFor(() => {
      expect(target.setHints).toHaveBeenCalledWith({ molecules: ['H2O', 'CH4'] });
    });

    bridge.dispose();
  });

  it('смена планеты сбрасывает подсказки и отменяет прежний запрос', async () => {
    const pending = deferred<{ props: ExoMastProps; status: 'updated' }>();
    const api = apiWith((planetId, signal) => {
      if (planetId === 'a') {
        signal?.addEventListener('abort', () => {
          const error = new Error('отменено');
          error.name = 'AbortError';
          pending.reject(error);
        });
        return pending.promise;
      }

      return Promise.resolve({ props: props('b'), status: 'updated' });
    });
    const store = makeStore(api);
    const target = { setHints: vi.fn() };
    const bridge = new ExoMastBridge({ store, getTarget: () => target });

    bridge.begin('a');
    bridge.begin('b');

    await waitFor(() => {
      expect(store.getState().exoMast['a']?.state).toBe('idle');
    });
    expect(target.setHints).toHaveBeenCalledWith(null);
    expect(api.calls).toEqual(['a', 'b']);

    bridge.end();
    expect(target.setHints).toHaveBeenLastCalledWith(null);
    bridge.dispose();
  });

  it('пустой список молекул даёт setHints(null)', async () => {
    const api = apiWith(async () => ({ props: props('p'), status: 'updated' }));
    const store = makeStore(api);
    const target = { setHints: vi.fn() };
    const bridge = new ExoMastBridge({ store, getTarget: () => target });

    bridge.begin('p');
    await waitFor(() => {
      expect(store.getState().exoMast['p']?.state).toBe('updated');
    });

    expect(target.setHints).toHaveBeenLastCalledWith(null);
    bridge.dispose();
  });
});
