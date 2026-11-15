import {
  CALC_MODE_PRESETS,
  type ErrorLogEntry,
  type RankingCounters,
  type ScoreBreakdown,
  type StatusResponse,
} from '@exo/shared';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ApiClient } from '../../api/client';
import { formatMessage, ru } from '../../i18n/ru';
import { createAppStore, type AppState, type AppStore, type CatalogEntry } from '../../state/store';
import type { ComputeBackend } from '../../workers/computeBackend';
import type { RankedRowView } from '../../workers/protocol';
import { TopTable } from './TopTable';

/**
 * Тесты таблицы Топ-50 (задача 16; п. 10.5.6, 10.5.7, 10.4, 11.2).
 *
 * Проверяются: состав колонок по умолчанию и при служебных данных,
 * трёхшаговая сортировка, сброс скрытой сортировки, открытие карточки,
 * «Приблизить», выбранная планета вне Топ-50, пустые состояния, значок
 * недостатка данных, подсветка поиска и префиксы расчётных значений.
 */

afterEach(() => {
  cleanup();
  sessionStorage.clear();
});

/** Счётчики выборки. */
function counters(matching = 3): RankingCounters {
  return { total: 10, computed: 8, strictMeasured: 5, matching };
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

/** Разложение балла с предсказуемыми значениями. */
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

/** Строка таблицы с полным набором полей. */
function row(planetId: string, overrides: Partial<RankedRowView> = {}): RankedRowView {
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
    ...overrides,
  };
}

/** Изолированное хранилище; пересчёт возвращает текущие строки. */
function makeStore(overrides: Partial<AppState> = {}): {
  store: AppStore;
  compute: ReturnType<typeof vi.fn<ComputeBackend['compute']>>;
} {
  const compute = vi.fn<ComputeBackend['compute']>(async () => {
    const current = store.getState();

    return { rows: current.rows, counters: current.counters ?? counters(0) };
  });

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
  store.setState({ phase: 'ready', showExtraData: false, counters: counters(), ...overrides });

  return { store, compute };
}

/** Заголовок колонки по тексту подписи. */
function header(pattern: RegExp): HTMLElement {
  return screen.getByRole('columnheader', { name: pattern });
}

/** Кнопка сортировки внутри заголовка. */
function sortButton(pattern: RegExp): HTMLElement {
  return within(header(pattern)).getByRole('button');
}

/** Строка таблицы по имени планеты. */
function planetRow(name: string): HTMLTableRowElement {
  const cell = screen.getByText(name, { selector: '.top-table__planet-name' });
  const rowElement = cell.closest('tr');

  if (rowElement === null) throw new Error('строка таблицы не найдена');

  return rowElement;
}

describe('колонки таблицы', () => {
  it('по умолчанию показывает №, «Планета», «Индекс», R, M, T_s, e, «Кл.», d [пк] и не показывает Δ, Q_data, «N ист.», «эксп.»', () => {
    const { store } = makeStore({ rows: [row('a')] });

    render(<TopTable store={store} />);

    expect(header(/№/)).toBeTruthy();
    expect(header(/Планета/)).toBeTruthy();
    expect(header(/Индекс/)).toBeTruthy();
    expect(header(/R \[R⊕\]/)).toBeTruthy();
    expect(header(/M \[M⊕\]/)).toBeTruthy();
    expect(header(/T_s \[K\]/)).toBeTruthy();
    expect(header(/^e\b/)).toBeTruthy();
    expect(header(/Кл\./)).toBeTruthy();
    expect(header(/d \[пк\]/)).toBeTruthy();

    expect(screen.queryByText('Q_data')).toBeNull();
    expect(screen.queryByText('Δ')).toBeNull();
    expect(screen.queryByText(/ист\./)).toBeNull();
    expect(screen.queryByText('эксп.')).toBeNull();

    // Точки подключения подсказок задачи 17: заголовки и значения.
    expect(header(/№/).getAttribute('data-help-key')).toBe('col.rank');
    expect(header(/d \[пк\]/).getAttribute('data-help-key')).toBe('col.dist_pc');
    expect(planetRow('Планета a').querySelector('[data-help-key="val.R"]')).toBeTruthy();
    expect(planetRow('Планета a').querySelector('[data-help-key="val.T_s"]')).toBeTruthy();
  });

  it('со служебными данными добавляет Δ, Q_data, «N ист.» и «эксп.» без перезагрузки', () => {
    const { store } = makeStore({ rows: [row('a')] });

    render(<TopTable store={store} />);

    act(() => {
      store.getState().setShowExtraData(true);
    });

    expect(screen.getByText('Q_data')).toBeTruthy();
    expect(screen.getByText('Δ')).toBeTruthy();
    expect(screen.getByText(/3 ист\./)).toBeTruthy();
    expect(screen.getByText('эксп.')).toBeTruthy();
    expect(screen.getByText('Высокая 96%')).toBeTruthy();
    expect(document.querySelector('[data-help-key="val.Q_data"]')).toBeTruthy();
    expect(document.querySelector('[data-help-key="badge.q.high"]')).toBeTruthy();
    expect(document.querySelector('[data-help-key="tag.exo"]')).toBeTruthy();
  });

  it('сравнение с упрощённым ESI включает Δ без служебных данных', () => {
    const { store } = makeStore({ rows: [row('a')] });

    render(<TopTable store={store} />);

    act(() => {
      store.getState().setCompareClassic(true);
    });

    expect(screen.getByText('Δ')).toBeTruthy();
    expect(screen.queryByText('Q_data')).toBeNull();
  });

  it('в режиме classic_esi рядом с Δ объясняет совпадение с эталоном', () => {
    const { store } = makeStore({
      rows: [row('a')],
      compareClassic: true,
      settings: { ...storeSettings(), mode: 'classic_esi' },
    });

    render(<TopTable store={store} />);

    expect(screen.getByText(ru['table.compareClassicNote'])).toBeTruthy();
  });

  it('заголовок расстояния — d [пк], а не «нс»', () => {
    const { store } = makeStore({ rows: [row('a')] });

    render(<TopTable store={store} />);

    expect(header(/d \[пк\]/).textContent).toContain('d [пк]');
    expect(header(/d \[пк\]/).textContent).not.toContain('нс');
  });
});

