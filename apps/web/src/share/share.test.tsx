import {
  DEFAULT_FILTERS,
  DEFAULT_SETTINGS,
  encodeShare,
  makeParam,
  nullParam,
  type CatalogResponse,
  type ErrorLogEntry,
  type MergeStats,
  type ParamValue,
  type PlanetRecord,
  type Provenance,
  type RawParamKey,
  type ScoreBreakdown,
  type SharedState,
  type SourceId,
  type SourceStatus,
  type StatusResponse,
} from '@exo/shared';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import App from '../App';
import { LinkFallbackDialog } from '../components/share/LinkFallbackDialog';
import { ToastHost, resetToasts } from '../components/ui/Toast';
import { ru } from '../i18n/ru';
import { parseInitialShared, resetInitialShared, takeInitialShared } from './initialShared';
import { useShareActions } from './useShareActions';
import type { ApiClient } from '../api/client';
import { createAppStore, type AppStore } from '../state/store';
import type { ComputeBackend } from '../workers/computeBackend';
import type { PlanetDetail, RankedRowView } from '../workers/protocol';

/**
 * Тесты «Ссылки» и экспорта CSV в приложении (задача 20; 13.1, U42, U45).
 *
 * Проверяются: восстановление состояния до первого пересчёта, проверка
 * планеты по каталогу, удаление хэша, уведомления, три пути копирования и
 * отключение CSV при пустой таблице.
 */

const NOW = '2026-11-14T12:00:00.000Z';
const SOURCE_ORDER: SourceId[] = ['gaia', 'exomast', 'nasa', 'exoplanet_eu', 'simbad', 'exomercat'];

beforeEach(() => {
  resetToasts();
  resetInitialShared();
  window.history.replaceState(null, '', '/');
});

afterEach(() => {
  cleanup();
  resetToasts();
  resetInitialShared();
  vi.restoreAllMocks();
  window.history.replaceState(null, '', '/');
});

/** Значение параметра с заданным происхождением. */
function param(value: number | null, provenance: Provenance = 'measured'): ParamValue {
  return value === null ? nullParam() : makeParam(value, provenance, 'nasa', NOW);
}

