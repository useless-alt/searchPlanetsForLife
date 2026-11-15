import { DEFAULT_SETTINGS, makeParam } from '@exo/shared';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';

import * as helpApi from '../../help/api';
import { ru } from '../../i18n/ru';
import { createAppStore, type AppStore } from '../../state/store';
import { registerSystemLayer, resetSystemLayers } from '../../three/system/layers';
import type { PlanetDetail } from '../../workers/protocol';
import { SceneControls } from './SceneControls';

/**
 * Тесты панели управления сценой (задача 22; п. 10.9, 11.6; U14, U38, U47).
 *
 * Проверяются блокировки цели и масштаба, появление переключателей только
 * после регистрации слоя, причина в подсказке и клавиатурное поведение.
 */

/** Деталь планеты с заданными пробелами. */
function sceneDetail(options: {
  starGaps?: string[];
  starStub?: boolean;
  planetStub?: boolean;
  d?: number | null;
}): PlanetDetail {
  return {
    id: 'a',
    name: 'Планета A',
    hostname: 'Звезда A',
    letter: 'b',
    aliases: [],
    sourcesCount: 1,
    resolved: {
      d: options.d === undefined ? makeParam(1, 'measured') : makeParam(options.d, 'measured'),
    } as PlanetDetail['resolved'],
    score: null,
    classicRank: null,
    hz: null,
    world: 'unknown',
    gaps: {
      planet: options.planetStub ? ['R'] : [],
      star: options.starGaps ?? [],
      planetStub: options.planetStub ?? false,
      starStub: options.starStub ?? false,
    },
    inTop: true,
  };
}

/** Хранилище для панели. */
function makeStore(detail: PlanetDetail, state: Partial<ReturnType<AppStore['getState']>> = {}) {
  const store = createAppStore({
    api: {
      getStatus: vi.fn(),
      getCatalog: vi.fn(),
      refresh: vi.fn(),
      getErrors: vi.fn(),
    } as never,
    backend: {
      init: vi.fn(async () => 0),
      compute: vi.fn(async () => ({
        rows: [],
        counters: { total: 0, computed: 0, strictMeasured: 0, matching: 0 },
      })),
      getResolved: vi.fn(async () => []),
      getPositions: vi.fn(async () => []),
      getPlanetDetail: vi.fn(async () => detail),
      dispose: vi.fn(),
    },
    sleep: async () => {},
  });

  store.setState({
    phase: 'ready',
    viewMode: 'system',
    scenePlanetId: 'a',
    sceneDetail: detail,
    settings: DEFAULT_SETTINGS,
    ...state,
  });

  return store;
}

afterEach(() => {
  cleanup();
  resetSystemLayers();
  vi.restoreAllMocks();
});

describe('SceneControls — цель', () => {
  it('«Звезда» заблокирована при нехватке температуры и показывает причину', () => {
    const show = vi.spyOn(helpApi, 'showHelpAt').mockImplementation(() => {});
    const detail = sceneDetail({ starGaps: ['st_teff'], starStub: true });
    const store = makeStore(detail);

    render(<SceneControls store={store} />);

    const star = screen.getByRole('radio', { name: ru['scene.star'] });

    expect(star.getAttribute('aria-disabled')).toBe('true');
    expect((star as HTMLButtonElement).disabled).toBe(false);

    fireEvent.focus(star);

    expect(show).toHaveBeenCalled();
    expect(show.mock.calls[0]?.[0].ctx?.disabledReason).toContain('температура звезды');
  });

  it('«Планета» остаётся доступной при заглушке планеты', () => {
    const store = makeStore(sceneDetail({ planetStub: true, starStub: false }), {
      sceneTarget: 'planet',
    });

    render(<SceneControls store={store} />);

    const planet = screen.getByRole('radio', { name: ru['scene.planet'] });

    expect(planet.getAttribute('aria-disabled')).toBeNull();
    fireEvent.click(planet);
    expect(store.getState().sceneTarget).toBe('planet');
  });
});

