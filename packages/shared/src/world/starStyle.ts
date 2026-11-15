import { teffToRGB } from '../galaxy/starColor';
import type { ResolvedPlanet } from '../types/solver';

/**
 * Стиль звезды для процедурного шейдера (задача 25; п. 9.1; U51).
 *
 * Цвет берётся из того же приближения чёрного тела, что и звёздный фон
 * карты Галактики (задача 21). Размер диска задаёт `scale.starRadius`
 * (задача 22), поэтому `st_rad` влияет только на зернистость.
 */

/** Тройка нормализованных каналов 0…1. */
export type RGBUnit = [number, number, number];

/** Готовый стиль звезды. */
export interface StarStyle {
  /** Цвет фотосферы, каналы 0…1. */
  color: RGBUnit;
  /** Цвет света, падающего на планету. */
  sunColor: RGBUnit;
  /** Яркость диска и света, 0.55…1.5. */
  brightness: number;
  /** Активность звезды, 0…1. */
  activity: number;
  /** Покрытие пятнами, 0…0.32. */
  spotCover: number;
  /** Коэффициент потемнения к краю. */
  limbU: number;
  /** Масштаб короны относительно радиуса звезды. */
  coronaScale: number;
  /** Частота грануляции. */
  granulation: number;
  /** Seed процедурной генерации. */
  seed: number;
}

/** Ограничивает значение диапазоном. */
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Линейно интерполирует канал. */
function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t;
}

/**
 * Строит стиль звезды по разрешённым параметрам и seed (п. 9.1; U51).
 *
 * @param resolved Разрешённые параметры планеты и звезды.
 * @param seed Seed процедурной генерации (обычно `fnv1a32(detail.id)`).
 */
export function buildStarStyle(
  resolved: Pick<ResolvedPlanet, 'L' | 'st_teff' | 'st_rad'>,
  seed: number,
): StarStyle {
  const rawTeff = resolved.st_teff?.value ?? null;
  const teff = rawTeff !== null ? rawTeff : 5800;
  const color = teffToRGB(rawTeff);
  const normalized: RGBUnit = [color.r / 255, color.g / 255, color.b / 255];

  // U51: свет на планете — белый, подкрашенный цветом звезды на 60 %.
  const sunColor: RGBUnit = [
    lerp(1, normalized[0], 0.6),
    lerp(1, normalized[1], 0.6),
    lerp(1, normalized[2], 0.6),
  ];

  const luminosity = resolved.L?.value ?? 1;
  const brightness =
    Number.isFinite(luminosity) && luminosity > 0
      ? clamp(0.85 + 0.2 * Math.log10(luminosity), 0.55, 1.5)
      : 0.55;
  const activity = clamp((4500 - teff) / 2200, 0, 1);
  const radius = resolved.st_rad?.value ?? 1;

  return {
    color: normalized,
    sunColor,
    brightness,
    activity,
    spotCover: 0.04 + 0.28 * activity,
    limbU: teff < 4000 ? 0.75 : teff < 6500 ? 0.6 : 0.45,
    coronaScale: 1.8 + 0.8 * activity,
    granulation: clamp(8 - 3 * Math.log10(Math.max(radius, 0.05)), 5, 12),
    seed,
  };
}
