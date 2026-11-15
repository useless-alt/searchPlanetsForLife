import {
  DEFAULT_FILTERS,
  DEFAULT_SETTINGS,
  type ErrorLogEntry,
  type FilterState,
  type RankingCounters,
  type StatusResponse,
} from '@exo/shared';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ApiClient } from '../../api/client';
import { formatMessage, ru } from '../../i18n/ru';
import { selectSearchMatchIds } from '../../state/searchSelectors';
import { createAppStore, type AppState, type AppStore, type CatalogEntry } from '../../state/store';
import type { ComputeBackend } from '../../workers/computeBackend';
import type { ComputeResult, RankedRowView } from '../../workers/protocol';
import { SEARCH_DEBOUNCE_MS } from './SearchBox';
import { Toolbar } from './Toolbar';

/**
 * Тесты панели инструментов и панели «Параметры модели» (задача 14).
 *
 * Проверяются: поиск с задержкой и подсказками, выбор планеты с клавиатуры,
 * отсутствие пересчёта от поиска и «Земли (эталона)», черновик настроек с
 * одним пересчётом на «Применить», сбросы и зависимость от режима (U20).
 */

afterEach(cleanup);

/** Счётчики-маркер. */
function counters(total = 1): RankingCounters {
  return { total, computed: total, strictMeasured: total, matching: total };
}

/** Мок REST-клиента: сеть в этих тестах не используется. */
function mockApi(): ApiClient {
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

/** Изолированное хранилище с подменённым расчётом. */
function makeStore(overrides: Partial<AppState> = {}): {
  store: AppStore;
  compute: ReturnType<typeof vi.fn<ComputeBackend['compute']>>;
} {
  const compute = vi.fn<ComputeBackend['compute']>(
    async () => ({ rows: [], counters: counters() }) as ComputeResult,
  );

  const backend: ComputeBackend = {
    init: async () => 0,
    compute,
    getResolved: async () => [],
    getPositions: async () => [],
    getPlanetDetail: async () => {
      throw new Error('деталь в этом тесте не используется');
    },
    dispose: () => {},
  };

  const store = createAppStore({ api: mockApi(), backend, sleep: async () => {} });

  store.setState({ phase: 'ready', ...overrides });

  return { store, compute };
}

/** Даёт отработать микрозадачам промисов. */
async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

/** Ждёт паузу поиска и обновление выпадающего списка. */
async function waitForSearch(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, SEARCH_DEBOUNCE_MS + 40));
  });
}

/** Строка Топ-50: для поиска достаточно идентификатора. */
function row(planetId: string): RankedRowView {
  return { planetId } as RankedRowView;
}

/** Каталог для поиска: четыре планеты TRAPPIST-1 и ещё две записи. */
function searchCatalog(): Record<string, CatalogEntry> {
  return {
    'trappist-1-b': { name: 'TRAPPIST-1 b', hostname: 'TRAPPIST-1' },
    'trappist-1-c': { name: 'TRAPPIST-1 c', hostname: 'TRAPPIST-1' },
    'trappist-1-d': { name: 'TRAPPIST-1 d', hostname: 'TRAPPIST-1' },
    'trappist-1-e': { name: 'TRAPPIST-1 e', hostname: 'TRAPPIST-1' },
    'k2-18-b': { name: 'K2-18 b', hostname: 'TRAPPIST-1' },
    'kepler-442-b': { name: 'Kepler-442 b', hostname: 'Kepler-442' },
  };
}

/** Настройки с заданным режимом. */
function settingsWithMode(mode: (typeof DEFAULT_SETTINGS)['mode']) {
  return { ...DEFAULT_SETTINGS, penalties: { ...DEFAULT_SETTINGS.penalties }, mode };
}

/** Кнопка открытия панели параметров. */
function openPanel(): void {
  fireEvent.click(screen.getByRole('button', { name: new RegExp(ru['params.button']) }));
}

/** Панель параметров (открыта). */
function paramsPanel(): HTMLElement {
  return screen.getByRole('complementary', { name: ru['params.title'] });
}

