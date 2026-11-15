import { describe, expect, it } from 'vitest';

import type { GalaxyData } from './buildGalaxy';
import {
  LEADER_OFFSET_PX,
  LEADER_SLOT_COUNT,
  SELECTED_SLOT_INDEX,
  buildLeaderSlots,
  type LeaderRow,
} from './leaders';

/**
 * Тесты раскладки меток карты (задача 21; п. 6.2, 10.8; U43).
 *
 * Проверяется привязка слотов к рангу, смещение лидеров одной системы,
 * скрытие планет без координат и видимость 51-го слота и подписей.
 */

/** Строит данные карты, где каждая планета — отдельная система. */
function galaxyFor(
  planets: ReadonlyArray<{ planetId: string; x?: number }>,
): Pick<GalaxyData, 'systems' | 'systemIndexByPlanet'> {
  const systemIndexByPlanet = new Map<string, number>();
  const systems = planets.map((planet, index) => {
    systemIndexByPlanet.set(planet.planetId, index);

    return {
      key: `system-${index}`,
      planetIds: [planet.planetId],
      position: { x: planet.x ?? index * 100, y: 0, z: 0 },
    };
  });

  return { systems, systemIndexByPlanet };
}

/** Строки Топ-50 с последовательными рангами. */
function rows(count: number): LeaderRow[] {
  return Array.from({ length: count }, (_, index) => ({
    rank: index + 1,
    planetId: `planet-${index + 1}`,
  }));
}

describe('buildLeaderSlots', () => {
  it('ставит в слот i планету с рангом i + 1, а не строку текущей сортировки', () => {
    const list = rows(3);
    const shuffled = [list[2], list[0], list[1]].filter(
      (row): row is LeaderRow => row !== undefined,
    );
    const galaxy = galaxyFor([
      { planetId: 'planet-1' },
      { planetId: 'planet-2' },
      { planetId: 'planet-3' },
    ]);
    const slots = buildLeaderSlots({ rows: shuffled, galaxy });

    expect(slots).toHaveLength(LEADER_SLOT_COUNT + 1);
    expect(slots[0]?.rank).toBe(1);
    expect(slots[0]?.planetId).toBe('planet-1');
    expect(slots[1]?.rank).toBe(2);
    expect(slots[1]?.planetId).toBe('planet-2');
    expect(slots[2]?.rank).toBe(3);
    expect(slots[2]?.planetId).toBe('planet-3');
  });

  it('разводит лидеров одной системы на k * 14 px', () => {
    const list = rows(3);
    const galaxy: Pick<GalaxyData, 'systems' | 'systemIndexByPlanet'> = {
      systems: [
        { key: 'star', planetIds: ['planet-1', 'planet-2'], position: { x: 10, y: 0, z: 0 } },
        { key: 'other', planetIds: ['planet-3'], position: { x: 20, y: 0, z: 0 } },
      ],
      systemIndexByPlanet: new Map([
        ['planet-1', 0],
        ['planet-2', 0],
        ['planet-3', 1],
      ]),
    };
    const slots = buildLeaderSlots({ rows: list, galaxy });

    expect(slots[0]?.offsetX).toBe(0);
    expect(slots[1]?.offsetX).toBe(LEADER_OFFSET_PX);
    expect((slots[1]?.offsetX ?? 0) % LEADER_OFFSET_PX).toBe(0);
    expect(slots[2]?.offsetX).toBe(0);
  });

  it('скрывает слоты планет без координат и не даёт им подпись', () => {
    const list = rows(2);
    const galaxy = galaxyFor([{ planetId: 'planet-1' }]);
    const slots = buildLeaderSlots({ rows: list, galaxy });

    expect(slots[0]?.visible).toBe(true);
    expect(slots[1]?.visible).toBe(false);
    expect(slots[1]?.position).toBeNull();
    expect(slots[1]?.systemIndex).toBeNull();
    expect(slots[1]?.labelVisible).toBe(false);
  });

  it('показывает подписи у рангов ≤ 10, выбранной и наведённой планеты', () => {
    const list = rows(20);
    const galaxy = galaxyFor(list.map((row) => ({ planetId: row.planetId })));
    const slots = buildLeaderSlots({
      rows: list,
      galaxy,
      selectedPlanetId: 'planet-15',
      hoveredPlanetId: 'planet-18',
    });

    expect(slots[0]?.labelVisible).toBe(true);
    expect(slots[9]?.labelVisible).toBe(true);
    expect(slots[10]?.labelVisible).toBe(false);
    expect(slots[14]?.labelVisible).toBe(true);
    expect(slots[17]?.labelVisible).toBe(true);
  });

  it('показывает 51-й слот, когда выбранная планета вне rows и имеет координаты', () => {
    const list = rows(2);
    const galaxy = galaxyFor([
      { planetId: 'planet-1' },
      { planetId: 'planet-2' },
      { planetId: 'outside', x: 500 },
    ]);
    const slots = buildLeaderSlots({
      rows: list,
      galaxy,
      selectedPlanetId: 'outside',
    });
    const selectedSlot = slots[SELECTED_SLOT_INDEX];

    expect(selectedSlot).toBeDefined();
    expect(selectedSlot?.index).toBe(SELECTED_SLOT_INDEX);
    expect(selectedSlot?.visible).toBe(true);
    expect(selectedSlot?.planetId).toBe('outside');
    expect(selectedSlot?.labelVisible).toBe(true);
  });

  it('скрывает 51-й слот, если планета входит в rows или не имеет координат', () => {
    const list = rows(2);
    const galaxy = galaxyFor([{ planetId: 'planet-1' }, { planetId: 'planet-2' }]);

    const inside = buildLeaderSlots({ rows: list, galaxy, selectedPlanetId: 'planet-2' });
    const missing = buildLeaderSlots({ rows: list, galaxy, selectedPlanetId: 'unknown' });

    expect(inside[SELECTED_SLOT_INDEX]?.visible).toBe(false);
    expect(missing[SELECTED_SLOT_INDEX]?.visible).toBe(false);
  });
});
