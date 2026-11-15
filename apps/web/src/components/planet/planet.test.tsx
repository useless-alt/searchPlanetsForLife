import {
  DEFAULT_SETTINGS,
  indexAdaptive,
  makeParam,
  nullParam,
  type ErrorLogEntry,
  type ModelSettings,
  type ResolvedPlanet,
  type ScoreBreakdown,
  type SolverFlags,
  type SourceStatus,
  type StatusResponse,
} from '@exo/shared';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TooltipProvider } from '../../help/TooltipProvider';
import { ru } from '../../i18n/ru';
import { createPlanetDetailLoader } from '../../state/planetDetail';
import { createAppStore, type AppState, type AppStore } from '../../state/store';
import { registerSlot, resetSlots, Slot } from '../../slots';
import type { ComputeBackend } from '../../workers/computeBackend';
import type { PlanetDetail, RankedRowView } from '../../workers/protocol';
import { PlanetPanel } from './PlanetPanel';

/**
 * Тесты карточки планеты (задача 19; п. 10.7, 13.5, U38, U40, U41).
 *
 * Проверяются подписи класса мира, происхождение значений, бейджи,
 * уведомление о выходе из Топ-50, зона обитаемости, свёрнутая декомпозиция,
 * действия, слоты и отбрасывание устаревшего ответа `getPlanetDetail`.
 */

const SETTINGS: ModelSettings = {
  ...DEFAULT_SETTINGS,
  mode: 'adaptive',
  hzBounds: 'optimistic',
  penalties: { ...DEFAULT_SETTINGS.penalties },
};

afterEach(() => {
  cleanup();
  resetSlots();
  sessionStorage.clear();
  vi.restoreAllMocks();
});

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

/** Землеподобная планета с заданными значениями. */
function makePlanet(overrides: Partial<ResolvedPlanet> = {}): ResolvedPlanet {
  return {
    id: 'earth',
    R: makeParam(1, 'measured'),
    M: makeParam(1, 'measured'),
    e: makeParam(0.0167, 'measured'),
    d: makeParam(1, 'measured'),
    P: makeParam(365.25, 'measured'),
    S: makeParam(1, 'physics'),
    T_eq: makeParam(255, 'physics'),
    rho: makeParam(5.51, 'physics'),
    L: makeParam(1, 'physics'),
    st_teff: makeParam(5772, 'measured'),
    st_rad: makeParam(1, 'measured'),
    st_mass: makeParam(1, 'measured'),
    dist_pc: makeParam(10, 'measured'),
    ra: makeParam(0, 'measured'),
    dec: makeParam(0, 'measured'),
    flags: flags(),
    ...overrides,
  };
}

/** Деталь планеты; все поля можно переопределить. */
function makeDetail(
  patch: Partial<PlanetDetail> = {},
  planet: ResolvedPlanet = makePlanet(),
): PlanetDetail {
  const score: ScoreBreakdown = indexAdaptive(planet, SETTINGS);

  return {
    id: planet.id,
    name: 'Земля',
    hostname: 'Солнце',
    letter: 'b',
    aliases: ['Earth'],
    sourcesCount: 3,
    resolved: planet,
    score,
    classicRank: 1,
    hz: { d_in: 0.95, d_out: 1.37, d_eff: 1, HZD: 0.12, F_HZ: 0.74 },
    world: 'earthlike',
    gaps: { planet: [], star: [], planetStub: false, starStub: false },
    inTop: true,
    ...patch,
  };
}

/** Мок REST-клиента: сеть в этих тестах не используется. */
function mockApi() {
  return {
    getStatus: vi.fn(
      async () =>
        ({
          phase: 'ready',
          refreshing: false,
          startedAt: null,
          finishedAt: null,
          sources: [] as SourceStatus[],
          hasSnapshot: true,
        }) as StatusResponse,
    ),
    getCatalog: vi.fn(async () => ({ notModified: true as const })),
    refresh: vi.fn(async () => 'started' as const),
    getErrors: vi.fn(async () => [] as ErrorLogEntry[]),
  };
}

/** Изолированное хранилище с открытым видом планеты. */
function setup(
  options: {
    detail?: PlanetDetail;
    getPlanetDetail?: ComputeBackend['getPlanetDetail'];
    state?: Partial<AppState>;
  } = {},
): { store: AppStore; backend: ComputeBackend } {
  const detail = options.detail ?? makeDetail();

  const backend: ComputeBackend = {
    init: async () => 1,
    compute: async () => ({
      rows: [] as RankedRowView[],
      counters: { total: 1, computed: 1, strictMeasured: 0, matching: 0 },
    }),
    getResolved: async () => [],
    getPositions: async () => [],
    getPlanetDetail: options.getPlanetDetail ?? (async () => detail),
    dispose: () => {},
  };

  const store = createAppStore({ api: mockApi(), backend, sleep: async () => {} });

  store.setState({
    phase: 'ready',
    selectedPlanetId: detail.id,
    planetCardOpen: true,
    rows: [],
    counters: { total: 1, computed: 1, strictMeasured: 0, matching: 0 },
    catalogIndex: { [detail.id]: { name: detail.name, hostname: detail.hostname ?? '' } },
    settings: SETTINGS,
    ...options.state,
  });

  return { store, backend };
}