describe('поиск', () => {
  it('находит планеты системы, ставит совпадения по имени первыми и помечает планеты вне Топ-50', async () => {
    const { store } = makeStore({
      catalogIndex: searchCatalog(),
      rows: [row('trappist-1-e')],
    });

    render(<Toolbar store={store} />);

    const input = screen.getByRole('combobox', { name: ru['search.label'] });

    fireEvent.change(input, { target: { value: 'trappist1' } });
    await waitForSearch();

    const options = screen.getAllByRole('option');

    expect(options).toHaveLength(5);
    expect(options[0]?.textContent).toContain('TRAPPIST-1 b');
    expect(options[1]?.textContent).toContain('TRAPPIST-1 c');
    expect(options[2]?.textContent).toContain('TRAPPIST-1 d');
    expect(options[3]?.textContent).toContain('TRAPPIST-1 e');
    expect(options[4]?.textContent).toContain('K2-18 b');

    // Планета в Топ-50 не помечается, остальные — помечаются.
    expect(within(options[3] ?? document.body).queryByText(ru['search.outsideTop'])).toBeNull();
    expect(within(options[4] ?? document.body).getByText(ru['search.outsideTop'])).toBeTruthy();
    expect(screen.getByText(formatMessage(ru['search.found'], { count: 5 }))).toBeTruthy();
  });

  it('не открывает список для запроса из одного символа', async () => {
    const { store } = makeStore({ catalogIndex: searchCatalog() });

    render(<Toolbar store={store} />);

    const input = screen.getByRole('combobox', { name: ru['search.label'] });

    fireEvent.change(input, { target: { value: 't' } });
    await waitForSearch();

    expect(screen.queryByRole('listbox')).toBeNull();
    expect(screen.getByText(formatMessage(ru['search.found'], { count: 0 }))).toBeTruthy();
  });

  it('по Enter выбирает первый вариант и не меняет строки таблицы', async () => {
    const { store } = makeStore({
      catalogIndex: searchCatalog(),
      rows: [row('trappist-1-e')],
    });

    const rowsBefore = store.getState().rows;

    render(<Toolbar store={store} />);

    const input = screen.getByRole('combobox', { name: ru['search.label'] });

    fireEvent.change(input, { target: { value: 'kepler442' } });
    await waitForSearch();

    fireEvent.keyDown(input, { key: 'Enter' });

    expect(store.getState().selectedPlanetId).toBe('kepler-442-b');
    expect(store.getState().rows).toBe(rowsBefore);
  });

  it('Esc закрывает список, повторный Esc очищает поле', async () => {
    const { store } = makeStore({ catalogIndex: searchCatalog() });

    render(<Toolbar store={store} />);

    const input = screen.getByRole('combobox', { name: ru['search.label'] }) as HTMLInputElement;

    fireEvent.change(input, { target: { value: 'trappist1' } });
    await waitForSearch();

    expect(screen.getByRole('listbox')).toBeTruthy();

    fireEvent.keyDown(input, { key: 'Escape' });

    expect(screen.queryByRole('listbox')).toBeNull();
    expect(input.value).toBe('trappist1');

    fireEvent.keyDown(input, { key: 'Escape' });

    expect(input.value).toBe('');
    expect(store.getState().filters.search).toBe('');
  });

  it('селектор возвращает идентификаторы всех совпадений в порядке подсказок', () => {
    const { store } = makeStore({ catalogIndex: searchCatalog() });

    store.getState().setSearch('trappist1');

    expect(selectSearchMatchIds(store.getState())).toEqual([
      'trappist-1-b',
      'trappist-1-c',
      'trappist-1-d',
      'trappist-1-e',
      'k2-18-b',
    ]);
  });
});