/** Минимальная запись планеты для каталога. */
function planet(id: string): PlanetRecord {
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
function statusResponse(): StatusResponse {
  return {
    phase: 'ready',
    refreshing: false,
    startedAt: NOW,
    finishedAt: NOW,
    sources: statuses(),
    hasSnapshot: true,
  };
}

/** Статистика слияния. */
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

/** Ответ `/api/catalog`. */
function catalogResponse(planets: PlanetRecord[]): CatalogResponse {
  return {
    snapshot: { id: 'snapshot-1', builtAt: NOW, planetCount: planets.length, schemaVersion: 1 },
    planets,
    sources: statuses(),
    stats: mergeStats(planets.length),
  };
}

/** API, который отдаёт каталог (нужен для проверки планеты из ссылки). */
function catalogApi(planets: PlanetRecord[]): ApiClient {
  return {
    getStatus: vi.fn(async () => statusResponse()),
    getCatalog: vi.fn(async () => ({
      notModified: false as const,
      catalog: catalogResponse(planets),
    })),
    refresh: vi.fn(async () => 'started' as const),
    getErrors: vi.fn(async () => [] as ErrorLogEntry[]),
  };
}

/** Счётчики выборки. */
function counters(matching = 0) {
  return { total: 10, computed: 8, strictMeasured: 5, matching };
}

/** Разложение балла. */
function score(overrides: Partial<ScoreBreakdown> = {}): ScoreBreakdown {
  return {
    mode: 'adaptive',
    ESI_R: 0.95,
    ESI_rho: 0.9,
    ESI_ve: 0.93,
    ESI_S: 0.88,
    ESI_T: 0.91,
    ESI_interior: 0.92,
    F_HZ: 0.85,
    HZD: 0.1,
    P_rocky: 1,
    P_ecc: 1,
    P_star: 1,
    Q_data: 0.96,
    index: 0.577,
    k: 4,
    n: 4,
    insufficient_data: false,
    T_s: 288,
    v_e: 1.1,
    ...overrides,
  };
}

/** Строка таблицы. */
function rankedRow(planetId: string): RankedRowView {
  return {
    rank: 1,
    rankClassic: 1,
    delta: 0,
    planetId,
    score: score(),
    name: `Планета ${planetId}`,
    hostname: `Звезда ${planetId}`,
    R: 1.02,
    M: 1,
    T_s: 288,
    e: 0.05,
    spectralClass: 'G',
    dist_pc: 12.3,
    sourcesCount: 3,
    Q_data: 0.96,
    qLevel: 'high',
    provenance: { R: 'measured', M: 'measured', e: 'measured' },
    lowReliability: false,
    insufficient: false,
    levelB_mass: false,
    levelB_radius: false,
    e_assumed_zero: false,
  };
}

/** Изолированное хранилище с подменённым API и бэкендом. */
function makeStore(
  options: {
    api?: ApiClient;
    rows?: RankedRowView[];
    ready?: boolean;
  } = {},
): { store: AppStore; compute: ReturnType<typeof vi.fn<ComputeBackend['compute']>> } {
  const rows = options.rows ?? [];
  const compute = vi.fn<ComputeBackend['compute']>(async () => ({
    rows,
    counters: counters(rows.length),
  }));

  const backend: ComputeBackend = {
    init: async () => 0,
    compute,
    getResolved: async () => [],
    getPositions: async () => [],
    // Карточка в этих тестах не загружается: ожидание не создаёт ложных ошибок.
    getPlanetDetail: () => new Promise<PlanetDetail>(() => {}),
    dispose: () => {},
  };

  const store = createAppStore({
    api: options.api ?? catalogApi([]),
    backend,
    sleep: async () => {},
  });

  store.setState({ rows });

  if (options.ready === true) {
    store.setState({ phase: 'ready', counters: counters(rows.length) });
  }

  return { store, compute };
}

/** Хэш с настройками, фильтрами и сортировкой. */
function settingsHash(): string {
  const state: SharedState = {
    settings: {
      ...DEFAULT_SETTINGS,
      mode: 'rhi',
      hzBounds: 'optimistic',
      qMin: 0.8,
    },
    filters: {
      ...DEFAULT_FILTERS,
      spectralClasses: ['K', 'G'],
      radius: { min: 0.5, max: 2 },
      includeCandidates: true,
    },
    sort: { column: 'index', dir: 'desc' },
    selectedPlanetId: null,
    planetCardOpen: false,
  };

  return `#${encodeShare(state)}`;
}

/** Компонент-обвязка: действия, уведомления и запасной диалог. */
function ShareHarness({ store }: { store: AppStore }) {
  const { fallbackLink, closeFallback } = useShareActions(store);

  return (
    <>
      <ToastHost />
      <LinkFallbackDialog
        open={fallbackLink !== null}
        link={fallbackLink ?? ''}
        onClose={closeFallback}
      />
    </>
  );
}

describe('восстановление из ссылки', () => {
  it('не считает обычный якорь ссылкой на состояние', () => {
    expect(parseInitialShared('#app-main')).toBeNull();
    expect(parseInitialShared('#')).toBeNull();
  });

  it('применяет настройки, фильтры и сортировку до единственного пересчёта', async () => {
    window.history.replaceState(null, '', `/planets${settingsHash()}`);

    const initial = takeInitialShared();
    expect(initial).not.toBeNull();
    expect(window.location.hash).toBe('');

    const { store, compute } = makeStore({ api: catalogApi([planet('kepler-1-b')]) });

    store.getState().applyShared(initial?.state ?? {});

    // До отрисовки состояние уже из ссылки — первый compute пойдёт с ним.
    expect(store.getState().settings.mode).toBe('rhi');
    expect(store.getState().filters.radius).toEqual({ min: 0.5, max: 2 });
    expect(store.getState().sort).toEqual({ column: 'index', dir: 'desc' });

    render(<App store={store} initialShare={initial} />);

    await waitFor(() => expect(store.getState().phase).toBe('ready'));

    expect(compute).toHaveBeenCalledTimes(1);
    expect(compute.mock.calls[0]?.[0]).toMatchObject({ mode: 'rhi', qMin: 0.8 });
    expect(compute.mock.calls[0]?.[1]).toMatchObject({ radius: { min: 0.5, max: 2 } });
  });

  it('показывает уведомление, если планеты из ссылки нет в каталоге', async () => {
    const initial = parseInitialShared('#v=1&p=missing-planet');
    const { store } = makeStore({ api: catalogApi([planet('kepler-1-b')]) });

    render(<App store={store} initialShare={initial} />);

    await waitFor(() => {
      expect(screen.getByText(ru['share.planetNotFound'])).toBeTruthy();
    });

    expect(store.getState().selectedPlanetId).toBeNull();
  });

  it('открывает карточку планеты при open=1', async () => {
    const initial = parseInitialShared('#v=1&p=kepler-1-b&open=1');
    const { store } = makeStore({ api: catalogApi([planet('kepler-1-b')]) });

    render(<App store={store} initialShare={initial} />);

    await waitFor(() => {
      expect(store.getState().selectedPlanetId).toBe('kepler-1-b');
    });

    expect(store.getState().planetCardOpen).toBe(true);
  });

  it('показывает сообщение для ссылки другой версии', async () => {
    const initial = parseInitialShared('#v=2&m=rhi');
    const { store } = makeStore();

    render(<App store={store} initialShare={initial} />);

    await waitFor(() => {
      expect(screen.getByText(ru['share.versionMismatch'])).toBeTruthy();
    });

    // Чужая версия не меняет даже режим, хотя m=rhi выглядит допустимым.
    expect(store.getState().settings).toEqual(DEFAULT_SETTINGS);
  });
});

describe('копирование ссылки', () => {
  /** Дожидается регистрации действия «Ссылка». */
  async function waitForCopy(store: AppStore): Promise<() => void> {
    await waitFor(() => {
      expect(store.getState().actions.copyLink).not.toBeNull();
    });

    const action = store.getState().actions.copyLink;

    if (action === null) throw new Error('действие «Ссылка» не подключено');

    return action;
  }

  it('копирует через Clipboard API и показывает уведомление', async () => {
    const writeText = vi.fn(async (_text: string) => {});
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    const { store } = makeStore({ rows: [rankedRow('kepler-1-b')], ready: true });

    render(<ShareHarness store={store} />);
    const copyLink = await waitForCopy(store);

    await act(async () => {
      copyLink();
    });

    await waitFor(() => {
      expect(screen.getByText(ru['share.copied'])).toBeTruthy();
    });

    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText.mock.calls[0]?.[0]).toContain('#v=1');
  });

  it('при сбое Clipboard API копирует через execCommand', async () => {
    const writeText = vi.fn(async () => {
      throw new Error('нет разрешения');
    });
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    const execCommand = vi.fn(() => true);
    Object.defineProperty(document, 'execCommand', { configurable: true, value: execCommand });

    const { store } = makeStore({ ready: true });

    render(<ShareHarness store={store} />);
    const copyLink = await waitForCopy(store);

    await act(async () => {
      copyLink();
    });

    await waitFor(() => {
      expect(execCommand).toHaveBeenCalledWith('copy');
      expect(screen.getByText(ru['share.copied'])).toBeTruthy();
    });
  });

  it('при сбое обоих способов показывает диалог с готовой ссылкой', async () => {
    const writeText = vi.fn(async () => {
      throw new Error('нет разрешения');
    });
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    const execCommand = vi.fn(() => false);
    Object.defineProperty(document, 'execCommand', { configurable: true, value: execCommand });

    const { store } = makeStore({ ready: true });

    render(<ShareHarness store={store} />);
    const copyLink = await waitForCopy(store);

    await act(async () => {
      copyLink();
    });

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeTruthy();
    });

    const input = screen.getByLabelText(ru['share.fallback.label']) as HTMLInputElement;

    expect(input.value).toContain('#v=1');
    expect(input.readOnly).toBe(true);
  });
});

