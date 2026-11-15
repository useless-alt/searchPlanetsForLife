import {
  makeParam,
  nullParam,
  type ExoMastProps,
  type ResolvedPlanet,
  type SolverFlags,
} from '@exo/shared';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ApiClient } from '../../api/client';
import { ExoMastApiError, type ExoMastApi } from '../../exomast/api';
import type { ExoMastEntry } from '../../exomast/slice';
import { createAppStore, type AppStore } from '../../state/store';
import type { ComputeBackend } from '../../workers/computeBackend';
import { resetToasts, ToastHost } from '../ui/Toast';
import { ExoMastSection } from './ExoMastSection';
import { ParamTable } from './ParamTable';
import { ReconstructionPanel } from './ReconstructionPanel';
import { RefreshPlanetButton } from './RefreshPlanetButton';

/**
 * Тесты интерфейса задачи 28: панель реконструкции, диалог источника,
 * статусы Exo.MAST, спектры и кнопка обновления.
 */

function flags(): SolverFlags {
  return {
    insufficient_data: false,
    levelB_mass: false,
    levelB_radius: false,
    e_assumed_zero: false,
    excluded_subindices: [],
    k: 4,
    n: 4,
    strict_complete: true,
    available: {
      ESI_R: true,
      ESI_rho: true,
      ESI_ve: true,
      ESI_S: true,
      ESI_T: true,
      F_HZ: true,
    },
  };
}

/** Земля: часть значений измерена, часть восстановлена. */
function earth(): ResolvedPlanet {
  return {
    id: 'earth',
    R: makeParam(1, 'measured', 'nasa', '2026-11-01T00:00:00.000Z'),
    M: makeParam(1, 'model'),
    e: makeParam(0, 'estimate'),
    d: makeParam(1, 'physics'),
    P: makeParam(365.25, 'physics'),
    S: makeParam(1, 'physics'),
    T_eq: makeParam(255, 'physics'),
    rho: makeParam(5.51, 'physics'),
    L: makeParam(1, 'physics'),
    st_teff: makeParam(5772, 'measured', 'gaia', '2026-10-01T00:00:00.000Z'),
    st_rad: makeParam(1, 'physics'),
    st_mass: makeParam(1, 'model'),
    dist_pc: nullParam(),
    ra: nullParam(),
    dec: nullParam(),
    flags: flags(),
  };
}

function apiStub(): ApiClient {
  return {
    getStatus: vi.fn(),
    getCatalog: vi.fn(),
    refresh: vi.fn(),
    getErrors: vi.fn(),
  } as unknown as ApiClient;
}

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

function props(planetId: string, overrides: Partial<ExoMastProps> = {}): ExoMastProps {
  return {
    planetId,
    fetchedAt: '2026-11-15T10:00:00.000Z',
    fromBackup: false,
    catalog: 'nexsci',
    raw: { Teff: 5772, canonical_name: 'Earth' },
    extracted: {},
    canonicalName: 'Earth',
    atmosphere: { molecules: ['H2O'], keys: ['atmosphere'] },
    spectraFiles: [],
    ...overrides,
  };
}

function entry(overrides: Partial<ExoMastEntry> = {}): ExoMastEntry {
  return {
    state: 'updated',
    props: props('earth'),
    errorReason: null,
    trigger: 'approach',
    spectra: {},
    ...overrides,
  };
}

/** Клиент Exo.MAST по умолчанию. */
function createApi(options: Partial<ExoMastApi> = {}): ExoMastApi {
  return {
    getExoMast: vi.fn(async () => ({ props: props('earth'), status: 'updated' as const })),
    getSpectrum: vi.fn(async () => ({
      file: 'a.txt',
      kind: 'transmission' as const,
      dataLines: 12,
      columns: 4,
      firstColumnMin: 0.5,
      firstColumnMax: 1.5,
      headerLines: ['Спектр', 'Вторая строка'],
    })),
    ...options,
  };
}

