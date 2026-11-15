import {
  makeParam,
  nullParam,
  type CatalogResponse,
  type MergeStats,
  type ModelSettings,
  type ParamValue,
  type PlanetRecord,
  type Provenance,
  type RawParamKey,
  type SourceId,
  type SourceStatus,
  type StatusResponse,
} from '@exo/shared';
import { createElement } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ApiClient } from '../api/client';
import App, { type AppProps } from '../App';
import { ru } from '../i18n/ru';
import { createInlineBackend, type ComputeBackend } from '../workers/computeBackend';
import type { ComputeResult } from '../workers/protocol';
import { isSelectedInTop } from './selectors';
import { createAppStore } from './store';

/**
 * Тесты каркаса web (задача 12).
 *
 * Проверяются: последовательность фаз загрузки, экран ошибки и повторное
 * обновление, отбрасывание устаревших пересчётов, сохранение выбранной
 * планеты и поведение `refresh` при ответе 304.
 */

afterEach(cleanup);

const NOW = '2026-11-14T12:00:00.000Z';
const SOURCE_DATE = '2026-11-01T00:00:00.000Z';
const SOURCE_ORDER: SourceId[] = ['gaia', 'exomast', 'nasa', 'exoplanet_eu', 'simbad', 'exomercat'];

/** Значение параметра с заданным происхождением. */
function param(value: number | null, provenance: Provenance = 'measured'): ParamValue {
  return value === null ? nullParam() : makeParam(value, provenance, 'nasa', SOURCE_DATE);
}

/** Планета, похожая на Землю, с возможностью переопределить параметры. */
function planet(
  id: string,
  overrides: Partial<Record<RawParamKey, ParamValue>> = {},
): PlanetRecord {
  const params: Record<RawParamKey, ParamValue> = {
    pl_rade: param(1),
    pl_bmasse: param(1),
    pl_orbsmax: param(1),
    pl_orbper: param(365.25),
    pl_orbeccen: param(0.01),
    pl_insol: param(1),
    pl_eqt: param(255),
    st_teff: param(5778),
    st_rad: param(1),
    st_mass: param(1),
    st_lum: param(0),
    sy_dist: param(10),
    ra: param(0),
    dec: param(0),
    ...overrides,
  };

  return {
    id,
    name: id.toUpperCase(),
    aliases: [],
    hostname: `Звезда ${id}`,
    letter: 'b',
    hostAliases: [],
    sources: ['nasa'],
    warnings: [],
    params,
  };
}

/** Статусы шести источников. */
function statuses(): SourceStatus[] {
  return SOURCE_ORDER.map((source) => ({
    source,
    state: 'updated',
    backupAt: null,
    message: null,
  }));
}

/** Ответ `/api/status`. */
function statusResponse(overrides: Partial<StatusResponse> = {}): StatusResponse {
  return {
    phase: 'ready',
    refreshing: false,
    startedAt: NOW,
    finishedAt: NOW,
    sources: statuses(),
    hasSnapshot: true,
    ...overrides,
  };
}

/** Статистика слияния для ответа каталога. */
function mergeStats(count: number): MergeStats {
  return {
    recordsBySource: Object.fromEntries(SOURCE_ORDER.map((source) => [source, 0])) as Record<
      SourceId,
      number
    >,
    uniquePlanets: count,
    mergedClusters: 0,
    rejectedUnions: 0,
    sameSourceDuplicates: 0,
    ruleCounts: { R1: 0, R2: 0, R3: 0, R4: 0 },
    vetoed: 0,
  };
}

/** Ответ `/api/catalog` для набора планет. */
function catalogResponse(planets: PlanetRecord[], id = 'snapshot-1'): CatalogResponse {
  return {
    snapshot: { id, builtAt: NOW, planetCount: planets.length, schemaVersion: 1 },
    planets,
    sources: statuses(),
    stats: mergeStats(planets.length),
  };
}

/** Счётчики-маркер. */
function counters(total: number) {
  return { total, computed: total, strictMeasured: total, matching: total };
}

