import type { ErrorLogEntry, RankingCounters, StatusResponse } from '@exo/shared';
import { act, cleanup, createEvent, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ApiClient } from '../api/client';
import { createAppStore, type AppStore } from '../state/store';
import type { ComputeBackend } from '../workers/computeBackend';
import { HELP_TOOLTIP_ID } from './Tooltip';
import { HELP_DELAY_MS, TooltipProvider } from './TooltipProvider';

/**
 * Тесты провайдера подсказок (задача 17; п. 11.1).
 *
 * Проверяются: отсутствие подсказок в обычном состоянии, задержка показа,
 * скрытие по Esc, уходу курсора и нажатию вне, фокус с клавиатуры,
 * сенсорное касание и одновременность одной подсказки.
 */

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** Счётчики-маркер. */
function counters(): RankingCounters {
  return { total: 0, computed: 0, strictMeasured: 0, matching: 0 };
}

/** Мок REST-клиента: сеть не используется. */
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

/** Изолированное хранилище с пустым расчётом. */
function makeStore(): AppStore {
  const backend: ComputeBackend = {
    init: async () => 0,
    compute: async () => ({ rows: [], counters: counters() }),
    getResolved: async () => [],
    getPositions: async () => [],
    getPlanetDetail: async () => {
      throw new Error('деталь в этом тесте не используется');
    },
    dispose: () => {},
  };

  const store = createAppStore({ api: mockApi(), backend, sleep: async () => {} });

  store.setState({ phase: 'ready' });

  return store;
}

/** Кнопка с ключом подсказки. */
function renderWithButton(key = 'mode.adaptive'): {
  store: AppStore;
  button: HTMLButtonElement;
} {
  const store = makeStore();
  const { getByRole } = render(
    <TooltipProvider store={store}>
      <button type="button" data-help-key={key}>
        Кнопка
      </button>
    </TooltipProvider>,
  );

  return { store, button: getByRole('button') as HTMLButtonElement };
}

/** Прокручивает время внутри act. */
function advance(ms: number): void {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

/** Показывает подсказку наведением. */
function hover(element: HTMLElement): void {
  fireEvent.pointerOver(element, { clientX: 20, clientY: 30 });
  advance(HELP_DELAY_MS);
}

/**
 * Сенсорное касание: jsdom не знает `PointerEvent`, поэтому `pointerType`
 * задаётся вручную — иначе провайдер справедливо считает ввод мышиным.
 */
function touchDown(element: Element, x = 10, y = 10): void {
  const event = createEvent.pointerDown(element, {
    pointerType: 'touch',
    clientX: x,
    clientY: y,
  });

  Object.defineProperty(event, 'pointerType', { value: 'touch' });
  fireEvent(element, event);
}

describe('TooltipProvider', () => {
  it('не создаёт подсказку без наведения', () => {
    renderWithButton();

    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('показывает подсказку после задержки 150 мс', () => {
    const { button } = renderWithButton();

    fireEvent.pointerOver(button, { clientX: 20, clientY: 30 });

    expect(screen.queryByRole('tooltip')).toBeNull();

    advance(HELP_DELAY_MS - 1);
    expect(screen.queryByRole('tooltip')).toBeNull();

    advance(1);
    expect(screen.getByRole('tooltip').textContent).toContain('Адаптивный режим');
  });

  it('скрывает подсказку по Esc', () => {
    const { button } = renderWithButton();

    hover(button);
    expect(screen.getByRole('tooltip')).toBeTruthy();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('скрывает подсказку, когда курсор уходит с цели', () => {
    const { button } = renderWithButton();

    hover(button);
    fireEvent.pointerOut(button, { relatedTarget: document.body });

    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('скрывает подсказку по нажатию вне цели', () => {
    const { button } = renderWithButton();

    hover(button);
    fireEvent.pointerDown(document.body);

    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('показывает одну подсказку одновременно', () => {
    const store = makeStore();
    const { getAllByRole } = render(
      <TooltipProvider store={store}>
        <button type="button" data-help-key="mode.adaptive">
          Первая
        </button>
        <button type="button" data-help-key="mode.rhi">
          Вторая
        </button>
      </TooltipProvider>,
    );

    const [first, second] = getAllByRole('button');
    if (first === undefined || second === undefined) throw new Error('нет кнопок');

    hover(first);
    hover(second);

    const tooltips = screen.getAllByRole('tooltip');

    expect(tooltips).toHaveLength(1);
    expect(tooltips[0]?.textContent).toContain('RHI');
  });

  it('показывает подсказку при фокусе с клавиатуры и связывает её с целью', () => {
    const { button } = renderWithButton();

    fireEvent.focusIn(button);

    const tooltip = screen.getByRole('tooltip');

    expect(tooltip.textContent).toContain('Адаптивный режим');
    expect(button.getAttribute('aria-describedby')).toContain(HELP_TOOLTIP_ID);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(button.hasAttribute('aria-describedby')).toBe(false);
  });

  it('показывает и скрывает подсказку касанием', () => {
    const { button } = renderWithButton();

    touchDown(button);
    expect(screen.getByRole('tooltip')).toBeTruthy();

    touchDown(document.body);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('добавляет tabindex только по data-help-focusable', () => {
    const store = makeStore();
    const { getByText } = render(
      <TooltipProvider store={store}>
        <span data-help-key="tag.exo">эксп.</span>
        <span data-help-key="tag.lowReliability" data-help-focusable="true">
          Низк.
        </span>
      </TooltipProvider>,
    );

    expect(getByText('эксп.').hasAttribute('tabindex')).toBe(false);
    expect(getByText('Низк.').getAttribute('tabindex')).toBe('0');
  });
});
