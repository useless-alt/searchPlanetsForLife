/**
 * Цвет звезды по эффективной температуре (задача 21; п. 6.2).
 *
 * Приближение чёрного тела используется для звёздного фона 3D-карты
 * Галактики и позже переиспользуется сценой системы (задача 25).
 *
 * В `packages/shared` нет DOM: цвет неизвестной звезды задан числовой
 * константой, совпадающей с токеном `--map-star-unknown` из
 * `apps/web/src/styles/theme.ts`.
 */

/** Цвет в диапазоне каналов 0…255. */
export interface StarColor {
  /** Красный канал. */
  r: number;
  /** Зелёный канал. */
  g: number;
  /** Синий канал. */
  b: number;
}

/**
 * Нейтральный серый для звезды с неизвестной температурой.
 *
 * Совпадает с `--map-star-unknown` из `styles/theme.ts`. Отдельная строка
 * нужна, чтобы при смене токена было видно оба места.
 */
export const MAP_STAR_UNKNOWN_HEX = '#8b8b8b';

/** Нейтральный серый цвет звезды с неизвестной температурой (0…255). */
export const MAP_STAR_UNKNOWN_RGB: Readonly<StarColor> = {
  r: 0x8b,
  g: 0x8b,
  b: 0x8b,
};

/** Ограничивает значение канала диапазоном 0…255. */
function clampChannel(value: number): number {
  if (value < 0) return 0;
  if (value > 255) return 255;

  return value;
}

/**
 * Приближение цвета чёрного тела по температуре (п. 6.2).
 *
 * Формулы заданы в ТЗ; температура клампится диапазоном 1000…40000 К.
 * При `null` или неконечном значении возвращается нейтральный серый.
 *
 * @param teffKelvin Эффективная температура звезды [К]; null — неизвестна.
 * @returns Цвет каналов 0…255 (дробные значения не округляются).
 */
export function teffToRGB(teffKelvin: number | null): StarColor {
  if (teffKelvin === null || !Number.isFinite(teffKelvin)) {
    return { ...MAP_STAR_UNKNOWN_RGB };
  }

  const t = Math.min(40000, Math.max(1000, teffKelvin)) / 100;

  const red = t <= 66 ? 255 : 329.698727446 * Math.pow(t - 60, -0.1332047592);

  const green =
    t <= 66
      ? 99.4708025861 * Math.log(t) - 161.1195681661
      : 288.1221695283 * Math.pow(t - 60, -0.0755148492);

  const blue = t >= 66 ? 255 : t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;

  return {
    r: clampChannel(red),
    g: clampChannel(green),
    b: clampChannel(blue),
  };
}

/**
 * Цвет звезды в нормализованном виде 0…1 — для атрибутов Three.js.
 *
 * @param teffKelvin Эффективная температура звезды [К]; null — неизвестна.
 * @returns Нормализованный цвет или серый для неизвестной температуры.
 */
export function teffToUnitRGB(teffKelvin: number | null): StarColor {
  const color = teffToRGB(teffKelvin);

  return {
    r: color.r / 255,
    g: color.g / 255,
    b: color.b / 255,
  };
}