/** Мок REST-клиента с отдельными шпионами. */
function createMockApi() {
  const getStatus = vi.fn<() => Promise<StatusResponse>>();
  const getCatalog = vi.fn<ApiClient['getCatalog']>();
  const refresh = vi.fn<() => Promise<'started' | 'in_progress'>>();
  const getErrors = vi.fn<ApiClient['getErrors']>();

  const api: ApiClient = { getStatus, getCatalog, refresh, getErrors };

  return { api, getStatus, getCatalog, refresh, getErrors };
}

/** Даёт отработать микрозадачам промисов. */
async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('загрузка каталога', () => {
  it('проходит boot → loading → ready и становится ready только после ответа воркера', async () => {
    const mock = createMockApi();

    mock.getStatus
      .mockResolvedValueOnce(
        statusResponse({ phase: 'loading', refreshing: false, hasSnapshot: false }),
      )
      .mockResolvedValueOnce(statusResponse());

    mock.getCatalog.mockResolvedValue({
      notModified: false,
      catalog: catalogResponse([planet('earth')]),
    });

    let releaseInit: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      releaseInit = resolve;
    });

    const base = createInlineBackend();
    const init = vi.fn(async (planets: readonly PlanetRecord[]) => {
      await gate;
      return base.init(planets);
    });
    const backend: ComputeBackend = { ...base, init };

    const store = createAppStore({ api: mock.api, backend, sleep: async () => {} });

    expect(store.getState().phase).toBe('boot');

    const started = store.getState().start();
    expect(store.getState().phase).toBe('loading');

    // Каталог уже запрошен, но воркер ещё не подтвердил готовность.
    await vi.waitFor(() => {
      expect(mock.getCatalog).toHaveBeenCalledTimes(1);
    });

    expect(init).toHaveBeenCalledTimes(1);
    expect(store.getState().phase).toBe('loading');

    releaseInit();
    await started;

    expect(store.getState().phase).toBe('ready');
    expect(store.getState().snapshotId).toBe('snapshot-1');
    expect(store.getState().rows.map((row) => row.planetId)).toEqual(['earth']);
  });

  it('при ошибке показывает экран ошибки, а кнопка запускает POST /api/refresh', async () => {
    const mock = createMockApi();

    mock.getStatus
      .mockRejectedValueOnce(new Error('сервер недоступен'))
      .mockResolvedValueOnce(
        statusResponse({ phase: 'loading', refreshing: false, hasSnapshot: false }),
      )
      .mockResolvedValueOnce(statusResponse());

    mock.getCatalog.mockResolvedValue({
      notModified: false,
      catalog: catalogResponse([planet('earth')]),
    });
    mock.refresh.mockResolvedValue('started');

    const store = createAppStore({
      api: mock.api,
      backend: createInlineBackend(),
      sleep: async () => {},
    });

    render(createElement<AppProps>(App, { store }));

    await vi.waitFor(() => {
      expect(store.getState().phase).toBe('error');
    });

    expect(screen.getByText(ru['error.title'])).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: ru['error.retry'] }));

    await vi.waitFor(() => {
      expect(store.getState().phase).toBe('ready');
    });

    expect(mock.refresh).toHaveBeenCalledTimes(1);
    expect(screen.getByText(ru['table.title'])).toBeTruthy();
  });
});

