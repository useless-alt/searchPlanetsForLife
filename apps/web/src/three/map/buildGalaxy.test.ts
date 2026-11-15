import { beforeEach, describe, expect, it } from 'vitest';

import type { PlanetPosition } from '../../workers/protocol';
import { buildGalaxy, clearGalaxyCache, computeGalaxy, type GalaxyData } from './buildGalaxy';

/**
 * Тесты данных 3D-карты (задача 21; п. 6.1, 10.8; U44).
 *
 * Проверяются группировка планет одной звезды, отбрасывание планет без
 * координат, минимальный радиус обзора и кэш на снимок каталога.
 */

/** Позиция планеты с координатами центра Галактики по умолчанию. */
function position(overrides: Partial<PlanetPosition> & { id: string }): PlanetPosition {
  return {
    hostKey: 'star',
    ra: 266.405,
    dec: -28.936,
    dist_pc: 100,
    st_teff: 5772,
    ...overrides,
  };
}

describe('computeGalaxy', () => {
  it('объединяет две планеты одной звезды в одну систему', () => {
    const data = computeGalaxy('snapshot-1', [
      position({ id: 'planet-b' }),
      position({ id: 'planet-c' }),
    ]);

    expect(data.systems).toHaveLength(1);
    expect(data.systems[0]?.key).toBe('star');
    expect(data.systems[0]?.planetIds).toEqual(['planet-b', 'planet-c']);
    expect(data.systemIndexByPlanet.size).toBe(2);
    expect(data.systemIndexByPlanet.get('planet-b')).toBe(0);
    expect(data.systemIndexByPlanet.get('planet-c')).toBe(0);
    expect(data.unplaced).toEqual([]);
    expect(data.positions).toHaveLength(3);
    expect(data.colors).toHaveLength(3);
  });

  it('ставит систему на реальные координаты и сохраняет расстояние', () => {
    const data = computeGalaxy('snapshot-1', [position({ id: 'planet-b', dist_pc: 100 })]);
    const system = data.systems[0];

    expect(system).toBeDefined();
    if (system === undefined) return;

    expect(system.position.x).toBeCloseTo(100, 1);
    expect(system.position.y).toBeCloseTo(0, 1);
    expect(system.position.z).toBeCloseTo(0, 1);
    expect(Math.hypot(system.position.x, system.position.y, system.position.z)).toBeCloseTo(100, 1);
  });

  it('отправляет планеты без координат в unplaced и не индексирует их', () => {
    const data = computeGalaxy('snapshot-1', [
      position({ id: 'placed' }),
      position({ id: 'no-ra', ra: null }),
      position({ id: 'no-dec', dec: null }),
      position({ id: 'no-distance', dist_pc: null }),
      position({ id: 'zero-distance', dist_pc: 0 }),
    ]);

    expect(data.unplaced).toEqual(['no-ra', 'no-dec', 'no-distance', 'zero-distance']);
    expect(data.systemIndexByPlanet.has('placed')).toBe(true);
    expect(data.systemIndexByPlanet.has('no-ra')).toBe(false);
    expect(data.systemIndexByPlanet.has('zero-distance')).toBe(false);
    expect(data.systems).toHaveLength(1);
  });

  it('не объединяет планеты без имени звезды: ключом становится id', () => {
    const data = computeGalaxy('snapshot-1', [
      position({ id: 'one', hostKey: null }),
      position({ id: 'two', hostKey: null }),
    ]);

    expect(data.systems).toHaveLength(2);
    expect(data.systems.map((system) => system.key)).toEqual(['one', 'two']);
  });

  it('держит radiusP95 не меньше 50 пк даже при близких системах', () => {
    const data = computeGalaxy('snapshot-1', [position({ id: 'near', dist_pc: 1 })]);

    expect(data.radiusP95).toBeGreaterThanOrEqual(50);
    expect(data.radiusMax).toBeGreaterThanOrEqual(data.radiusP95);
  });

  it('считает 95-й процентиль расстояний систем', () => {
    const planets = Array.from({ length: 100 }, (_, index) =>
      position({
        id: `planet-${index}`,
        hostKey: `star-${index}`,
        dist_pc: index + 1,
      }),
    );
    const data = computeGalaxy('snapshot-1', planets);

    expect(data.radiusP95).toBeCloseTo(95, 0);
  });

  it('нормализует цвет и берёт серый для неизвестной температуры', () => {
    const data = computeGalaxy('snapshot-1', [
      position({ id: 'known', hostKey: 'known', st_teff: 5772 }),
      position({ id: 'unknown', hostKey: 'unknown', st_teff: null }),
    ]);

    const unknownRed = data.colors[3] ?? 0;
    const unknownGreen = data.colors[4] ?? 0;
    const unknownBlue = data.colors[5] ?? 0;

    expect(unknownRed).toBeCloseTo(0x8b / 255, 5);
    expect(unknownGreen).toBeCloseTo(0x8b / 255, 5);
    expect(unknownBlue).toBeCloseTo(0x8b / 255, 5);
    expect(unknownRed).toBeLessThan(1);
    expect(unknownRed).toBeGreaterThan(0);
  });
});

describe('buildGalaxy', () => {
  beforeEach(() => {
    clearGalaxyCache();
  });

  it('возвращает один и тот же объект для одного снимка', () => {
    const first = buildGalaxy('snapshot-1', [position({ id: 'planet-b' })]);
    const second = buildGalaxy('snapshot-1', [position({ id: 'planet-c' })]);

    expect(second).toBe(first);
  });

  it('пересчитывает данные при смене снимка', () => {
    const first: GalaxyData = buildGalaxy('snapshot-1', [position({ id: 'planet-b' })]);
    const second = buildGalaxy('snapshot-2', [position({ id: 'planet-c' })]);

    expect(second).not.toBe(first);
    expect(second.snapshotId).toBe('snapshot-2');
    expect(second.systems[0]?.planetIds).toEqual(['planet-c']);
  });
});
