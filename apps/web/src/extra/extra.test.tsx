import {
  DEFAULT_SETTINGS,
  type ErrorLogEntry,
  type RankingCounters,
  type ScoreBreakdown,
  type SourceId,
  type SourceStatus,
  type StatusResponse,
} from '@exo/shared';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ApiClient } from '../api/client';
import { TooltipProvider } from '../help/TooltipProvider';
import { formatMessage, ru } from '../i18n/ru';
import { createAppStore, type AppState, type AppStore } from '../state/store';
import type { ComputeBackend } from '../workers/computeBackend';
import type { RankedRowView } from '../workers/protocol';
import { Header } from '../components/header/Header';
import { TopTable } from '../components/table/TopTable';
import { Toolbar } from '../components/toolbar/Toolbar';
import { ExtraOnly } from './ExtraOnly';
import { EXTRA_IDS, EXTRA_REGISTRY, isExtraId } from './registry';

/**
 * Тесты режима «Показать дополнительные данные» (задача 18; п. 11.2).
 *
 * Проверяются: выключенное состояние по умолчанию и полное отсутствие
 * служебных элементов в DOM, появление всех отрисованных записей реестра,
 * повторное скрытие, сохранение в sessionStorage и устойчивость к сбою
 * хранилища, сохранение выбора и сортировки, доступность бейджа активного
 * порога Q_data, уникальность реестра и совпадение с `docs/extra-data.md`.
 */

afterEach(() => {
  cleanup();
  sessionStorage.clear();
  vi.restoreAllMocks();
});

/** Счётчики выборки. */
function counters(matching = 1): RankingCounters {
  return { total: 10, computed: 8, strictMeasured: 5, matching };
}

/** Статус источника. */
function status(source: SourceId, state: SourceStatus['state']): SourceStatus {
  return { source, state, backupAt: null, message: null };
}

/** Все шесть источников обновлены. */
function allUpdated(): SourceStatus[] {
  return [
    status('gaia', 'updated'),
    status('exomast', 'updated'),
    status('nasa', 'updated'),
    status('exoplanet_eu', 'updated'),
    status('simbad', 'updated'),
    status('exomercat', 'updated'),
  ];
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
          sources: allUpdated(),
          hasSnapshot: true,
        }) as StatusResponse,
    ),
    getCatalog: vi.fn(async () => ({ notModified: true as const })),
    refresh: vi.fn(async () => 'started' as const),
    getErrors: vi.fn(async () => [] as ErrorLogEntry[]),
  };
}

/** Разложение балла с предсказуемыми значениями. */
function score(): ScoreBreakdown {
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
  };
}

