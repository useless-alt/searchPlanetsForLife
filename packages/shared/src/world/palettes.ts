/**
 * Палитры процедурных миров (задача 25; п. 9.3; U51).
 *
 * Это единственное место с цветами планет вне `tokens.css`: шейдеры и
 * `worldStyle.ts` берут цвета только отсюда. Значения — художественное
 * решение исполнителя в рамках U51 (фотографических текстур в источниках
 * нет), поэтому подобраны так, чтобы соседние миры различались тоном, а не
 * только яркостью.
 */

/** Ключ палитры. */
export type PaletteKey =
  | 'earthlike'
  | 'ice'
  | 'desert'
  | 'lava'
  | 'miniNeptuneCold'
  | 'miniNeptuneWarm'
  | 'gasGiantCold'
  | 'gasGiantMedium'
  | 'gasGiantHot';

/** Набор цветов одного класса миров. */
export interface Palette {
  /** Основные тона поверхности (для газовых гигантов — полосы). */
  readonly surface: readonly string[];
  /** Псевдоним `surface`: суша/кора в терминах таблицы задачи 25. */
  readonly land: readonly string[];
  /** Цвет океана; null — воды нет. */
  readonly ocean: string | null;
  /** Цвет полярных шапок; null — шапок нет. */
  readonly ice: string | null;
  /** Цвета свечения: лава, горячий газовый гигант. */
  readonly glow: readonly string[];
  /** Цвет атмосферы (совпадает с `PlanetStyle.atmosphere.color`). */
  readonly atmosphere: string;
  /** Плотность атмосферы для шейдера, 0…1 (художественное решение U51). */
  readonly density: number;
  /** Все цвета палитры в порядке таблицы — удобно для галереи и тестов. */
  readonly colors: readonly string[];
}

/** Собирает палитру и плоский список цветов без повторов. */
function makePalette(input: {
  surface: readonly string[];
  ocean?: string | null;
  ice?: string | null;
  glow?: readonly string[];
  atmosphere: string;
  density: number;
}): Palette {
  const ocean = input.ocean ?? null;
  const ice = input.ice ?? null;
  const glow = input.glow ?? [];
  const colors: string[] = [];

  for (const color of [...input.surface, ocean, ice, ...glow, input.atmosphere]) {
    if (color !== null && !colors.includes(color)) colors.push(color);
  }

  return {
    surface: [...input.surface],
    land: [...input.surface],
    ocean,
    ice,
    glow: [...glow],
    atmosphere: input.atmosphere,
    density: input.density,
    colors,
  };
}

/** Палитры по ключам (цвета — из таблицы задачи 25). */
export const PALETTES: Readonly<Record<PaletteKey, Palette>> = {
  earthlike: makePalette({
    surface: ['#4f7a3c', '#8a7a4f', '#c9c3b0'],
    ocean: '#0b3d6b',
    ice: '#eef4f8',
    atmosphere: '#5ea8ff',
    density: 0.55,
  }),
  ice: makePalette({
    surface: ['#cfe3ee', '#9ec3d8', '#e9f3f8', '#6f9bb5'],
    ice: '#e9f3f8',
    atmosphere: '#bfe0ff',
    density: 0.25,
  }),
  desert: makePalette({
    surface: ['#c58a4d', '#a5632f', '#e3b87a', '#7a4a26'],
    atmosphere: '#e8b27a',
    density: 0.3,
  }),
  lava: makePalette({
    surface: ['#1a1210', '#2b1a14'],
    glow: ['#ff5a1f', '#ffb347'],
    atmosphere: '#ff6a2a',
    density: 0.8,
  }),
  miniNeptuneCold: makePalette({
    surface: ['#5a86b8', '#7aa6d1', '#a9c7e3'],
    atmosphere: '#7fc4ff',
    density: 0.75,
  }),
  miniNeptuneWarm: makePalette({
    surface: ['#4f9d9b', '#76bdb4', '#b7dcd2'],
    atmosphere: '#7fc4ff',
    density: 0.7,
  }),
  gasGiantCold: makePalette({
    surface: ['#e8dcc2', '#cdb892', '#f3ead6'],
    atmosphere: '#d9c8a8',
    density: 0.9,
  }),
  gasGiantMedium: makePalette({
    surface: ['#c28f5a', '#8e5d36', '#e0b98a'],
    atmosphere: '#d9c8a8',
    density: 0.9,
  }),
  gasGiantHot: makePalette({
    surface: ['#1b2147', '#2c3a7a', '#0b0f26'],
    glow: ['#ff7a3d'],
    atmosphere: '#6a7cff',
    density: 0.95,
  }),
};

/**
 * Возвращает палитру по ключу.
 *
 * @param key Ключ палитры.
 */
export function paletteOf(key: PaletteKey): Palette {
  return PALETTES[key];
}
