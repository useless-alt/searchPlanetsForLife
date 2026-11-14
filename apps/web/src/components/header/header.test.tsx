import type { ErrorLogEntry, SourceId, SourceStatus } from '@exo/shared';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ApiClient } from '../../api/client';
import { ru } from '../../i18n/ru';
import { formatDateTime } from '../../lib/formatDate';
import {
  SHOW_EXTRA_DATA_KEY,
  createAppStore,
  type AppState,
  type AppStore,
} from '../../state/store';
import { createInlineBackend } from '../../workers/computeBackend';
import { ErrorLogView } from './ErrorLogView';
import { Header } from './Header';

/**
 * Тесты шапки (задача 13).
 *
 * Проверяются: счётчики и их скрытие по умолчанию (11.2, U12), переключение
 * режимов, бейдж выбранной планеты, реестр действий шапки, баннеры сбоев
 * обновления (8.3, 10.1.8), кнопка источников, журнал ошибок и обновление
 * данных, которое не блокирует интерфейс (10.10.5).
 */

afterEach(cleanup);

/** Статус источника с заданным состоянием. */
function status(source: SourceId, state: SourceStatus['state']): SourceStatus {
  return {
    source,
    state,
    backupAt: state === 'backup' ? '2026-11-01T12:00:00' : null,
    message: null,
  };
}

/** Статусы шести источников: все обновлены. */
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

/** Мок REST-клиента: в тестах шапки сеть не используется. */
function mockApi(): ApiClient {
  return {
    getStatus: vi.fn(async () => ({
      phase: 'ready' as const,
      refreshing: false,
      startedAt: null,
      finishedAt: null,
      sources: allUpdated(),
      hasSnapshot: true,
    })),
    getCatalog: vi.fn(async () => ({ notModified: true as const })),
    refresh: vi.fn(async () => 'started' as const),
    getErrors: vi.fn(async () => [] as ErrorLogEntry[]),
  };
}

/** Изолированное хранилище в фазе «ready». */
function makeStore(overrides: Partial<AppState> = {}): AppStore {
  const store = createAppStore({
    api: mockApi(),
    backend: createInlineBackend(),
    sleep: async () => {},
  });

  store.setState({ phase: 'ready', ...overrides });

  return store;
}

describe('счётчики в шапке', () => {
  it('скрыты по умолчанию и появляются после включения', () => {
    const store = makeStore({
      counters: { total: 12345, computed: 12000, strictMeasured: 900, matching: 12000 },
    });

    render(<Header store={store} />);

    expect(screen.queryByText(/Всего в базе/)).toBeNull();

    act(() => {
      store.getState().setShowExtraData(true);
    });

    const number = new Intl.NumberFormat('ru-RU');

    // Разделитель тысяч в ru-RU — неразрывный пробел; текст в DOM
    // нормализуется, поэтому сравниваем с обычным пробелом.
    const format = (value: number): string => number.format(value).replace(/\s/g, ' ');

    expect(
      screen.getByText(
        `Всего в базе: ${format(12345)} | Рассчитано: ${format(12000)} | В строго измеренных: ${format(900)}`,
      ),
    ).toBeTruthy();
  });

  it('состояние сохраняется в sessionStorage и читается обратно', () => {
    const store = makeStore();

    act(() => {
      store.getState().setShowExtraData(true);
    });

    expect(sessionStorage.getItem(SHOW_EXTRA_DATA_KEY)).toBe('true');
    expect(createAppStore({ api: mockApi() }).getState().showExtraData).toBe(true);
  });

  it('не ломает рендеринг, если sessionStorage недоступен', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('доступ к хранилищу запрещён');
    });

    try {
      const store = makeStore();

      render(<Header store={store} />);

      expect(screen.getByRole('heading', { name: ru['app.title'] })).toBeTruthy();
    } finally {
      spy.mockRestore();
    }
  });
});

describe('переключатель режимов', () => {
  it('вызывает setMode с нужным идентификатором', () => {
    const store = makeStore();
    const setMode = vi.fn();

    store.setState({ setMode });

    render(<Header store={store} />);

    fireEvent.click(screen.getByRole('radio', { name: 'RHI' }));

    expect(setMode).toHaveBeenCalledWith('rhi');
  });

  it('недоступен, пока каталог загружается', () => {
    const store = makeStore({ phase: 'loading' });

    render(<Header store={store} />);

    const radio = screen.getByRole('radio', { name: 'RHI' }) as HTMLButtonElement;

    expect(radio.disabled).toBe(true);
  });
});

describe('бейдж выбранной планеты', () => {
  it('показывается для планеты, которой нет в строках Топ-50', () => {
    const store = makeStore({
      rows: [],
      selectedPlanetId: 'trappist-1-d',
      catalogIndex: { 'trappist-1-d': { name: 'TRAPPIST-1 d', hostname: 'TRAPPIST-1' } },
    });

    render(<Header store={store} />);

    expect(screen.getByText('TRAPPIST-1 d')).toBeTruthy();
  });
});