/** Настройки модели по умолчанию для одного поля режима. */
function storeSettings(): AppState['settings'] {
  return {
    mode: 'adaptive',
    hzBounds: 'conservative',
    penalties: { rocky: true, ecc: true, star: true, qdata: true },
    qMin: 0.75,
  };
}

describe('сортировка', () => {
  it('по R: три клика — asc, desc и возврат к rank asc; aria-sort меняется', async () => {
    const { store } = makeStore({
      rows: [row('a', { rank: 1, R: 1.1 }), row('b', { rank: 2, R: 2.2 })],
    });

    render(<TopTable store={store} />);

    expect(header(/R \[R⊕\]/).getAttribute('aria-sort')).toBe('none');

    await act(async () => {
      fireEvent.click(sortButton(/R \[R⊕\]/));
    });

    expect(store.getState().sort).toEqual({ column: 'R', dir: 'asc' });
    expect(header(/R \[R⊕\]/).getAttribute('aria-sort')).toBe('ascending');

    await act(async () => {
      fireEvent.click(sortButton(/R \[R⊕\]/));
    });

    expect(store.getState().sort).toEqual({ column: 'R', dir: 'desc' });
    expect(header(/R \[R⊕\]/).getAttribute('aria-sort')).toBe('descending');

    await act(async () => {
      fireEvent.click(sortButton(/R \[R⊕\]/));
    });

    expect(store.getState().sort).toEqual({ column: 'rank', dir: 'asc' });
    expect(header(/R \[R⊕\]/).getAttribute('aria-sort')).toBe('none');
    expect(header(/№/).getAttribute('aria-sort')).toBe('ascending');
  });

  it('выключение служебных данных при сортировке по Q_data сбрасывает сортировку на rank asc', async () => {
    const { store } = makeStore({ rows: [row('a')], showExtraData: true });

    render(<TopTable store={store} />);

    await act(async () => {
      fireEvent.click(sortButton(/Q_data/));
    });

    expect(store.getState().sort).toEqual({ column: 'Q_data', dir: 'asc' });

    await act(async () => {
      store.getState().setShowExtraData(false);
    });

    expect(store.getState().sort).toEqual({ column: 'rank', dir: 'asc' });
    expect(screen.queryByText('Q_data')).toBeNull();
  });
});

