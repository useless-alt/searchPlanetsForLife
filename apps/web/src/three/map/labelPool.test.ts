import { cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { RankedRowView } from '../../workers/protocol';
import { createLabelPool, LABEL_MOVE_DURATION_MS, type LabelPool } from './LabelPool';
import type { GalaxyData } from './buildGalaxy';
import type { ScoreBreakdown } from '@exo/shared';

/**
 * Тесты пула меток карты (задача 21; п. 6.2, 10.8; U43).
 *
 * Проверяются постоянный DOM из 51 узла, привязка к рангам, смещение
 * лидеров одной системы, 51-й слот и видимость подписей.
 */

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

/** Минимальная оценка строки. */
function score(index = 0.8): ScoreBreakdown {
  return {
    mode: 'adaptive',
    ESI_R: 0.9,
    ESI_rho: 0.9,
    ESI_ve: 0.9,
    ESI_S: 0.9,
    ESI_T: 0.9,
    ESI_interior: 0.9,
    F_HZ: 0.7,
    HZD: 0.1,
    P_rocky: 1,
    P_ecc: 1,
    P_star: 1,
    Q_data: 0.95,
    index,
    k: 4,
    n: 4,
    insufficient_data: false,
    T_s: 288,
    v_e: 1,
  };
}

/** Строка Топ-50 с заданным рангом. */
function row(rank: number, planetId: string, name = `Планета ${rank}`): RankedRowView {
  return {
    rank,
    rankClassic: rank,
    delta: 0,
    planetId,
    score: score(),
    name,
    hostname: `Звезда ${rank}`,
    R: 1,
    M: 1,
    T_s: 288,
    e: 0.02,
    spectralClass: 'G',
    dist_pc: 10,
    sourcesCount: 3,
    Q_data: 0.95,
    qLevel: 'high',
    provenance: { R: 'measured', M: 'measured', e: 'measured' },
    lowReliability: false,
    insufficient: false,
    levelB_mass: false,
    levelB_radius: false,
    e_assumed_zero: false,
  };
}

/** Данные карты из списка систем. */
function galaxyWith(systems: Array<{ key: string; planetIds: string[]; x: number }>): GalaxyData {
  const systemIndexByPlanet = new Map<string, number>();
  const positions = new Float32Array(systems.length * 3);
  const colors = new Float32Array(systems.length * 3);

  systems.forEach((system, index) => {
    system.planetIds.forEach((planetId) => systemIndexByPlanet.set(planetId, index));
    positions[index * 3] = system.x;
    positions[index * 3 + 1] = 0;
    positions[index * 3 + 2] = 0;
    colors[index * 3] = 1;
    colors[index * 3 + 1] = 1;
    colors[index * 3 + 2] = 1;
  });

  return {
    snapshotId: 'snapshot',
    systems: systems.map((system) => ({
      key: system.key,
      planetIds: system.planetIds,
      position: { x: system.x, y: 0, z: 0 },
    })),
    positions,
    colors,
    systemIndexByPlanet,
    unplaced: [],
    radiusP95: 50,
    radiusMax: 50,
  };
}

/** Пул, подключённый к документу для проверки DOM. */
function makePool(galaxy: GalaxyData): LabelPool {
  const pool = createLabelPool({
    galaxy,
    onSelect: vi.fn(),
  });

  document.body.appendChild(pool.container);

  return pool;
}

describe('LabelPool', () => {
  it('после 100 обновлений оставляет ровно 51 DOM-узел', () => {
    const pool = makePool(galaxyWith([{ key: 'star', planetIds: ['a'], x: 10 }]));

    for (let index = 0; index < 100; index += 1) {
      pool.updateLeaders([row(1, 'a')]);
    }

    expect(pool.buttons).toHaveLength(51);
    expect(pool.container.querySelectorAll('button')).toHaveLength(51);
    expect(pool.objects).toHaveLength(51);
    expect(pool.buttons[1]?.hidden).toBe(true);
  });

  it('при 15 строках скрывает 35 слотов лидеров', () => {
    const rows = Array.from({ length: 15 }, (_, index) => row(index + 1, `p${index + 1}`));
    const pool = makePool(
      galaxyWith(
        rows.map((item, index) => ({ key: `s${index}`, planetIds: [item.planetId], x: index })),
      ),
    );

    pool.updateLeaders(rows);

    const leaderButtons = pool.buttons.slice(0, 50);
    const hidden = leaderButtons.filter((button) => button.hidden);

    expect(hidden).toHaveLength(35);

    for (const button of hidden) {
      expect(button.hidden).toBe(true);
      expect(button.getAttribute('aria-hidden')).toBe('true');
      expect(button.tabIndex).toBe(-1);
      expect(button.style.pointerEvents).toBe('none');
    }

    expect(pool.buttons[50]?.hidden).toBe(true);
  });

  it('ставит в слот i планету с рангом i + 1, а не порядок сортировки', () => {
    const rows = [row(3, 'c'), row(1, 'a'), row(2, 'b')];
    const pool = makePool(
      galaxyWith([
        { key: 'a', planetIds: ['a'], x: 1 },
        { key: 'b', planetIds: ['b'], x: 2 },
        { key: 'c', planetIds: ['c'], x: 3 },
      ]),
    );

    pool.updateLeaders(rows);

    expect(pool.buttons[0]?.dataset['planetId']).toBe('a');
    expect(pool.buttons[0]?.getAttribute('aria-label')).toBe('1. Планета 1');
    expect(pool.buttons[1]?.dataset['planetId']).toBe('b');
    expect(pool.buttons[2]?.dataset['planetId']).toBe('c');
  });

  it('смещает лидеров одной системы на 14 px', () => {
    const pool = makePool(galaxyWith([{ key: 'star', planetIds: ['a', 'b'], x: 10 }]));

    pool.updateLeaders([row(1, 'a'), row(2, 'b')]);

    expect(pool.buttons[0]?.style.marginLeft).toBe('0px');
    expect(pool.buttons[1]?.style.marginLeft).toBe('14px');
  });

  it('показывает 51-й слот только для выбранной планеты вне Топ-50 с координатами', () => {
    const pool = makePool(
      galaxyWith([
        { key: 'a', planetIds: ['a'], x: 1 },
        { key: 'b', planetIds: ['b'], x: 2 },
        { key: 'outside', planetIds: ['outside'], x: 3 },
      ]),
    );

    pool.updateLeaders([row(1, 'a'), row(2, 'b')]);

    expect(pool.buttons[50]?.hidden).toBe(true);

    pool.setSelected('outside', null, 'Внешняя');
    expect(pool.buttons[50]?.hidden).toBe(false);
    expect(pool.buttons[50]?.getAttribute('aria-label')).toBe('Внешняя');
    expect(pool.buttons[50]?.classList.contains('reticle--selected')).toBe(true);

    pool.setSelected('a', null, 'А');
    expect(pool.buttons[50]?.hidden).toBe(true);

    pool.setSelected('missing', null, 'Нет координат');
    expect(pool.buttons[50]?.hidden).toBe(true);
  });

  it('показывает подписи только у рангов ≤ 10, выбранной и наведённой планеты', () => {
    const rows = Array.from({ length: 15 }, (_, index) => row(index + 1, `p${index + 1}`));
    const pool = makePool(
      galaxyWith(
        rows.map((item, index) => ({ key: `s${index}`, planetIds: [item.planetId], x: index })),
      ),
    );

    pool.updateLeaders(rows);
    pool.setSelected('p12', null, 'Планета 12');
    pool.setHovered('p14');

    expect(pool.buttons[0]?.classList.contains('reticle--labeled')).toBe(true);
    expect(pool.buttons[9]?.classList.contains('reticle--labeled')).toBe(true);
    expect(pool.buttons[10]?.classList.contains('reticle--labeled')).toBe(false);
    expect(pool.buttons[11]?.classList.contains('reticle--labeled')).toBe(true);
    expect(pool.buttons[13]?.classList.contains('reticle--labeled')).toBe(true);
    expect(pool.buttons[50]?.hidden).toBe(true);
  });

  it('сохраняет тестовую длительность перемещения 250 мс в константе', () => {
    expect(LABEL_MOVE_DURATION_MS).toBe(250);
  });
});