/** Хранилище с выбранной планетой и кэшем resolved. */
function makeStore(exoMastApi: ExoMastApi = createApi()): AppStore {
  const store = createAppStore({
    api: apiStub(),
    backend: backendStub(),
    exoMastApi,
    sleep: async () => {},
  });

  store.setState({
    selectedPlanetId: 'earth',
    resolvedCache: { earth: earth() },
    catalogIndex: { earth: { name: 'Земля', hostname: 'Солнце' } },
  });
  store.getState().setShowExtraData(false);

  return store;
}

afterEach(() => {
  cleanup();
  resetToasts();
  sessionStorage.clear();
});

describe('ReconstructionPanel', () => {
  it('по умолчанию показывает только physics, model и estimate', () => {
    const store = makeStore();
    render(<ReconstructionPanel store={store} />);

    expect(screen.getByText('Данные реконструкции')).toBeTruthy();
    expect(screen.getByRole('button', { name: /^M ~1\.00/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^e ~0\.00/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^R 1\.00/ })).toBeNull();
  });

  it('«Показать все параметры» добавляет измеренные значения', () => {
    const store = makeStore();
    render(<ReconstructionPanel store={store} />);

    fireEvent.click(screen.getByLabelText('Показать все параметры'));

    expect(screen.getByRole('button', { name: /^R 1\.00/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^T звезды 5772/ })).toBeTruthy();
  });

  it('если восстановленных нет — сообщает, что всё измерено', () => {
    const store = makeStore();
    const measured = earth();
    const keys = [
      'R',
      'M',
      'e',
      'd',
      'P',
      'S',
      'T_eq',
      'rho',
      'L',
      'st_teff',
      'st_rad',
      'st_mass',
    ] as const;

    for (const key of keys) {
      (measured[key] as unknown as { provenance: string | null }).provenance = 'measured';
    }

    store.setState({ resolvedCache: { earth: measured } });
    render(<ReconstructionPanel store={store} />);

    expect(screen.getByText('Все ключевые параметры измерены напрямую')).toBeTruthy();
  });

  it('клик по чипу открывает формулу и входные данные, Esc закрывает и возвращает фокус', () => {
    const store = makeStore();
    render(<ReconstructionPanel store={store} />);

    const chip = screen.getByRole('button', { name: /^M ~1\.00/ });
    chip.focus();
    fireEvent.click(chip);

    const dialog = screen.getByRole('dialog');
    expect(dialog.textContent).toContain('R^3.58');
    expect(dialog.textContent).toContain('Входные данные');
    expect(dialog.textContent).toContain('Уровень Б — погрешность около 15–25%');

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(chip);
  });
});