/** Строка Топ-50. */
function row(planetId: string, overrides: Partial<RankedRowView> = {}): RankedRowView {
  return {
    rank: 1,
    rankClassic: 1,
    delta: 2,
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
function makeStore(overrides: Partial<AppState> = {}): AppStore {
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

  store.setState({
    phase: 'ready',
    showExtraData: false,
    rows: [row('a')],
    counters: counters(),
    sources: allUpdated(),
    snapshotId: 'snap-2026-11-14',
    builtAt: '2026-11-14T21:30:00',
    catalogIndex: { a: { name: 'Планета a', hostname: 'Звезда a' } },
    ...overrides,
  });

  return store;
}

/** Экран приложения, собранный из шапки, панели инструментов и таблицы. */
function Screen({ store }: { store: AppStore }): ReactElement {
  return (
    <TooltipProvider store={store}>
      <Header store={store} />
      <Toolbar store={store} />
      <TopTable store={store} />
    </TooltipProvider>
  );
}

/** Переключатель режима. */
function extraSwitch(): HTMLInputElement {
  return screen.getByRole('switch', {
    name: ru['extra.toggle'],
  }) as HTMLInputElement;
}

/** Открывает панель источников. */
function openSources(): void {
  const label = formatMessage(ru['header.sources'], { available: 5, total: 5 });

  fireEvent.click(screen.getByRole('button', { name: label }));
}

describe('режим по умолчанию', () => {
  it('переключатель выключен, в DOM нет ни одного элемента [data-extra]', () => {
    const store = makeStore();

    render(<Screen store={store} />);

    expect(extraSwitch().checked).toBe(false);
    expect(document.querySelectorAll('[data-extra]')).toHaveLength(0);
    expect(screen.queryByText('Q_data')).toBeNull();
    expect(screen.queryByText('Δ')).toBeNull();
    expect(screen.queryByText(/ист\./)).toBeNull();
    expect(screen.queryByText('эксп.')).toBeNull();
    expect(screen.queryByText(/Всего в базе/)).toBeNull();
    expect(screen.queryByRole('columnheader', { name: /Q_data/ })).toBeNull();

    openSources();
    expect(screen.queryByText(/Снимок:/)).toBeNull();
  });
});

describe('включение и выключение', () => {
  it('после включения в DOM присутствуют все отрисованные записи реестра', () => {
    const store = makeStore();

    render(<Screen store={store} />);

    act(() => {
      store.getState().setShowExtraData(true);
    });

    openSources();

    // scene.qdata добавляется в задаче 27, map.unplaced — на карте (задача 21),
    // card.* — в карточке планеты (задача 19); остальные записи уже отрисованы.
    const expected = EXTRA_IDS.filter(
      (id) => id !== 'scene.qdata' && id !== 'map.unplaced' && !id.startsWith('card.'),
    );

    for (const id of expected) {
      expect(document.querySelector(`[data-extra="${id}"]`), `нет data-extra="${id}"`).toBeTruthy();
    }

    expect(document.querySelector('[data-extra="scene.qdata"]')).toBeNull();
    expect(document.querySelector('[data-extra="map.unplaced"]')).toBeNull();
    expect(screen.getByText('Q_data')).toBeTruthy();
    expect(screen.getByText('Δ')).toBeTruthy();
    expect(screen.getByText(/3 ист\./)).toBeTruthy();
    expect(screen.getByText('эксп.')).toBeTruthy();
    expect(screen.getByText(/Всего в базе/)).toBeTruthy();
    expect(screen.getByText(/Снимок: snap-2026-11-14/)).toBeTruthy();
  });

  it('повторное выключение убирает элементы из DOM', () => {
    const store = makeStore();

    render(<Screen store={store} />);

    act(() => {
      store.getState().setShowExtraData(true);
    });

    expect(document.querySelectorAll('[data-extra]').length).toBeGreaterThan(0);

    act(() => {
      store.getState().setShowExtraData(false);
    });

    expect(document.querySelectorAll('[data-extra]')).toHaveLength(0);
    expect(screen.queryByText('Q_data')).toBeNull();
    expect(screen.queryByText('Δ')).toBeNull();
    expect(screen.queryByText('эксп.')).toBeNull();
    expect(screen.queryByText(/Всего в базе/)).toBeNull();
  });

  it('ExtraOnly помечает корневой элемент и не рендерит детей в скрытом состоянии', () => {
    const store = makeStore();

    render(
      <ExtraOnly id="table.delta" store={store}>
        <span>служебная метка</span>
      </ExtraOnly>,
    );

    expect(screen.queryByText('служебная метка')).toBeNull();

    act(() => {
      store.getState().setShowExtraData(true);
    });

    const label = screen.getByText('служебная метка');

    expect(label.getAttribute('data-extra')).toBe('table.delta');
  });
});

describe('сохранение состояния', () => {
  it('переживает перезагрузку компонента через sessionStorage', () => {
    const store = makeStore();

    const first = render(<Screen store={store} />);

    fireEvent.click(extraSwitch());

    expect(store.getState().showExtraData).toBe(true);
    expect(sessionStorage.getItem('exo.showExtraData')).toBe('true');

    first.unmount();

    // Новое хранилище символизирует перезагрузку страницы в рамках сессии.
    const reloaded = createAppStore({ api: mockApi() });

    expect(reloaded.getState().showExtraData).toBe(true);
  });

  it('сбой sessionStorage не ломает приложение: состояние держится в памяти', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('доступ к хранилищу запрещён');
    });

    const store = makeStore();

    render(<Screen store={store} />);

    fireEvent.click(extraSwitch());

    expect(store.getState().showExtraData).toBe(true);
    expect(screen.getByText(/Всего в базе/)).toBeTruthy();
  });
});