describe('экспорт CSV', () => {
  it('отключает действие при пустой таблице и подключает при появлении строк', async () => {
    const { store } = makeStore({ ready: true, rows: [] });

    render(<ShareHarness store={store} />);

    await waitFor(() => {
      expect(store.getState().actions.exportCsv).toBeNull();
    });

    act(() => {
      store.setState({ rows: [rankedRow('kepler-1-b')] });
    });

    await waitFor(() => {
      expect(store.getState().actions.exportCsv).not.toBeNull();
    });
  });

  it('скачивает CSV с BOM и именем файла режима', async () => {
    const createObjectURL = vi.fn((_blob: Blob) => 'blob:csv');
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL });

    const clicked: { anchor?: HTMLAnchorElement } = {};
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicked.anchor = this;
    });

    const { store } = makeStore({ ready: true, rows: [rankedRow('kepler-1-b')] });

    render(<ShareHarness store={store} />);

    await waitFor(() => {
      expect(store.getState().actions.exportCsv).not.toBeNull();
    });

    act(() => {
      store.getState().actions.exportCsv?.();
    });

    expect(click).toHaveBeenCalledTimes(1);
    expect(clicked.anchor?.download).toMatch(/^top50_adaptive_\d{4}-\d{2}-\d{2}\.csv$/);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:csv');

    const blob = createObjectURL.mock.calls[0]?.[0] as Blob;
    // jsdom не имеет Blob.text(): читаем байты и декодируем, сохраняя BOM.
    const buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(blob);
    });
    const text = new TextDecoder('utf-8', { ignoreBOM: true }).decode(buffer);

    expect(text.startsWith('\uFEFF')).toBe(true);
    expect(text).toContain('Ранг');
  });
});
