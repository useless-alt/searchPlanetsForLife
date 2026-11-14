import { COORD_TOLERANCE_ARCSEC, MERGE_GRID_CELL_DEG, MERGE_POLAR_DEC_DEG } from '@exo/shared';

/** Точка на небе в градусах. */
export interface SkyPoint {
  ra: number;
  dec: number;
}

/** Запись, которая может участвовать в пространственном поиске. */
export interface SpatialItem {
  ra: number | null;
  dec: number | null;
}

/** Уникальная пара индексов входного массива. */
export type SpatialPair = readonly [number, number];

const ARCSEC_PER_DEGREE = 3600;
const RA_CELL_COUNT = Math.round(360 / MERGE_GRID_CELL_DEG);
const TOLERANCE_DEG = COORD_TOLERANCE_ARCSEC / ARCSEC_PER_DEGREE;

/** Относительная разница |a−b| / max(|a|, |b|); для двух нулей равна нулю. */
export function relativeDifference(a: number, b: number): number {
  const scale = Math.max(Math.abs(a), Math.abs(b));
  return scale === 0 ? 0 : Math.abs(a - b) / scale;
}

/** RA в диапазоне [0, 360). */
function normalizeRa(ra: number): number {
  return ((ra % 360) + 360) % 360;
}

/** Кратчайшая разница RA в диапазоне [−180, 180). */
function raDelta(a: number, b: number): number {
  return normalizeRa(a - b + 180) - 180;
}

/** Угловое расстояние по формуле Δα·cos(δ_среднее), Δδ [″] (п. 7.2). */
export function angularSeparationArcsec(a: SkyPoint, b: SkyPoint): number {
  const meanDecRad = ((a.dec + b.dec) / 2) * (Math.PI / 180);
  const x = raDelta(a.ra, b.ra) * Math.cos(meanDecRad);
  const y = a.dec - b.dec;
  return Math.hypot(x, y) * ARCSEC_PER_DEGREE;
}

interface CellRecord {
  index: number;
  raCell: number;
  decCell: number;
}

function cellKey(raCell: number, decCell: number): string {
  return `${raCell}:${decCell}`;
}

/**
 * Возвращает кандидатские пары по сетке 0.01° с соседними ячейками и
 * оборачиванием RA. При |dec| > 85° просматривается вся полоса Dec без
 * разбиения по RA. Фактическое расстояние проверяется правилами R3/R4.
 */
export function findSpatialPairs(items: readonly SpatialItem[]): SpatialPair[] {
  const cells = new Map<string, number[]>();
  const decRows = new Map<number, number[]>();
  const located: Array<CellRecord | null> = items.map(() => null);

  items.forEach((item, index) => {
    if (item.ra === null || item.dec === null) return;
    if (!Number.isFinite(item.ra) || !Number.isFinite(item.dec)) return;

    const raCell = Math.floor(normalizeRa(item.ra) / MERGE_GRID_CELL_DEG) % RA_CELL_COUNT;
    const decCell = Math.floor(item.dec / MERGE_GRID_CELL_DEG);
    located[index] = { index, raCell, decCell };

    const key = cellKey(raCell, decCell);
    const cell = cells.get(key);
    if (cell) cell.push(index);
    else cells.set(key, [index]);

    const row = decRows.get(decCell);
    if (row) row.push(index);
    else decRows.set(decCell, [index]);
  });

  const pairs: SpatialPair[] = [];

  for (const current of located) {
    if (current === null) continue;
    const { index, raCell, decCell } = current;
    const item = items[index] as SpatialItem;
    const dec = item.dec as number;

    if (Math.abs(dec) > MERGE_POLAR_DEC_DEG) {
      for (let dy = -1; dy <= 1; dy += 1) {
        for (const other of decRows.get(decCell + dy) ?? []) {
          if (other > index) pairs.push([index, other]);
        }
      }
      continue;
    }

    // Вне полярного пояса соседних ячеек достаточно с учётом сжатия RA.
    const cosDec = Math.cos(dec * (Math.PI / 180));
    const raRadius = Math.max(1, Math.ceil(TOLERANCE_DEG / MERGE_GRID_CELL_DEG / cosDec));

    for (let dx = -raRadius; dx <= raRadius; dx += 1) {
      const neighborRa = (raCell + dx + RA_CELL_COUNT) % RA_CELL_COUNT;
      for (let dy = -1; dy <= 1; dy += 1) {
        const cell = cells.get(cellKey(neighborRa, decCell + dy));
        if (!cell) continue;
        for (const other of cell) {
          if (other > index) pairs.push([index, other]);
        }
      }
    }
  }

  pairs.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  return pairs;
}