/** Панель внутри провайдера подсказок. */
function renderPanel(store: AppStore): void {
  render(
    <TooltipProvider store={store}>
      <PlanetPanel store={store} />
    </TooltipProvider>,
  );
}

/** Ждёт загрузки детали по описанию класса мира. */
async function waitDetail(): Promise<void> {
  await screen.findByText(ru['world.earthlike']);
}

describe('заголовок и подсказка', () => {
  it('показывает имя, описание класса мира и подсказку о приближении', async () => {
    const { store } = setup();

    renderPanel(store);
    await waitDetail();

    expect(screen.getByRole('heading', { name: 'Земля' })).toBeTruthy();
    expect(screen.getByText(ru['world.earthlike'])).toBeTruthy();
    expect(screen.getByText(ru['planet.hint'])).toBeTruthy();
  });

  it('при открытии фокус переходит на заголовок планеты', async () => {
    const { store } = setup();

    renderPanel(store);
    await waitDetail();

    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Земля' }));
  });

  it('метка происхождения всегда содержит текст, отсутствие значения — «Нет данных»', async () => {
    const planet = makePlanet({ M: nullParam() });
    const { store } = setup({ detail: makeDetail({}, planet) });

    renderPanel(store);
    await waitDetail();

    expect(screen.getAllByText(ru['provenance.measured']).length).toBeGreaterThan(0);
    expect(screen.getByText(ru['provenance.none'])).toBeTruthy();
  });

  it('бейдж «Реконструкция по расчётной модели» виден при Уровне Б', async () => {
    const planet = makePlanet({ flags: flags({ levelB_mass: true }) });
    const { store } = setup({ detail: makeDetail({}, planet) });

    renderPanel(store);
    await waitDetail();

    expect(screen.getByText(ru['badge.reconstructed'])).toBeTruthy();
  });

  it('бейдж Q_data скрыт по умолчанию и появляется в режиме дополнительных данных', async () => {
    const { store } = setup();

    renderPanel(store);
    await waitDetail();

    expect(screen.queryByText(ru['table.q.high'])).toBeNull();

    act(() => {
      store.getState().setShowExtraData(true);
    });

    expect(document.querySelector('[data-extra="card.qdata"]')).toBeTruthy();
    expect(screen.getByText(ru['table.q.high'])).toBeTruthy();
  });

  it('уведомление «Планета не входит в текущий Топ-50» при inTop = false', async () => {
    const { store } = setup({ detail: makeDetail({ inTop: false }) });

    renderPanel(store);
    await waitDetail();

    expect(screen.getByText(ru['planet.notInTop'])).toBeTruthy();
  });

  it('альтернативные значения скрыты по умолчанию и видны в режиме дополнительных данных', async () => {
    const planet = makePlanet({
      R: {
        ...makeParam(1, 'measured'),
        alternatives: [{ source: 'nasa', value: 1.02, sourceDate: null }],
      },
    });
    const { store } = setup({ detail: makeDetail({}, planet) });

    renderPanel(store);
    await waitDetail();

    expect(screen.queryByText(/Другие значения/)).toBeNull();

    act(() => {
      store.getState().setShowExtraData(true);
    });

    expect(screen.getByText(/Другие значения: NASA Exoplanet Archive 1\.02/)).toBeTruthy();
    expect(document.querySelector('[data-extra="card.alternatives"]')).toBeTruthy();
  });
});

describe('декомпозиция балла', () => {
  it('по умолчанию свёрнута, раскрывается кнопкой с aria-expanded', async () => {
    const { store } = setup();

    renderPanel(store);
    await waitDetail();

    const toggle = screen.getByRole('button', { name: ru['planet.decomp.title'] });

    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText(ru['planet.decomp.columns.metric'])).toBeNull();

    fireEvent.click(toggle);

    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText(ru['planet.decomp.row.base'])).toBeTruthy();
    expect(screen.getByText(ru['planet.decomp.row.result'])).toBeTruthy();
    expect(screen.getByText(ru['planet.decomp.columns.metric'])).toBeTruthy();
  });
});