describe('влияние на выбор и сортировку', () => {
  it('выбранная планета и сортировка по R не меняются при переключении', () => {
    const store = makeStore({ selectedPlanetId: 'a' });

    render(<Screen store={store} />);

    act(() => {
      store.getState().setSort('R', 'desc');
    });

    expect(store.getState().sort).toEqual({ column: 'R', dir: 'desc' });

    act(() => {
      store.getState().setShowExtraData(true);
    });

    expect(store.getState().selectedPlanetId).toBe('a');
    expect(store.getState().sort).toEqual({ column: 'R', dir: 'desc' });

    act(() => {
      store.getState().setShowExtraData(false);
    });

    expect(store.getState().selectedPlanetId).toBe('a');
    expect(store.getState().sort).toEqual({ column: 'R', dir: 'desc' });
  });

  it('сортировка по Q_data при выключении сбрасывается на rank asc', () => {
    const store = makeStore();

    render(<Screen store={store} />);

    act(() => {
      store.getState().setShowExtraData(true);
    });

    act(() => {
      store.getState().setSort('Q_data', 'asc');
    });

    expect(store.getState().sort).toEqual({ column: 'Q_data', dir: 'asc' });

    act(() => {
      store.getState().setShowExtraData(false);
    });

    expect(store.getState().sort).toEqual({ column: 'rank', dir: 'asc' });
  });
});

describe('доступность', () => {
  it('скрытые элементы отсутствуют в DOM и потому недостижимы с клавиатуры', () => {
    const store = makeStore({ selectedPlanetId: 'a' });

    render(<Screen store={store} />);

    // Нет скрытых элементов — нет ни фокуса, ни доступного имени.
    expect(document.querySelectorAll('[data-extra]')).toHaveLength(0);
    expect(screen.queryByRole('columnheader', { name: /Q_data/ })).toBeNull();
    expect(screen.queryByText(ru['table.tag.exo'])).toBeNull();

    // Строки таблицы остаются фокусируемыми: скрыто только служебное.
    const tableRow = screen
      .getByText('Планета a', { selector: '.top-table__planet-name' })
      .closest('tr');

    expect(tableRow?.getAttribute('tabindex')).toBe('0');
  });

  it('переключатель — нативный input с role="switch" и видимой подписью', () => {
    const store = makeStore();

    render(<Screen store={store} />);

    const toggle = extraSwitch();

    expect(toggle.tagName).toBe('INPUT');
    expect(toggle.type).toBe('checkbox');
    expect(toggle.getAttribute('role')).toBe('switch');
    expect(toggle.getAttribute('data-help-key')).toBe('extra.toggle');
    expect(toggle.getAttribute('tabindex')).not.toBe('-1');
  });

  it('бейдж порога Q_data виден при qMin = 0.9 даже при выключенном режиме', () => {
    const store = makeStore({ settings: { ...DEFAULT_SETTINGS, qMin: 0.9 } });

    render(<Screen store={store} />);

    expect(extraSwitch().checked).toBe(false);
    expect(screen.getByText(formatMessage(ru['params.badgeQ'], { value: 90 }))).toBeTruthy();
  });
});

describe('реестр', () => {
  it('идентификаторы уникальны и проходят проверку isExtraId', () => {
    const unique = new Set(EXTRA_IDS);

    expect(unique.size).toBe(EXTRA_IDS.length);

    for (const entry of EXTRA_REGISTRY) {
      expect(isExtraId(entry.id)).toBe(true);
      expect(entry.where.length).toBeGreaterThan(0);
      expect(entry.description.length).toBeGreaterThan(0);
    }

    expect(isExtraId('unknown.extra')).toBe(false);
  });

  it('docs/extra-data.md совпадает с реестром по составу идентификаторов', () => {
    const path = resolve(process.cwd(), 'docs/extra-data.md');
    const document = readFileSync(path, 'utf8');
    const documented = [...document.matchAll(/^\|\s*`([^`]+)`\s*\|/gm)]
      .map((match) => match[1])
      .filter((id): id is string => id !== undefined);

    expect(documented).toEqual([...EXTRA_IDS]);
  });
});