describe('пересчёт', () => {
  it('при трёх compute подряд применяется результат только последнего', async () => {
    const mock = createMockApi();
    mock.getStatus.mockResolvedValue(statusResponse());
    mock.getCatalog.mockResolvedValue({
      notModified: false,
      catalog: catalogResponse([planet('earth')]),
    });

    const pending: Array<{
      settings: ModelSettings;
      resolve: (result: ComputeResult) => void;
    }> = [];

    const backend: ComputeBackend = {
      init: async () => 1,
      compute: (settings) =>
        new Promise<ComputeResult>((resolve) => {
          pending.push({ settings, resolve });
        }),
      getResolved: async () => [],
      getPositions: async () => [],
      getPlanetDetail: async () => {
        throw new Error('деталь в этом тесте не используется');
      },
      dispose: () => {},
    };

    const store = createAppStore({ api: mock.api, backend, sleep: async () => {} });
    const started = store.getState().start();

    await vi.waitFor(() => {
      expect(pending).toHaveLength(1);
    });

    pending[0]?.resolve({ rows: [], counters: counters(1) });
    await started;

    expect(store.getState().counters?.total).toBe(1);

    // Три быстрых изменения настроек: два первых результата устареют.
    store.getState().setMode('rhi');
    store.getState().setMode('classic_esi');
    store.getState().setMode('strict');

    expect(pending).toHaveLength(4);

    pending[1]?.resolve({ rows: [], counters: counters(100) });
    await flushMicrotasks();
    expect(store.getState().counters?.total).toBe(1);

    pending[2]?.resolve({ rows: [], counters: counters(200) });
    await flushMicrotasks();
    expect(store.getState().counters?.total).toBe(1);

    pending[3]?.resolve({ rows: [], counters: counters(300) });
    await vi.waitFor(() => {
      expect(store.getState().counters?.total).toBe(300);
    });
  });

  it('выбранная планета переживает смену режима, даже выпав из Топ-50', async () => {
    const mock = createMockApi();

    // Планета A не проходит строгий режим: поток вычислен, а не измерен.
    const a = planet('a', { pl_insol: param(1, 'physics') });
    const b = planet('b');

    mock.getStatus.mockResolvedValue(statusResponse());
    mock.getCatalog.mockResolvedValue({
      notModified: false,
      catalog: catalogResponse([a, b]),
    });

    const store = createAppStore({
      api: mock.api,
      backend: createInlineBackend(),
      sleep: async () => {},
    });

    await store.getState().start();

    expect(
      store
        .getState()
        .rows.map((row) => row.planetId)
        .sort(),
    ).toEqual(['a', 'b']);

    store.getState().selectPlanet('a');
    expect(isSelectedInTop(store.getState())).toBe(true);

    store.getState().setMode('strict');

    await vi.waitFor(() => {
      expect(store.getState().rows.map((row) => row.planetId)).toEqual(['b']);
    });

    expect(store.getState().selectedPlanetId).toBe('a');
    expect(isSelectedInTop(store.getState())).toBe(false);

    // Сортировка и фильтры выбор тоже не сбрасывают.
    store.getState().setSort('R', 'desc');
    store.getState().setFilters({ spectralClasses: ['G'] });

    expect(store.getState().selectedPlanetId).toBe('a');
  });
});

describe('обновление снимка', () => {
  it('во время обновления данные остаются, а ответ 304 не вызывает перерасчёт', async () => {
    const mock = createMockApi();

    mock.getStatus.mockResolvedValue(statusResponse());
    mock.getCatalog.mockResolvedValue({
      notModified: false,
      catalog: catalogResponse([planet('earth')]),
    });
    mock.refresh.mockResolvedValue('started');

    const base = createInlineBackend();
    let computeCalls = 0;
    const backend: ComputeBackend = {
      ...base,
      compute(settings, filters, sort) {
        computeCalls += 1;
        return base.compute(settings, filters, sort);
      },
    };

    const store = createAppStore({ api: mock.api, backend, sleep: async () => {} });

    await store.getState().start();

    const rowsBefore = store.getState().rows;
    const callsBefore = computeCalls;

    expect(rowsBefore).toHaveLength(1);

    let releaseStatus: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      releaseStatus = resolve;
    });

    mock.getStatus
      .mockReset()
      .mockResolvedValueOnce(statusResponse({ refreshing: true }))
      .mockImplementationOnce(async () => {
        await gate;
        return statusResponse({ refreshing: false });
      });

    mock.getCatalog.mockReset();
    mock.getCatalog.mockResolvedValue({ notModified: true });

    const refreshing = store.getState().refresh();

    await vi.waitFor(() => {
      expect(store.getState().refreshing).toBe(true);
    });

    // Пока сервер собирает новый снимок, экран показывает прежние данные.
    expect(store.getState().rows).toBe(rowsBefore);

    // Single-flight: повторный вызов возвращает тот же промис.
    expect(store.getState().refresh()).toBe(refreshing);

    await vi.waitFor(() => {
      expect(mock.getStatus).toHaveBeenCalledTimes(2);
    });

    releaseStatus();
    await refreshing;

    expect(store.getState().refreshing).toBe(false);
    expect(store.getState().phase).toBe('ready');
    expect(store.getState().rows).toBe(rowsBefore);
    expect(computeCalls).toBe(callsBefore);

    // Каталог запрошен с ETag прежнего снимка.
    expect(mock.getCatalog).toHaveBeenLastCalledWith('snapshot-1');
  });
});
