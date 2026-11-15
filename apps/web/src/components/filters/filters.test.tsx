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
import { selectActiveFilterCount } from '../../state/selectors';
import { createAppStore, type AppState, type AppStore } from '../../state/store';
import type { ComputeBackend } from '../../workers/computeBackend';
import type { ComputeResult } from '../../workers/protocol';
import { Toolbar } from '../toolbar/Toolbar';
import {
  draftFromFilters,
  validateDraft,
  type FilterDraft,
  type RangeDraft,
} from './filterValidation';

/**
 * Тесты панели фильтров и «Земли (эталона)» (задача 15; п. 10.5, 13.3).
 *
 * Проверяются: разбор и валидация текстовых границ, черновик с одним
 * пересчётом на «Применить фильтры», бейдж активных групп, пустое состояние,
 * живой переключатель эталона и диагностический блок калибровки.
 */

afterEach(cleanup);

/** Счётчики-маркер. */
function counters(total = 10, matching = total): RankingCounters {
  return { total, computed: total, strictMeasured: total, matching };
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

/** Кнопка «Фильтры» на панели инструментов (с бейджем или без). */
function filtersButton(): HTMLElement {
  return screen.getByRole('button', { name: /^Фильтры/ });
}

/** Открывает панель фильтров. */
function openFilters(): void {
  fireEvent.click(filtersButton());
}

/** Открытая панель фильтров. */
function filtersPanel(): HTMLElement {
  return screen.getByRole('complementary', { name: ru['filters.title'] });
}

/** Поле диапазона по подписи группы и границе. */
function rangeInput(label: string, bound: 'min' | 'max'): HTMLInputElement {
  return within(filtersPanel()).getByLabelText(
    `${label}, ${ru[bound === 'min' ? 'filters.min' : 'filters.max']}`,
  ) as HTMLInputElement;
}

/** Кнопка «Применить фильтры». */
function applyButton(): HTMLButtonElement {
  return within(filtersPanel()).getByRole('button', {
    name: ru['filters.apply'],
  }) as HTMLButtonElement;
}

/** Черновик с заданным диапазоном. */
function draftWith(
  key: 'radius' | 'T_s' | 'e',
  range: Partial<Record<'min' | 'max', string>>,
): FilterDraft {
  const base = draftFromFilters(DEFAULT_FILTERS);
  const current: RangeDraft = base[key];

  return {
    ...base,
    [key]: { ...current, ...range },
  };
}

/** Фильтры с двумя ограничениями из разных групп. */
function twoGroups(): FilterState {
  return {
    ...DEFAULT_FILTERS,
    radius: { min: 1, max: null },
    T_s: { min: null, max: 500 },
  };
}

describe('валидация диапазонов', () => {
  it('принимает запятую как десятичный разделитель', () => {
    const result = validateDraft(draftWith('radius', { min: '1,5' }));

    expect(result.valid).toBe(true);
    expect(result.values.radius.min).toBe(1.5);
    expect(result.errors.radius.min).toBeNull();
  });

  it('пустые поля означают отсутствие ограничения', () => {
    const result = validateDraft(draftFromFilters(DEFAULT_FILTERS));

    expect(result.valid).toBe(true);
    expect(result.values.radius).toEqual({ min: null, max: null });
    expect(result.values.T_s).toEqual({ min: null, max: null });
    expect(result.values.e).toEqual({ min: null, max: null });
  });

  it('не число и отрицательный радиус дают разные ошибки', () => {
    expect(validateDraft(draftWith('radius', { min: 'abc' })).errors.radius.min).toBe('notNumber');
    expect(validateDraft(draftWith('radius', { max: '-1' })).errors.radius.max).toBe('negative');
    expect(validateDraft(draftWith('T_s', { min: '-5' })).errors.T_s.min).toBe('negative');
  });

  it('эксцентриситет вне 0…1 отклоняется', () => {
    const result = validateDraft(draftWith('e', { max: '1,2' }));

    expect(result.valid).toBe(false);
    expect(result.errors.e.max).toBe('eccentricity');
  });

  it('минимум больше максимума — общая ошибка диапазона', () => {
    const result = validateDraft(draftWith('radius', { min: '5', max: '3' }));

    expect(result.valid).toBe(false);
    expect(result.errors.radius.range).toBe('minAboveMax');
    expect(result.errors.radius.min).toBeNull();
    expect(result.errors.radius.max).toBeNull();
  });
});

describe('применение и бейдж', () => {
  it('«Применить фильтры» недоступна без изменений, при ошибке и вызывает один compute', async () => {
    const { store, compute } = makeStore();

    render(<Toolbar store={store} />);
    openFilters();

    expect(applyButton().disabled).toBe(true);

    fireEvent.change(rangeInput(ru['filters.radius'], 'min'), { target: { value: '1.5' } });
    fireEvent.change(rangeInput(ru['filters.tSurface'], 'max'), { target: { value: '330' } });

    expect(applyButton().disabled).toBe(false);
    expect(compute).toHaveBeenCalledTimes(0);

    await act(async () => {
      fireEvent.click(applyButton());
    });

    expect(compute).toHaveBeenCalledTimes(1);
    expect(store.getState().filters.radius).toEqual({ min: 1.5, max: null });
    expect(store.getState().filters.T_s).toEqual({ min: null, max: 330 });
    expect(screen.queryByRole('complementary')).toBeNull();
  });

  it('ошибка в поле блокирует применение и показывается под полем', () => {
    const { store, compute } = makeStore();

    render(<Toolbar store={store} />);
    openFilters();

    fireEvent.change(rangeInput(ru['filters.radius'], 'min'), { target: { value: 'abc' } });

    expect(within(filtersPanel()).getByText(ru['filters.error.notNumber'])).toBeTruthy();
    expect(applyButton().disabled).toBe(true);
    expect(compute).toHaveBeenCalledTimes(0);
  });

  it('закрытие без применения отбрасывает черновик', () => {
    const { store, compute } = makeStore();

    render(<Toolbar store={store} />);
    openFilters();

    fireEvent.change(rangeInput(ru['filters.radius'], 'min'), { target: { value: '2' } });
    fireEvent.mouseDown(document.body);

    expect(store.getState().filters.radius).toEqual({ min: null, max: null });
    expect(compute).toHaveBeenCalledTimes(0);

    openFilters();

    expect(rangeInput(ru['filters.radius'], 'min').value).toBe('');
  });

  it('бейдж показывает число активных групп', () => {
    const { store } = makeStore({ filters: twoGroups() });

    render(<Toolbar store={store} />);

    const button = filtersButton();

    expect(within(button).getByText('2')).toBeTruthy();
    expect(selectActiveFilterCount(store.getState())).toBe(2);
  });

  it('без ограничений бейджа нет, «Земля (эталон)» в счёт групп не входит', () => {
    const { store } = makeStore({ filters: { ...DEFAULT_FILTERS, earthReference: true } });

    render(<Toolbar store={store} />);

    expect(within(filtersButton()).queryByText('0')).toBeNull();
    expect(selectActiveFilterCount(store.getState())).toBe(0);
  });
});

describe('пустое состояние', () => {
  it('при counters.matching = 0 показывает сообщение и кнопку сброса', () => {
    const { store } = makeStore({
      filters: twoGroups(),
      counters: counters(10, 0),
    });

    render(<Toolbar store={store} />);
    openFilters();

    expect(within(filtersPanel()).getByText(ru['filters.empty'])).toBeTruthy();

    const reset = within(filtersPanel()).getByRole('button', {
      name: ru['toolbar.resetFilters'],
    });

    fireEvent.click(reset);

    expect(store.getState().filters.spectralClasses).toEqual([]);
    expect(store.getState().filters.radius).toEqual({ min: null, max: null });
    expect(store.getState().filters.T_s).toEqual({ min: null, max: null });
  });

  it('счётчик подходящих планет виден всегда', () => {
    const { store } = makeStore({ counters: counters(20, 7) });

    render(<Toolbar store={store} />);
    openFilters();

    expect(
      within(filtersPanel()).getByText(
        formatMessage(ru['filters.matching'], { matching: 7, total: 20 }),
      ),
    ).toBeTruthy();
  });
});

describe('спектральные классы', () => {
  it('кнопки идут в порядке M K G F A B O и переключаются с клавиатуры', () => {
    const { store } = makeStore();

    render(<Toolbar store={store} />);
    openFilters();

    const group = within(filtersPanel()).getByRole('group', {
      name: ru['filters.spectralClass'],
    });
    const buttons = within(group).getAllByRole('button') as HTMLButtonElement[];

    expect(buttons.map((button) => button.textContent)).toEqual([
      'M',
      'K',
      'G',
      'F',
      'A',
      'B',
      'O',
    ]);
    expect(buttons.every((button) => button.tagName === 'BUTTON')).toBe(true);
    expect(buttons.every((button) => button.getAttribute('aria-pressed') === 'false')).toBe(true);

    const mClass = buttons[0];

    if (mClass === undefined) throw new Error('нет кнопки M');

    mClass.focus();
    fireEvent.keyDown(mClass, { key: 'Enter' });

    expect(mClass.getAttribute('aria-pressed')).toBe('true');
    expect(selectActiveFilterCount(store.getState())).toBe(0);

    fireEvent.keyDown(mClass, { key: ' ' });

    expect(mClass.getAttribute('aria-pressed')).toBe('false');
  });

  it('выбор классов применяется вместе с диапазонами одним пересчётом', async () => {
    const { store, compute } = makeStore();

    render(<Toolbar store={store} />);
    openFilters();

    fireEvent.click(
      within(filtersPanel()).getByRole('button', {
        name: 'G',
      }),
    );
    fireEvent.change(rangeInput(ru['filters.e'], 'max'), { target: { value: '0.5' } });

    expect(applyButton().disabled).toBe(false);

    await act(async () => {
      fireEvent.click(applyButton());
    });

    expect(compute).toHaveBeenCalledTimes(1);
    expect(store.getState().filters.spectralClasses).toEqual(['G']);
    expect(store.getState().filters.e).toEqual({ min: null, max: 0.5 });
  });
});

describe('«Земля (эталон)»', () => {
  it('переключатель меняет filters сразу и не запускает compute', async () => {
    const { store, compute } = makeStore();

    render(<Toolbar store={store} />);
    openFilters();

    const toggle = within(filtersPanel()).getByRole('checkbox', {
      name: ru['filters.earth'],
    });

    fireEvent.click(toggle);

    await flushMicrotasks();

    expect(store.getState().filters.earthReference).toBe(true);
    expect(compute).toHaveBeenCalledTimes(0);
  });

  it('при консервативных границах показывает 0.25 и пояснение про 0.74', () => {
    const { store } = makeStore({
      settings: { ...DEFAULT_SETTINGS, hzBounds: 'conservative' },
      filters: { ...DEFAULT_FILTERS, earthReference: true },
    });

    render(<Toolbar store={store} />);
    openFilters();

    const panel = filtersPanel();

    expect(
      within(panel).getByText(
        formatMessage(ru['filters.earth.fHz'], {
          value: '0.25',
        }),
      ),
    ).toBeTruthy();
    expect(within(panel).getByText(ru['filters.earth.optimisticNote'])).toBeTruthy();
    expect(within(panel).getByText(ru['filters.earth.reference'])).toBeTruthy();
    expect(
      within(panel).getByText(
        formatMessage(ru['filters.earth.share'], {
          share: '100.0',
        }),
      ),
    ).toBeTruthy();
    expect(
      within(panel).getByText(
        formatMessage(ru['filters.earth.level'], {
          level: ru['filters.calibration.high'],
        }),
      ),
    ).toBeTruthy();
  });

  it('при оптимистичных границах показывает 0.74 без пояснения', () => {
    const { store } = makeStore({
      settings: { ...DEFAULT_SETTINGS, hzBounds: 'optimistic' },
      filters: { ...DEFAULT_FILTERS, earthReference: true },
    });

    render(<Toolbar store={store} />);
    openFilters();

    const panel = filtersPanel();

    expect(
      within(panel).getByText(formatMessage(ru['filters.earth.fHz'], { value: '0.74' })),
    ).toBeTruthy();
    expect(within(panel).queryByText(ru['filters.earth.optimisticNote'])).toBeNull();
  });
});