describe('действия', () => {
  it('«← Карта Галактики» сбрасывает камеру и закрывает вид', async () => {
    const { store } = setup();

    renderPanel(store);
    await waitDetail();

    fireEvent.click(screen.getByRole('button', { name: ru['planet.backToMap'] }));

    expect(store.getState().planetCardOpen).toBe(false);
    expect(store.getState().cameraResetSeq).toBe(1);
  });

  it('«Закрыть» закрывает вид без сброса камеры', async () => {
    const { store } = setup();

    renderPanel(store);
    await waitDetail();

    fireEvent.click(screen.getByRole('button', { name: ru['planet.close'] }));

    expect(store.getState().planetCardOpen).toBe(false);
    expect(store.getState().cameraResetSeq).toBe(0);
  });

  it('«Показать на карте» закрывает вид и запрашивает фокус карты', async () => {
    const { store } = setup();

    renderPanel(store);
    await waitDetail();

    fireEvent.click(screen.getByRole('button', { name: ru['planet.action.showOnMap'] }));

    expect(store.getState().planetCardOpen).toBe(false);
    expect(store.getState().mapFocusRequest?.planetId).toBe('earth');
  });

  it('без координат кнопка «Показать на карте» отключена и подписана', async () => {
    const planet = makePlanet({ ra: nullParam() });
    const { store } = setup({ detail: makeDetail({}, planet) });

    renderPanel(store);
    await waitDetail();

    const button = screen.getByRole('button', {
      name: ru['planet.action.showOnMap'],
    }) as HTMLButtonElement;

    expect(button.disabled).toBe(true);
    expect(screen.getByText(ru['planet.action.noCoords'])).toBeTruthy();
  });

  it('«Приблизить» запрашивает перелёт к планете и работает при заглушке', async () => {
    const { store } = setup({
      detail: makeDetail({
        gaps: { planet: ['R'], star: [], planetStub: true, starStub: false },
      }),
    });

    renderPanel(store);
    await waitDetail();

    const button = screen.getByRole('button', {
      name: ru['planet.action.fly'],
    }) as HTMLButtonElement;

    expect(button.disabled).toBe(false);

    fireEvent.click(button);

    expect(store.getState().flyRequest).toEqual({
      planetId: 'earth',
      target: 'planet',
      seq: 1,
    });
  });

  it('Esc внутри панели закрывает вид планеты', async () => {
    const { store } = setup();

    renderPanel(store);
    await waitDetail();

    fireEvent.keyDown(screen.getByRole('region', { name: 'Земля' }), { key: 'Escape' });

    expect(store.getState().planetCardOpen).toBe(false);
  });
});

describe('слоты', () => {
  it('без регистрации показывает запасной текст, после регистрации — компонент', async () => {
    const { store } = setup();

    renderPanel(store);
    await waitDetail();

    expect(screen.getByText(ru['planet.viewport.empty'])).toBeTruthy();
    expect(screen.queryByText('Данные реконструкции')).toBeNull();

    function Reconstruction() {
      return <span>Данные реконструкции</span>;
    }

    function Viewport() {
      return <span>Холст сцены</span>;
    }

    act(() => {
      registerSlot('reconstruction', Reconstruction);
      registerSlot('viewport', Viewport);
    });

    expect(screen.getByText('Данные реконструкции')).toBeTruthy();
    expect(screen.getByText('Холст сцены')).toBeTruthy();
    expect(screen.queryByText(ru['planet.viewport.empty'])).toBeNull();
  });

  it('кнопка «Обновить данные планеты» появляется только после регистрации слота', async () => {
    const { store } = setup();

    renderPanel(store);
    await waitDetail();

    expect(screen.queryByRole('button', { name: ru['planet.action.refresh'] })).toBeNull();

    function RefreshPlanet() {
      return <button type="button">{ru['planet.action.refresh']}</button>;
    }

    act(() => {
      registerSlot('refreshPlanet', RefreshPlanet);
    });

    expect(screen.getByRole('button', { name: ru['planet.action.refresh'] })).toBeTruthy();
  });

  it('Slot рендерит запасное содержимое и заменяет его зарегистрированным', () => {
    render(<Slot name="reconstruction" fallback={<span>пусто</span>} />);

    expect(screen.getByText('пусто')).toBeTruthy();

    act(() => {
      registerSlot('reconstruction', () => <span>готово</span>);
    });

    expect(screen.getByText('готово')).toBeTruthy();
    expect(screen.queryByText('пусто')).toBeNull();
  });
});

describe('устаревший ответ getPlanetDetail', () => {
  it('не перезаписывает свежую деталь', async () => {
    const first = makeDetail({ id: 'first', name: 'Первая' });
    const second = makeDetail({ id: 'second', name: 'Вторая' });

    let resolveFirst: (value: PlanetDetail) => void = () => {};
    let resolveSecond: (value: PlanetDetail) => void = () => {};

    const requests: Record<string, Promise<PlanetDetail>> = {
      first: new Promise((resolve) => {
        resolveFirst = resolve;
      }),
      second: new Promise((resolve) => {
        resolveSecond = resolve;
      }),
    };

    const loader = createPlanetDetailLoader((id) => requests[id] as Promise<PlanetDetail>);

    const firstLoad = loader.load('first');
    const secondLoad = loader.load('second');

    resolveSecond(second);
    expect(await secondLoad).toEqual(second);

    resolveFirst(first);
    expect(await firstLoad).toBeNull();
    expect(loader.detail?.id).toBe('second');
  });
});
