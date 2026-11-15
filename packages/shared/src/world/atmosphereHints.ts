import type { Palette } from './palettes';
import type { PlanetStyle } from './worldStyle';

/**
 * Подсказки об атмосфере из Exo.MAST (задача 25; п. 9.1, 9.3; U52).
 *
 * До задачи 28 ключи Exo.MAST не верифицированы (U26), поэтому механизм
 * вызывается только с явно переданными молекулами. Неизвестные молекулы
 * игнорируются: стиль остаётся прежним.
 */

/** Подсказки об атмосфере. */
export interface AtmosphereHints {
  /** Список молекул, например `['H2O', 'CH4']`. */
  molecules: string[];
}

/** Цвет, к которому тянет метан (U52). */
export const METHANE_TINT = '#4fb8c8';

/** Доля смещения палитры к метановому тону. */
export const METHANE_TINT_STRENGTH = 0.25;

/** Прибавка облачности от воды. */
export const WATER_CLOUD_BONUS = 0.1;

/** Максимальное покрытие облаками после подсказки. */
export const MAX_CLOUD_COVER = 0.9;

/** Классы с облаками для правила H₂O. */
const CLOUDY_KINDS: ReadonlySet<PlanetStyle['kind']> = new Set(['earthlike', 'ice', 'desert']);

/** Классы, на которые действует метан. */
const METHANE_KINDS: ReadonlySet<PlanetStyle['kind']> = new Set(['mini_neptune', 'gas_giant']);

/** Нормализует формулу молекулы: подстрочные цифры и регистр. */
function normalizeMolecule(molecule: string): string {
  return molecule
    .replace(/\u2080/g, '0')
    .replace(/\u2081/g, '1')
    .replace(/\u2082/g, '2')
    .replace(/\u2083/g, '3')
    .replace(/\u2084/g, '4')
    .replace(/\u2085/g, '5')
    .replace(/\u2086/g, '6')
    .replace(/\u2087/g, '7')
    .replace(/\u2088/g, '8')
    .replace(/\u2089/g, '9')
    .replace(/\s+/g, '')
    .toLowerCase();
}

/** Разбирает `#rrggbb` в каналы 0…255. */
function parseHex(color: string): [number, number, number] | null {
  const match = /^#([0-9a-f]{6})$/i.exec(color.trim());

  if (match === null) return null;

  const value = match[1];
  if (value === undefined) return null;

  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16),
  ];
}

/** Собирает `#rrggbb` из каналов. */
function toHex(channels: readonly number[]): string {
  return `#${channels
    .map((channel) =>
      Math.round(Math.min(255, Math.max(0, channel)))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

/**
 * Смещает цвет к метановому тону на 25 %.
 *
 * @param color Исходный `#rrggbb`.
 * @param target Цвет-цель.
 * @param amount Доля смещения 0…1.
 */
export function tintHex(
  color: string,
  target = METHANE_TINT,
  amount = METHANE_TINT_STRENGTH,
): string {
  const from = parseHex(color);
  const to = parseHex(target);

  if (from === null || to === null) return color;

  return toHex([
    from[0] + (to[0] - from[0]) * amount,
    from[1] + (to[1] - from[1]) * amount,
    from[2] + (to[2] - from[2]) * amount,
  ]);
}

/** Смещает всю палитру к метановому тону, сохраняя структуру. */
function tintPalette(palette: Palette): Palette {
  const surface = palette.surface.map((color) => tintHex(color));
  const ocean = palette.ocean === null ? null : tintHex(palette.ocean);
  const ice = palette.ice === null ? null : tintHex(palette.ice);
  const glow = palette.glow.map((color) => tintHex(color));
  const atmosphere = tintHex(palette.atmosphere);
  const colors: string[] = [];

  for (const color of [...surface, ocean, ice, ...glow, atmosphere]) {
    if (color !== null && !colors.includes(color)) colors.push(color);
  }

  return {
    surface,
    land: surface,
    ocean,
    ice,
    glow,
    atmosphere,
    density: palette.density,
    colors,
  };
}

/**
 * Применяет подсказки об атмосфере к стилю планеты (U52).
 *
 * - H₂O (регистр и подстрочная цифра не важны) добавляет +0.10 к облакам
 *   у землеподобного, ледяного и пустынного классов, но не выше 0.9.
 * - CH₄ сдвигает палитру мини-нептуна и газового гиганта на 25 % к
 *   `#4fb8c8`.
 * - `null` возвращает исходный стиль; остальные молекулы игнорируются.
 *
 * @param style Стиль планеты.
 * @param hints Подсказки или null.
 * @returns Новый объект стиля; исходный не изменяется.
 */
export function applyHints(style: PlanetStyle, hints: AtmosphereHints | null): PlanetStyle {
  if (hints === null) return style;

  const molecules = new Set(hints.molecules.map(normalizeMolecule));
  let next: PlanetStyle = { ...style };

  if (molecules.has('h2o') && CLOUDY_KINDS.has(style.kind)) {
    next.cloudCover = Math.min(MAX_CLOUD_COVER, next.cloudCover + WATER_CLOUD_BONUS);
  }

  if (molecules.has('ch4') && METHANE_KINDS.has(style.kind)) {
    const palette = tintPalette(next.palette);

    next = {
      ...next,
      palette,
      atmosphere: { ...next.atmosphere, color: palette.atmosphere },
    };
  }

  return next;
}