describe('SceneControls — масштаб', () => {
  it('«1:1» заблокирован при неизвестной большой полуоси', () => {
    const detail = sceneDetail({ d: null });
    const store = makeStore(detail);

    render(<SceneControls store={store} />);

    const real = screen.getByRole('radio', { name: ru['scene.realMode'] });

    expect(real.getAttribute('aria-disabled')).toBe('true');
    expect(screen.getByText(ru['scene.nominalNote'])).toBeTruthy();

    fireEvent.click(real);

    expect(store.getState().scaleMode).toBe('overview');
  });

  it('стрелки не меняют недоступный масштаб, но переводят на него фокус', () => {
    const store = makeStore(sceneDetail({ d: null }));
    render(<SceneControls store={store} />);
    const group = screen.getByRole('radiogroup', { name: ru['scene.scaleLabel'] });
    const real = screen.getByRole('radio', { name: ru['scene.realMode'] });

    fireEvent.keyDown(group, { key: 'ArrowRight' });

    expect(store.getState().scaleMode).toBe('overview');
    expect(document.activeElement).toBe(real);
  });
});

describe('SceneControls — слои', () => {
  it('переключатели появляются только после регистрации слоя', () => {
    const store = makeStore(sceneDetail({}));

    render(<SceneControls store={store} />);

    expect(screen.queryByRole('button', { name: ru['scene.orbit'] })).toBeNull();

    act(() => {
      registerSystemLayer({
        id: 'orbit',
        toggleKey: 'showOrbit',
        status: () => 'available',
        build: () => new THREE.Group(),
      });
    });

    expect(screen.getByRole('button', { name: ru['scene.orbit'] })).toBeTruthy();
    // Зона обитаемости убрана из интерфейса по решению владельца.
    expect(screen.queryByRole('button', { name: ru['scene.hz'] })).toBeNull();
  });

  it('недоступный слой получает aria-disabled и причину в подсказке', () => {
    const show = vi.spyOn(helpApi, 'showHelpAt').mockImplementation(() => {});
    const store = makeStore(sceneDetail({}), {
      systemLayerStatus: {
        orbit: { available: false, reason: 'Орбита не рассчитана' },
      },
    });

    act(() => {
      registerSystemLayer({
        id: 'orbit',
        toggleKey: 'showOrbit',
        status: () => 'unavailable',
        build: () => new THREE.Group(),
      });
    });

    render(<SceneControls store={store} />);

    const orbit = screen.getByRole('button', { name: ru['scene.orbit'] });

    expect(orbit.getAttribute('aria-disabled')).toBe('true');
    expect(orbit.getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(orbit);
    expect(store.getState().showOrbit).toBe(true);

    fireEvent.focus(orbit);

    expect(show.mock.calls[0]?.[0].ctx?.disabledReason).toBe('Орбита не рассчитана');
  });

  it('доступный слой переключает showOrbit', () => {
    const store = makeStore(sceneDetail({}));

    act(() => {
      registerSystemLayer({
        id: 'orbit',
        toggleKey: 'showOrbit',
        status: () => 'available',
        build: () => new THREE.Group(),
      });
    });

    render(<SceneControls store={store} />);

    fireEvent.click(screen.getByRole('button', { name: ru['scene.orbit'] }));

    expect(store.getState().showOrbit).toBe(false);
  });
});

describe('SceneControls — клавиатура', () => {
  it('в каждой группе ровно один вариант в порядке Tab', () => {
    const store = makeStore(sceneDetail({}));
    render(<SceneControls store={store} />);

    const planet = screen.getByRole('radio', { name: ru['scene.planet'] });
    const star = screen.getByRole('radio', { name: ru['scene.star'] });
    const overview = screen.getByRole('radio', { name: ru['scene.overviewMode'] });
    const real = screen.getByRole('radio', { name: ru['scene.realMode'] });

    expect(planet.tabIndex).toBe(0);
    expect(star.tabIndex).toBe(-1);
    expect(overview.tabIndex).toBe(0);
    expect(real.tabIndex).toBe(-1);
  });

  it('стрелки переключают доступные варианты цели', () => {
    const store = makeStore(sceneDetail({}));
    render(<SceneControls store={store} />);
    const group = screen.getByRole('radiogroup', { name: ru['scene.targetLabel'] });

    fireEvent.keyDown(group, { key: 'ArrowRight' });

    expect(store.getState().sceneTarget).toBe('star');
  });
});
