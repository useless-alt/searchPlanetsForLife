import type { Vec3 } from '@exo/shared';

import type { GalaxyData } from './buildGalaxy';

/**
 * Распределение 50 меток Топ-50 и 51-го слота выбранной планеты
 * (задача 21; п. 6.2, 10.8; U43).
 *
 * Функция чистая: она не зависит от текущей сортировки таблицы и не хранит
 * состояния. Слот `i` всегда показывает планету с рангом `i + 1`; несколько
 * лидеров одной системы разводятся по экрану на `k * 14 px` (п. 6.2).
 */

/** Число интерактивных меток лидеров (п. 6.2). */
export const LEADER_SLOT_COUNT = 50;

/** Ранги, подписи которых видны всегда (U43). */
export const LEADER_LABEL_RANK_LIMIT = 10;

/** Экранное смещение меток одной системы [px]. */
export const LEADER_OFFSET_PX = 14;

/** Индекс 51-го слота выбранной планеты. */
export const SELECTED_SLOT_INDEX = LEADER_SLOT_COUNT;

/** Минимальные данные строки Топ-50, нужные карте. */
export interface LeaderRow {
  /** Ранг планеты в текущем Топ-50 (1…50). */
  rank: number;
  /** Стабильный идентификатор планеты. */
  planetId: string;
}

/** Один слот метки на карте. */
export interface LeaderSlot {
  /** Индекс слота: 0…49 — лидеры, 50 — выбранная планета. */
  index: number;
  /** Ранг планеты в Топ-50; null — планета вне Топ-50. */
  rank: number | null;
  /** Идентификатор планеты; null — в слоте нет планеты. */
  planetId: string | null;
  /** Индекс системы в `GalaxyData.systems`; null — координат нет. */
  systemIndex: number | null;
  /** Позиция системы в сцене; null — метка не показывается. */
  position: Vec3 | null;
  /** Горизонтальное экранное смещение метки [px]. */
  offsetX: number;
  /** Метка видна (у планеты есть координаты). */
  visible: boolean;
  /** Подпись видна: ранг ≤ 10, выбранная или наведённая планета (U43). */
  labelVisible: boolean;
}

/** Входные данные раскладки меток. */
export interface LeaderSlotsInput {
  /** Строки Топ-50 в любом порядке: слоты берутся по рангу. */
  rows: readonly LeaderRow[];
  /** Данные карты: системы и индекс планеты → система. */
  galaxy: Pick<GalaxyData, 'systems' | 'systemIndexByPlanet'>;
  /** Выбранная планета; null — выбора нет. */
  selectedPlanetId?: string | null;
  /** Наведённая планета; null — наведения нет. */
  hoveredPlanetId?: string | null;
}

/** Пустой невидимый слот. */
function emptySlot(index: number): LeaderSlot {
  return {
    index,
    rank: null,
    planetId: null,
    systemIndex: null,
    position: null,
    offsetX: 0,
    visible: false,
    labelVisible: false,
  };
}

/**
 * Раскладывает лидеров по 50 слотам и добавляет 51-й слот выбранной планеты.
 *
 * @param input Строки Топ-50, данные карты, выбранная и наведённая планеты.
 * @returns Массив из 51 слота; невидимые слоты остаются в массиве.
 */
export function buildLeaderSlots(input: LeaderSlotsInput): LeaderSlot[] {
  const { rows, galaxy, selectedPlanetId = null, hoveredPlanetId = null } = input;
  const rowsByRank = new Map<number, LeaderRow>();

  for (const row of rows) {
    if (!rowsByRank.has(row.rank)) rowsByRank.set(row.rank, row);
  }

  // Сколько лидеров одной системы уже получили слот: k * 14 px.
  const offsetsBySystem = new Map<number, number>();
  const slots: LeaderSlot[] = [];

  for (let index = 0; index < LEADER_SLOT_COUNT; index += 1) {
    const rank = index + 1;
    const row = rowsByRank.get(rank);

    if (row === undefined) {
      slots.push(emptySlot(index));
      continue;
    }

    const systemIndex = galaxy.systemIndexByPlanet.get(row.planetId);
    const system = systemIndex === undefined ? undefined : galaxy.systems[systemIndex];
    const position = system?.position ?? null;
    const visible = position !== null;
    const offset =
      visible && systemIndex !== undefined ? (offsetsBySystem.get(systemIndex) ?? 0) : 0;

    if (visible && systemIndex !== undefined) {
      offsetsBySystem.set(systemIndex, offset + 1);
    }

    slots.push({
      index,
      rank,
      planetId: row.planetId,
      systemIndex: systemIndex ?? null,
      position,
      offsetX: offset * LEADER_OFFSET_PX,
      visible,
      labelVisible:
        visible &&
        (rank <= LEADER_LABEL_RANK_LIMIT ||
          row.planetId === selectedPlanetId ||
          row.planetId === hoveredPlanetId),
    });
  }

  // 51-й слот нужен только для планеты вне текущего Топ-50 (п. 6.2, U43).
  const selectedInRows =
    selectedPlanetId !== null && rows.some((row) => row.planetId === selectedPlanetId);
  const selectedSlot = emptySlot(SELECTED_SLOT_INDEX);

  if (selectedPlanetId !== null && !selectedInRows) {
    const systemIndex = galaxy.systemIndexByPlanet.get(selectedPlanetId);
    const system = systemIndex === undefined ? undefined : galaxy.systems[systemIndex];
    const position = system?.position ?? null;
    const visible = position !== null;
    const offset =
      visible && systemIndex !== undefined ? (offsetsBySystem.get(systemIndex) ?? 0) : 0;

    selectedSlot.planetId = selectedPlanetId;
    selectedSlot.systemIndex = systemIndex ?? null;
    selectedSlot.position = position;
    selectedSlot.offsetX = offset * LEADER_OFFSET_PX;
    selectedSlot.visible = visible;
    selectedSlot.labelVisible = visible;
  }

  slots.push(selectedSlot);

  return slots;
}

/** Псевдоним `buildLeaderSlots` для вызовов из React-вида карты. */
export const computeLeaderSlots = buildLeaderSlots;
