import { icrsToScene, teffToUnitRGB, type Vec3 } from '@exo/shared';

import type { PlanetPosition } from '../../workers/protocol';

/**
 * Данные звёздного фона 3D-карты Галактики (задача 21; п. 6.1, 10.8; U44).
 *
 * Позиции и цвета вычисляются один раз на снимок каталога (`snapshotId`).
 * Смена режима, настроек модели или фильтров не пересчитывает карту: лидеры
 * лишь меняют состояние точек (п. 6.2). Планеты без `ra`, `dec` или `dist_pc`
 * не размещаются и попадают в `unplaced` (U44).
 */

/** Одна система на карте: все её планеты делят одну точку. */
export interface GalaxySystem {
  /** Ключ системы: нормализованное имя звезды или идентификатор планеты. */
  key: string;
  /** Идентификаторы планет, входящих в систему. */
  planetIds: string[];
  /** Позиция системы в сцене [пк]. */
  position: Vec3;
}

/** Готовые данные карты для одного снимка каталога. */
export interface GalaxyData {
  /** Идентификатор снимка каталога. */
  snapshotId: string;
  /** Системы в порядке первого появления размещённой планеты. */
  systems: GalaxySystem[];
  /** Координаты систем подряд: x0, y0, z0, x1, y1, z1, … */
  positions: Float32Array;
  /** Нормализованные цвета систем подряд: r0, g0, b0, r1, g1, b1, … */
  colors: Float32Array;
  /** Индекс системы в `systems` по идентификатору планеты. */
  systemIndexByPlanet: Map<string, number>;
  /** Планеты, которые не удалось разместить (U44). */
  unplaced: string[];
  /** 95-й процентиль расстояний систем [пк], не меньше 50 пк. */
  radiusP95: number;
  /** Наибольшее расстояние до системы [пк], не меньше `radiusP95`. */
  radiusMax: number;
}

/** Минимальный радиус обзора карты [пк]. */
const MIN_RADIUS_PC = 50;

/** Кэш последнего снимка: карта не пересчитывается при смене фильтров. */
let cached: { snapshotId: string; data: GalaxyData } | null = null;

/**
 * 95-й процентиль по методу ближайшего ранга.
 *
 * Пустой список даёт 0; вызывающий код поднимает результат до 50 пк.
 */
function percentile95(values: readonly number[]): number {
  if (values.length === 0) return 0;

  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(0.95 * sorted.length) - 1));

  return sorted[index] ?? 0;
}

/**
 * Считает данные карты без кэширования.
 *
 * @param snapshotId Идентификатор снимка каталога.
 * @param planets Позиции планет из воркера.
 * @returns Системы, буферы координат и цветов, индексы и радиусы обзора.
 */
export function computeGalaxy(snapshotId: string, planets: readonly PlanetPosition[]): GalaxyData {
  const systems: GalaxySystem[] = [];
  const systemIndexByKey = new Map<string, number>();
  const systemIndexByPlanet = new Map<string, number>();
  const unplaced: string[] = [];
  const positions: number[] = [];
  const colors: number[] = [];
  const distances: number[] = [];

  for (const planet of planets) {
    const scene = icrsToScene(planet.ra, planet.dec, planet.dist_pc);

    if (scene === null) {
      unplaced.push(planet.id);
      continue;
    }

    const hostKey = planet.hostKey === null || planet.hostKey === '' ? null : planet.hostKey;
    const key = hostKey ?? planet.id;
    const existing = systemIndexByKey.get(key);

    if (existing !== undefined) {
      const system = systems[existing];
      if (system !== undefined) system.planetIds.push(planet.id);
      systemIndexByPlanet.set(planet.id, existing);
      continue;
    }

    const index = systems.length;
    const color = teffToUnitRGB(planet.st_teff);

    systems.push({ key, planetIds: [planet.id], position: scene });
    systemIndexByKey.set(key, index);
    systemIndexByPlanet.set(planet.id, index);
    positions.push(scene.x, scene.y, scene.z);
    colors.push(color.r, color.g, color.b);
    distances.push(Math.hypot(scene.x, scene.y, scene.z));
  }

  const radiusP95 = Math.max(MIN_RADIUS_PC, percentile95(distances));
  let radiusMax = radiusP95;

  for (const distance of distances) {
    if (distance > radiusMax) radiusMax = distance;
  }

  return {
    snapshotId,
    systems,
    positions: new Float32Array(positions),
    colors: new Float32Array(colors),
    systemIndexByPlanet,
    unplaced,
    radiusP95,
    radiusMax,
  };
}

/**
 * Возвращает данные карты для снимка, вычисляя их только при его смене.
 *
 * Повторный вызов с тем же `snapshotId` возвращает тот же объект, поэтому
 * пересчёт настроек и фильтров не создаёт новых буферов (п. 6.1, 6.2).
 *
 * @param snapshotId Идентификатор снимка каталога.
 * @param planets Позиции планет из воркера.
 * @returns Кэшированные данные карты.
 */
export function buildGalaxy(snapshotId: string, planets: readonly PlanetPosition[]): GalaxyData {
  if (cached !== null && cached.snapshotId === snapshotId) return cached.data;

  const data = computeGalaxy(snapshotId, planets);
  cached = { snapshotId, data };

  return data;
}

/** Псевдоним `buildGalaxy` для явного имени данных в React-виде карты. */
export const buildGalaxyData = buildGalaxy;

/** Возвращает данные последнего построенного снимка или null. */
export function getGalaxyData(snapshotId: string): GalaxyData | null {
  return cached !== null && cached.snapshotId === snapshotId ? cached.data : null;
}

/** Сбрасывает кэш карты (например, при выходе из приложения или в тестах). */
export function clearGalaxyCache(): void {
  cached = null;
}