describe('ExoMastSection', () => {
  const cases: Array<{ title: string; value: ExoMastEntry | null; text: string }> = [
    { title: 'idle', value: null, text: 'Данные Exo.MAST ещё не запрашивались' },
    {
      title: 'loading',
      value: entry({ state: 'loading', props: null }),
      text: 'Загрузка данных Exo.MAST…',
    },
    { title: 'updated', value: entry(), text: 'Данные Exo.MAST получены' },
    {
      title: 'backup',
      value: entry({ state: 'backup', props: props('earth', { fromBackup: true }) }),
      text: 'Используются сохранённые данные Exo.MAST от',
    },
    {
      title: 'error + props',
      value: entry({ state: 'error', errorReason: 'timeout' }),
      text: 'Используются ранее загруженные данные',
    },
    {
      title: 'error без props',
      value: entry({ state: 'error', props: null, errorReason: 'dns_error' }),
      text: 'Данные Exo.MAST недоступны',
    },
  ];

  for (const item of cases) {
    it(`текст состояния ${item.title}`, () => {
      const store = makeStore();
      store.setState({ exoMast: item.value === null ? {} : { earth: item.value } });
      render(<ExoMastSection planetId="earth" store={store} />);

      expect(
        screen.getAllByText(new RegExp(item.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))).length,
      ).toBeGreaterThan(0);
    });
  }

  it('показывает состав атмосферы и пустой список спектров', () => {
    const store = makeStore();
    store.setState({ exoMast: { earth: entry() } });
    render(<ExoMastSection planetId="earth" store={store} />);

    expect(screen.getByText('Состав атмосферы: H2O')).toBeTruthy();
    expect(screen.getByText('Спектры для этой планеты не найдены')).toBeTruthy();
  });

  it('«Показать сведения» показывает строки, столбцы и заголовок', async () => {
    const store = makeStore();
    store.setState({
      exoMast: {
        earth: entry({
          props: props('earth', { spectraFiles: ['a.txt'] }),
        }),
      },
    });

    render(<ExoMastSection planetId="earth" store={store} />);
    fireEvent.click(screen.getByRole('button', { name: 'Показать сведения' }));

    await waitFor(() => {
      expect(screen.getByText('Строк данных')).toBeTruthy();
    });
    expect(screen.getByText('12')).toBeTruthy();
    expect(screen.getByText('Столбцов')).toBeTruthy();
    expect(screen.getByText('0.50 — 1.50')).toBeTruthy();
    expect(screen.getByText('Спектр')).toBeTruthy();
  });

  it('сырые данные видны только в режиме дополнительных данных', () => {
    const store = makeStore();
    store.setState({ exoMast: { earth: entry() } });

    const { rerender } = render(<ExoMastSection planetId="earth" store={store} />);
    expect(screen.queryByText(/canonical_name/)).toBeNull();

    store.getState().setShowExtraData(true);
    rerender(<ExoMastSection planetId="earth" store={store} />);

    expect(screen.getByText(/canonical_name/)).toBeTruthy();
    expect(document.querySelector('[data-extra="card.exomast.raw"]')).not.toBeNull();
  });
});

describe('ParamTable: значения Exo.MAST', () => {
  it('расхождение показывается только в режиме дополнительных данных', () => {
    const store = makeStore();
    store.getState().setShowExtraData(false);
    store.setState({
      exoMast: { earth: entry({ props: props('earth', { extracted: { pl_rade: 2 } }) }) },
    });

    const { rerender } = render(<ParamTable planet={earth()} planetId="earth" store={store} />);
    expect(screen.queryByText('Exo.MAST: 2.00')).toBeNull();

    store.getState().setShowExtraData(true);
    rerender(<ParamTable planet={earth()} planetId="earth" store={store} />);

    expect(screen.getByText('Exo.MAST: 2.00')).toBeTruthy();
  });
});

describe('RefreshPlanetButton', () => {
  it('блокируется на время запроса и показывает Toast об успехе', async () => {
    let resolve!: (value: { props: ExoMastProps; status: 'updated' }) => void;
    const getExoMast = vi.fn(
      () =>
        new Promise<{ props: ExoMastProps; status: 'updated' }>((done) => {
          resolve = done;
        }),
    );
    const store = makeStore(createApi({ getExoMast }));

    render(
      <>
        <RefreshPlanetButton store={store} />
        <ToastHost />
      </>,
    );

    const button = screen.getByRole('button', { name: 'Обновить данные планеты' });
    fireEvent.click(button);

    await waitFor(() => {
      expect(button.getAttribute('aria-busy')).toBe('true');
    });
    expect((button as HTMLButtonElement).disabled).toBe(true);

    resolve({ props: props('earth'), status: 'updated' });

    await waitFor(() => {
      expect(screen.getByText('Данные Exo.MAST обновлены')).toBeTruthy();
    });
    expect((button as HTMLButtonElement).disabled).toBe(false);
  });

  it('ошибка показывает причину и упоминает прежние данные', async () => {
    const store = makeStore(
      createApi({
        getExoMast: vi.fn(async () => {
          throw new ExoMastApiError('timeout', 502);
        }),
      }),
    );
    store.setState({ exoMast: { earth: entry({ props: props('earth') }) } });

    render(
      <>
        <RefreshPlanetButton store={store} />
        <ToastHost />
      </>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Обновить данные планеты' }));

    await waitFor(() => {
      expect(
        screen.getByText(
          'Не удалось обновить Exo.MAST: Превышено время ожидания. Используются ранее загруженные данные',
        ),
      ).toBeTruthy();
    });
  });
});