describe('пересчёт от фильтров и настроек', () => {
  it('setSearch не запускает compute', async () => {
    const { store, compute } = makeStore();

    store.getState().setSearch('kepler');

    await flushMicrotasks();

    expect(compute).toHaveBeenCalledTimes(0);
    expect(store.getState().filters.search).toBe('kepler');
  });

  it('setFilters с изменением только поиска или «Земли (эталона)» не пересчитывает', async () => {
    const { store, compute } = makeStore();

    store.getState().setFilters({ search: 'kepler' });
    store.getState().setFilters({ earthReference: true });

    await flushMicrotasks();

    expect(compute).toHaveBeenCalledTimes(0);
  });

  it('изменение спектральных классов запускает пересчёт', async () => {
    const { store, compute } = makeStore();

    store.getState().setFilters({ spectralClasses: ['G'] });

    await flushMicrotasks();

    expect(compute).toHaveBeenCalledTimes(1);
  });

  it('applySettings с тремя изменёнными полями запускает ровно один compute', async () => {
    const { store, compute } = makeStore();

    store.getState().applySettings({
      hzBounds: 'optimistic',
      penalties: { rocky: false, ecc: false, star: true, qdata: true },
      qMin: 0.9,
    });

    await flushMicrotasks();

    expect(compute).toHaveBeenCalledTimes(1);
    expect(store.getState().settings.hzBounds).toBe('optimistic');
    expect(store.getState().settings.penalties.rocky).toBe(false);
    expect(store.getState().settings.qMin).toBe(0.9);
  });

  it('resetSettings восстанавливает умолчания и сохраняет режим, resetFilters сохраняет поиск', () => {
    const filters: FilterState = {
      ...DEFAULT_FILTERS,
      search: 'kepler',
      spectralClasses: ['G'],
      radius: { min: 1, max: 2 },
    };

    const { store } = makeStore({
      settings: {
        mode: 'rhi',
        hzBounds: 'optimistic',
        penalties: { rocky: false, ecc: false, star: false, qdata: false },
        qMin: 0.9,
      },
      filters,
    });

    store.getState().resetSettings();

    expect(store.getState().settings.mode).toBe('rhi');
    expect(store.getState().settings.hzBounds).toBe(DEFAULT_SETTINGS.hzBounds);
    expect(store.getState().settings.penalties).toEqual(DEFAULT_SETTINGS.penalties);
    expect(store.getState().settings.qMin).toBe(DEFAULT_SETTINGS.qMin);

    store.getState().resetFilters();

    expect(store.getState().filters.search).toBe('kepler');
    expect(store.getState().filters.spectralClasses).toEqual([]);
    expect(store.getState().filters.radius).toEqual({ min: null, max: null });
    expect(store.getState().filters.includeCandidates).toBe(false);
  });
});