describe('действия шапки', () => {
  it('кнопки «CSV», «Ссылка» и «Методика» недоступны, пока действие не подключено', () => {
    const store = makeStore();

    render(<Header store={store} />);

    for (const label of [ru['header.csv'], ru['header.link'], ru['header.methodology']]) {
      const button = screen.getByRole('button', { name: label }) as HTMLButtonElement;

      expect(button.disabled).toBe(true);
    }
  });

  it('после registerAction кнопка доступна и вызывает функцию', () => {
    const store = makeStore();
    const exportCsv = vi.fn();

    render(<Header store={store} />);

    act(() => {
      store.getState().registerAction('exportCsv', exportCsv);
    });

    const button = screen.getByRole('button', { name: ru['header.csv'] }) as HTMLButtonElement;

    expect(button.disabled).toBe(false);

    fireEvent.click(button);

    expect(exportCsv).toHaveBeenCalledTimes(1);
  });
});

describe('баннеры источников', () => {
  it('два источника на резервной копии дают две строки с точным текстом', () => {
    const store = makeStore({
      sources: [
        status('gaia', 'backup'),
        status('nasa', 'backup'),
        ...allUpdated().filter((item) => item.source !== 'gaia' && item.source !== 'nasa'),
      ],
    });

    render(<Header store={store} />);

    expect(
      screen.getByText(
        'Не удалось обновить Gaia. Используются резервные данные от 01.11.2026 12:00',
      ),
    ).toBeTruthy();

    expect(
      screen.getByText(
        'Не удалось обновить NASA Exoplanet Archive. Используются резервные данные от 01.11.2026 12:00',
      ),
    ).toBeTruthy();
  });

  it('источник без копии даёт строку о пропуске', () => {
    const store = makeStore({
      sources: [status('simbad', 'error_no_backup'), ...allUpdated().slice(0, 5)],
    });

    render(<Header store={store} />);

    expect(screen.getByText('SIMBAD. Источник пропущен: резервной копии нет')).toBeTruthy();
  });

  it('без проблем баннера нет, а сам баннер не закрывается', () => {
    const store = makeStore({ sources: allUpdated() });

    const { container } = render(<Header store={store} />);

    expect(container.querySelector('.ui-banner')).toBeNull();

    const withProblem = makeStore({
      sources: [status('gaia', 'backup'), ...allUpdated().slice(1)],
    });
    const { container: second } = render(<Header store={withProblem} />);

    const banner = second.querySelector('.ui-banner');

    expect(banner).toBeTruthy();
    expect(banner?.querySelectorAll('button').length).toBe(0);
  });
});

describe('кнопка источников', () => {
  it('показывает число доступных статических источников', () => {
    const store = makeStore({
      sources: [
        status('gaia', 'updated'),
        status('nasa', 'updated'),
        status('exoplanet_eu', 'updated'),
        status('simbad', 'updated'),
        status('exomercat', 'pending'),
        status('exomast', 'pending'),
      ],
    });

    render(<Header store={store} />);

    expect(screen.getByRole('button', { name: 'Источники (4/5 + MAST)' })).toBeTruthy();
  });
});

describe('журнал ошибок', () => {
  it('переводит причины сбоя в русские тексты', () => {
    const reasons = [
      'timeout',
      'dns_error',
      'http_4xx',
      'http_5xx',
      'invalid_json',
      'empty',
      'schema_mismatch',
      'backup_write_failed',
    ];

    const entries: ErrorLogEntry[] = reasons.map((reason, index) => ({
      source: 'gaia' as SourceId,
      time: `2026-11-0${String(index + 1)}T10:00:00`,
      reason,
      backupUsed: null,
    }));

    render(<ErrorLogView entries={entries} loading={false} onLoad={vi.fn()} />);

    const texts = [
      'Превышено время ожидания',
      'Не удалось подключиться к серверу',
      'Сервер отклонил запрос',
      'Ошибка на стороне сервера',
      'Получены некорректные данные',
      'Источник вернул пустой ответ',
      'Структура данных не соответствует ожидаемой',
      'Не удалось сохранить резервную копию',
    ];

    for (const text of texts) {
      expect(screen.getByText(text)).toBeTruthy();
    }
  });

  it('пустой журнал показывает «Ошибок нет»', () => {
    render(<ErrorLogView entries={[]} loading={false} onLoad={vi.fn()} />);

    expect(screen.getByText(ru['errors.empty'])).toBeTruthy();
  });

  it('при открытии запрашивает журнал', () => {
    const onLoad = vi.fn();

    render(<ErrorLogView entries={[]} loading={false} onLoad={onLoad} />);

    expect(onLoad).toHaveBeenCalledTimes(1);
  });
});

describe('обновление данных', () => {
  it('во время обновления кнопка недоступна, индикатор виден, интерфейс работает', () => {
    const store = makeStore({ refreshing: true });

    render(<Header store={store} />);

    const button = screen.getByRole('button', { name: ru['header.refresh'] }) as HTMLButtonElement;

    expect(button.disabled).toBe(true);
    expect(screen.getByRole('status')).toBeTruthy();

    const overview = screen.getByRole('button', {
      name: ru['header.overview'],
    }) as HTMLButtonElement;

    expect(overview.disabled).toBe(false);
  });
});

describe('формат даты', () => {
  it('некорректная строка превращается в прочерк', () => {
    expect(formatDateTime('не дата')).toBe('—');
    expect(formatDateTime(null)).toBe('—');
  });
});