describe('строка таблицы', () => {
  it('клик по строке открывает карточку и помечает строку выбранной', () => {
    const { store } = makeStore({ rows: [row('a', { name: 'Планета A' })] });

    render(<TopTable store={store} />);

    const tr = planetRow('Планета A');

    expect(tr.getAttribute('tabindex')).toBe('0');

    fireEvent.click(tr);

    expect(store.getState().selectedPlanetId).toBe('a');
    expect(store.getState().planetCardOpen).toBe(true);
    expect(planetRow('Планета A').getAttribute('aria-selected')).toBe('true');
  });

  it('Enter на сфокусированной строке открывает карточку', () => {
    const { store } = makeStore({ rows: [row('a', { name: 'Планета A' })] });

    render(<TopTable store={store} />);

    fireEvent.keyDown(planetRow('Планета A'), { key: 'Enter' });

    expect(store.getState().selectedPlanetId).toBe('a');
    expect(store.getState().planetCardOpen).toBe(true);
  });

  it('«Приблизить» выбирает планету, запрашивает перелёт и не открывает карточку', () => {
    const { store } = makeStore({ rows: [row('a', { name: 'Планета A' })] });

    render(<TopTable store={store} />);

    fireEvent.click(within(planetRow('Планета A')).getByRole('button', { name: ru['table.fly'] }));

    expect(store.getState().selectedPlanetId).toBe('a');
    expect(store.getState().flyRequest).toEqual({ planetId: 'a', target: 'planet', seq: 1 });
    expect(store.getState().planetCardOpen).toBe(false);
  });

  it('строка с insufficient показывает значок «Недостаточно данных»', () => {
    const { store } = makeStore({
      rows: [
        row('a', {
          insufficient: true,
          score: score({ index: 0, insufficient_data: true }),
        }),
      ],
    });

    render(<TopTable store={store} />);

    expect(screen.getByText(ru['table.insufficient'])).toBeTruthy();
    expect(screen.getByText('0.0%')).toBeTruthy();
  });

  it('совпадение поиска помечает строку data-search-match', () => {
    const catalogIndex: Record<string, CatalogEntry> = {
      'trappist-1-e': { name: 'TRAPPIST-1 e', hostname: 'TRAPPIST-1' },
    };
    const { store } = makeStore({
      rows: [row('trappist-1-e', { name: 'TRAPPIST-1 e', hostname: 'TRAPPIST-1' })],
      catalogIndex,
    });

    render(<TopTable store={store} />);

    act(() => {
      store.getState().setSearch('trappist1');
    });

    expect(planetRow('TRAPPIST-1 e').getAttribute('data-search-match')).toBe('true');
  });

  it('расчётные R и e помечены ~, измеренная масса — нет', () => {
    const { store } = makeStore({
      rows: [
        row('a', {
          R: 2.03,
          M: 1,
          e: 0.05,
          provenance: { R: 'model', M: 'measured', e: 'estimate' },
        }),
      ],
    });

    render(<TopTable store={store} />);

    expect(screen.getByText('~2.03')).toBeTruthy();
    expect(screen.getByText('1.00')).toBeTruthy();
    expect(screen.getByText('~0.05')).toBeTruthy();
  });
});

describe('выбранная планета вне Топ-50', () => {
  it('показывает уведомление и открывает карточку кнопкой', () => {
    const catalogIndex: Record<string, CatalogEntry> = {
      'kepler-442-b': { name: 'Kepler-442 b', hostname: 'Kepler-442' },
    };
    const { store } = makeStore({
      rows: [row('a')],
      selectedPlanetId: 'kepler-442-b',
      catalogIndex,
    });

    render(<TopTable store={store} />);

    expect(
      screen.getByText(formatMessage(ru['table.outsideTop'], { name: 'Kepler-442 b' })),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: ru['table.openCard'] }));

    expect(store.getState().planetCardOpen).toBe(true);
  });
});

describe('пустые состояния', () => {
  it('при нуле подходящих планет предлагает сбросить фильтры и настройки', () => {
    const { store } = makeStore({ rows: [], counters: counters(0) });

    render(<TopTable store={store} />);

    expect(screen.getByText(ru['table.empty.noMatch'])).toBeTruthy();
    expect(screen.getByRole('button', { name: ru['toolbar.resetFilters'] })).toBeTruthy();
    expect(screen.getByRole('button', { name: ru['toolbar.resetSettings'] })).toBeTruthy();
  });

  it('при отсутствии данных в режиме называет режим и предлагает выбрать другой', () => {
    const { store } = makeStore({ rows: [], counters: counters(5) });

    render(<TopTable store={store} />);

    expect(
      screen.getByText(
        formatMessage(ru['table.empty.noData'], {
          mode: CALC_MODE_PRESETS.adaptive.label,
        }),
      ),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: ru['table.empty.chooseMode'] })).toBeTruthy();
  });

  it('«Выбрать другой режим» переводит фокус на переключатель режимов', () => {
    const { store } = makeStore({ rows: [], counters: counters(5) });

    render(<TopTable store={store} />);

    const group = document.createElement('div');
    const modeButton = document.createElement('button');

    group.className = 'header__modes';
    modeButton.setAttribute('role', 'radio');
    modeButton.setAttribute('aria-checked', 'true');
    group.append(modeButton);
    document.body.append(group);

    fireEvent.click(screen.getByRole('button', { name: ru['table.empty.chooseMode'] }));

    expect(document.activeElement).toBe(modeButton);

    group.remove();
  });
});