describe('панель «Параметры модели»', () => {
  it('«Применить» недоступна без изменений и вызывает один пересчёт при трёх правках', async () => {
    const { store, compute } = makeStore();

    render(<Toolbar store={store} />);
    openPanel();

    const panel = paramsPanel();
    const apply = within(panel).getByRole('button', {
      name: ru['params.apply'],
    }) as HTMLButtonElement;

    expect(apply.disabled).toBe(true);

    fireEvent.click(within(panel).getByRole('radio', { name: ru['params.hz.optimistic'] }));
    fireEvent.click(within(panel).getByRole('checkbox', { name: ru['params.ecc'] }));
    fireEvent.click(within(panel).getByRole('checkbox', { name: ru['params.qdata'] }));

    fireEvent.change(within(panel).getByRole('slider', { name: ru['params.qMin'] }), {
      target: { value: '90' },
    });

    expect(apply.disabled).toBe(false);
    expect(compute).toHaveBeenCalledTimes(0);

    await act(async () => {
      fireEvent.click(apply);
    });

    expect(compute).toHaveBeenCalledTimes(1);
    expect(store.getState().settings.hzBounds).toBe('optimistic');
    expect(store.getState().settings.penalties.ecc).toBe(false);
    expect(store.getState().settings.penalties.qdata).toBe(false);
    expect(store.getState().settings.qMin).toBe(0.9);
    expect(screen.queryByRole('complementary')).toBeNull();
  });

  it('закрытие без применения отбрасывает черновик, повторное открытие показывает текущие значения', () => {
    const { store } = makeStore();

    render(<Toolbar store={store} />);
    openPanel();

    const qdata = within(paramsPanel()).getByRole('checkbox', {
      name: ru['params.qdata'],
    }) as HTMLInputElement;

    fireEvent.click(qdata);
    expect(qdata.checked).toBe(false);

    fireEvent.mouseDown(document.body);

    expect(screen.queryByRole('complementary')).toBeNull();
    expect(store.getState().settings.penalties.qdata).toBe(true);

    openPanel();

    const reopened = within(paramsPanel()).getByRole('checkbox', {
      name: ru['params.qdata'],
    }) as HTMLInputElement;

    expect(reopened.checked).toBe(true);
  });

  it('«Сбросить настройки» в панели синхронизирует черновик и не меняет режим', () => {
    const { store } = makeStore({
      settings: {
        mode: 'rhi',
        hzBounds: 'optimistic',
        penalties: { rocky: false, ecc: false, star: false, qdata: false },
        qMin: 0.9,
      },
    });

    render(<Toolbar store={store} />);
    openPanel();

    fireEvent.click(within(paramsPanel()).getByRole('button', { name: ru['params.reset'] }));

    expect(store.getState().settings.mode).toBe('rhi');
    expect(store.getState().settings.hzBounds).toBe('conservative');
    expect(store.getState().settings.qMin).toBe(0.75);
    expect(store.getState().settings.penalties).toEqual(DEFAULT_SETTINGS.penalties);

    const qdata = within(paramsPanel()).getByRole('checkbox', {
      name: ru['params.qdata'],
    }) as HTMLInputElement;

    expect(qdata.checked).toBe(true);
  });

  it('в classic_esi штрафы и границы HZ отключены, ползунок Q_data доступен', () => {
    const { store } = makeStore({ settings: settingsWithMode('classic_esi') });

    render(<Toolbar store={store} />);
    openPanel();

    const panel = paramsPanel();
    const checkboxes = within(panel).getAllByRole('checkbox') as HTMLInputElement[];
    const radios = within(panel).getAllByRole('radio') as HTMLButtonElement[];

    expect(checkboxes).toHaveLength(4);
    expect(checkboxes.every((box) => box.disabled)).toBe(true);
    expect(radios.every((radio) => radio.disabled)).toBe(true);
    expect(
      (within(panel).getByRole('slider', { name: ru['params.qMin'] }) as HTMLInputElement).disabled,
    ).toBe(false);
    expect(within(panel).getByText(ru['params.disabledPenalties'])).toBeTruthy();
    expect(within(panel).getByText(ru['params.disabledHz'])).toBeTruthy();
  });

  it('в strict штрафы отключены, границы HZ доступны', () => {
    const { store } = makeStore({ settings: settingsWithMode('strict') });

    render(<Toolbar store={store} />);
    openPanel();

    const panel = paramsPanel();
    const checkboxes = within(panel).getAllByRole('checkbox') as HTMLInputElement[];
    const radios = within(panel).getAllByRole('radio') as HTMLButtonElement[];

    expect(checkboxes.every((box) => box.disabled)).toBe(true);
    expect(radios.every((radio) => !radio.disabled)).toBe(true);
    expect(within(panel).getByText(ru['params.disabledPenalties'])).toBeTruthy();
    expect(within(panel).queryByText(ru['params.disabledHz'])).toBeNull();
  });

  it('в rhi доступны и штрафы, и границы HZ', () => {
    const { store } = makeStore({ settings: settingsWithMode('rhi') });

    render(<Toolbar store={store} />);
    openPanel();

    const panel = paramsPanel();
    const checkboxes = within(panel).getAllByRole('checkbox') as HTMLInputElement[];
    const radios = within(panel).getAllByRole('radio') as HTMLButtonElement[];

    expect(checkboxes.every((box) => !box.disabled)).toBe(true);
    expect(radios.every((radio) => !radio.disabled)).toBe(true);
    expect(within(panel).queryByText(ru['params.disabledPenalties'])).toBeNull();
  });

  it('бейдж Q_data виден при поднятом пороге или включённых служебных данных', () => {
    const active = makeStore({ settings: { ...DEFAULT_SETTINGS, qMin: 0.9 } });
    const hidden = makeStore();
    const extra = makeStore({ showExtraData: true });

    const first = render(<Toolbar store={active.store} />);

    expect(screen.getByText(formatMessage(ru['params.badgeQ'], { value: 90 }))).toBeTruthy();

    first.unmount();
    render(<Toolbar store={hidden.store} />);

    expect(screen.queryByText(formatMessage(ru['params.badgeQ'], { value: 75 }))).toBeNull();

    cleanup();
    render(<Toolbar store={extra.store} />);

    expect(screen.getByText(formatMessage(ru['params.badgeQ'], { value: 75 }))).toBeTruthy();
  });
});
