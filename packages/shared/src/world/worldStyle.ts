import type { ResolvedPlanet } from '../types/solver';

import { planetSurfaceTemperature, type WorldClass } from './classify';
import { createSeededRandom, fnv1a32 } from './hash';
import { paletteOf, type Palette, type PaletteKey } from './palettes';

/**
 * Стиль планеты для процедурного шейдера (задача 25; п. 9.3; U41, U51).
 *
 * Все числа — художественные решения исполнителя в рамках U51: ТЗ задаёт
 * классы миров и палитры, но не коэффициенты. Функция детерминирована:
 * один и тот же `detail.id` всегда даёт один и тот же стиль.
 */

/** Класс мира, для которого строится процедурная планета. */
export type PlanetStyleKind = Exclude<WorldClass, 'unknown'>;

/** Минимальные входные данные: деталь планеты без импорта web-типов. */
export interface PlanetStyleInput {
  /** Стабильный идентификатор планеты (U17). */
  id: string;
  /** Класс мира (задача 19; U41). */
  world: WorldClass;
  /** Пробелы данных: `planetStub` означает заглушку задачи 27. */
  gaps: { planetStub: boolean };
  /** Разрешённые параметры. */
  resolved: ResolvedPlanet;
}

/** Полосы газовых и мини-нептуновых миров. */
export interface PlanetBands {
  /** Число полос. */
  count: number;
  /** Контраст полос, 0…1. */
  contrast: number;
}

/** Параметры атмосферы для шейдера. */
export interface PlanetAtmosphereStyle {
  /** Цвет атмосферы (из палитры). */
  color: string;
  /** Толщина оболочки относительно радиуса планеты. */
  thickness: number;
  /** Плотность для непрозрачности, 0…1. */
  density: number;
}

/** Готовый стиль планеты. */
export interface PlanetStyle {
  /** Класс мира. */
  kind: PlanetStyleKind;
  /** Seed процедурной генерации. */
  seed: number;
  /** Температура поверхности [K]. */
  T_s: number;
  /** Ускорение свободного падения в земных g. */
  g: number;
  /** Палитра поверхности и атмосферы. */
  palette: Palette;
  /** Доля поверхности, занятая океаном, 0…1. */
  oceanFraction: number;
  /** Уровень моря на кривой fbm. */
  seaLevel: number;
  /** Доля широты, занятая полярными шапками, 0…1. */
  iceCapExtent: number;
  /** Покрытие облаками, 0…1. */
  cloudCover: number;
  /** Атмосфера. */
  atmosphere: PlanetAtmosphereStyle;
  /** Амплитуда рельефа. */
  terrainAmp: number;
  /** Свечение лавы, 0…1. */
  lavaGlow: number;
  /** Полосы; null — у класса их нет. */
  bands: PlanetBands | null;
  /** Сила зеркального блика, 0…1. */
  specular: number;
}

/**
 * Распределение высот fbm, шаг 0.01 (101 точка).
 *
 * Симметричная кривая с медианой 0.5: по ней подбирается `seaLevel` так,
 * чтобы доля поверхности ниже уровня моря точно равнялась `oceanFraction`.
 */
export const FBM_HEIGHT_CDF: readonly number[] = [
  0.02, 0.0353, 0.0503, 0.0652, 0.0799, 0.0945, 0.1088, 0.1229, 0.1368, 0.1506, 0.1641, 0.1775,
  0.1906, 0.2035, 0.2162, 0.2287, 0.241, 0.2531, 0.265, 0.2766, 0.288, 0.2992, 0.3102, 0.3209,
  0.3314, 0.3417, 0.3517, 0.3614, 0.3709, 0.3802, 0.3892, 0.3979, 0.4064, 0.4146, 0.4225, 0.4301,
  0.4374, 0.4444, 0.4511, 0.4574, 0.4634, 0.4691, 0.4744, 0.4793, 0.4839, 0.4879, 0.4916, 0.4947,
  0.4972, 0.4991, 0.5, 0.5009, 0.5028, 0.5053, 0.5084, 0.5121, 0.5161, 0.5207, 0.5256, 0.5309,
  0.5366, 0.5426, 0.5489, 0.5556, 0.5626, 0.5699, 0.5775, 0.5854, 0.5936, 0.6021, 0.6108, 0.6198,
  0.6291, 0.6386, 0.6483, 0.6583, 0.6686, 0.6791, 0.6898, 0.7008, 0.712, 0.7234, 0.735, 0.7469,
  0.759, 0.7713, 0.7838, 0.7965, 0.8094, 0.8225, 0.8359, 0.8494, 0.8632, 0.8771, 0.8912, 0.9055,
  0.9201, 0.9348, 0.9497, 0.9647, 0.98,
];

/** Ограничивает значение диапазоном. */
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Проверяет конечность положительного числа. */
function positiveOr(value: number | null, fallback: number): number {
  return value !== null && Number.isFinite(value) && value > 0 ? value : fallback;
}

/**
 * Уровень моря, при котором доля поверхности ниже него равна `oceanFraction`.
 *
 * @param oceanFraction Доля океана, 0…1.
 */
export function seaLevelForOceanFraction(oceanFraction: number): number {
  const fraction = clamp(Number.isFinite(oceanFraction) ? oceanFraction : 0, 0, 1);
  const index = clamp(
    Math.round(fraction * (FBM_HEIGHT_CDF.length - 1)),
    0,
    FBM_HEIGHT_CDF.length - 1,
  );

  return FBM_HEIGHT_CDF[index] ?? 0.5;
}

/** Толщина атмосферы скального мира. */
function rockyAtmosphereThickness(T_s: number, g: number): number {
  return clamp((0.012 * (T_s / 288)) / Math.max(g, 1e-6), 0.006, 0.04);
}

/** Палитра мини-нептуна по равновесной температуре. */
function miniNeptunePalette(T_eq: number): PaletteKey {
  return T_eq < 250 ? 'miniNeptuneCold' : 'miniNeptuneWarm';
}

/** Палитра газового гиганта по равновесной температуре. */
function gasGiantPalette(T_eq: number): PaletteKey {
  if (T_eq < 200) return 'gasGiantCold';
  if (T_eq <= 1000) return 'gasGiantMedium';

  return 'gasGiantHot';
}

/**
 * Собирает стиль планеты из уже рассчитанных данных (п. 9.3; U51).
 *
 * Возвращает null, если данных мало (`unknown`) или включена заглушка
 * задачи 27 (`gaps.planetStub`). Никаких новых запросов не выполняется.
 *
 * @param detail Деталь планеты (класс, пробелы, разрешённые параметры).
 */
export function buildPlanetStyle(detail: PlanetStyleInput): PlanetStyle | null {
  if (!detail.world || detail.world === 'unknown' || detail.gaps?.planetStub === true) return null;

  const kind: PlanetStyleKind = detail.world;
  const { resolved } = detail;
  const seed = fnv1a32(detail.id);

  const surface =
    resolved.T_eq?.value !== undefined && resolved.T_eq.value !== null
      ? planetSurfaceTemperature(resolved)
      : null;
  const T_s = surface !== null && Number.isFinite(surface) ? surface : 288;
  const equilibriumValue = resolved.T_eq?.value ?? null;
  const equilibrium = equilibriumValue ?? T_s - 33;

  const radius = positiveOr(resolved.R?.value ?? null, 1);
  const mass = positiveOr(resolved.M?.value ?? null, 1);
  const g = mass / (radius * radius);

  const oceanUnit = createSeededRandom(seed, 'ocean')();
  const cloudUnit = createSeededRandom(seed, 'clouds')();
  const bandUnit = createSeededRandom(seed, 'bands')();

  // Художественные коэффициенты U51: диапазоны из постановки задачи.
  const earthOceanFraction = 0.71 + 0.16 * (oceanUnit - 0.5);
  const earthCloudCover = 0.45 + 0.3 * (cloudUnit - 0.5);
  const iceCapFromTemperature = clamp((290 - T_s) / 60, 0, 1);
  const rockyTerrainAmp = clamp(0.5 / Math.max(g, 1e-6), 0.15, 0.6);

  const base = {
    seed,
    T_s,
    g,
    oceanFraction: 0,
    seaLevel: seaLevelForOceanFraction(0),
    iceCapExtent: 0,
    cloudCover: 0,
    terrainAmp: rockyTerrainAmp,
    lavaGlow: 0,
    bands: null as PlanetBands | null,
    specular: 0.1,
  } satisfies Omit<PlanetStyle, 'kind' | 'palette' | 'atmosphere'>;

  switch (kind) {
    case 'earthlike': {
      const oceanFraction = clamp(earthOceanFraction, 0, 1);

      return {
        ...base,
        kind,
        palette: paletteOf('earthlike'),
        oceanFraction,
        seaLevel: seaLevelForOceanFraction(oceanFraction),
        iceCapExtent: 0.08 + 0.55 * iceCapFromTemperature,
        cloudCover: clamp(earthCloudCover, 0.3, 0.6),
        atmosphere: {
          color: paletteOf('earthlike').atmosphere,
          thickness: rockyAtmosphereThickness(T_s, g),
          density: paletteOf('earthlike').density,
        },
        specular: 0.6,
      };
    }

    case 'ice': {
      const palette = paletteOf('ice');

      return {
        ...base,
        kind,
        palette,
        oceanFraction: 0,
        seaLevel: seaLevelForOceanFraction(0),
        iceCapExtent: 1,
        cloudCover: 0.1,
        atmosphere: {
          color: palette.atmosphere,
          thickness: rockyAtmosphereThickness(T_s, g),
          density: palette.density,
        },
        specular: 0.4,
      };
    }

    case 'desert': {
      const palette = paletteOf('desert');

      return {
        ...base,
        kind,
        palette,
        oceanFraction: 0,
        seaLevel: seaLevelForOceanFraction(0),
        iceCapExtent: 0,
        cloudCover: 0.08,
        atmosphere: {
          color: palette.atmosphere,
          thickness: rockyAtmosphereThickness(T_s, g),
          density: palette.density,
        },
        specular: 0.05,
      };
    }

    case 'lava': {
      const palette = paletteOf('lava');

      return {
        ...base,
        kind,
        palette,
        oceanFraction: 0,
        seaLevel: seaLevelForOceanFraction(0),
        iceCapExtent: 0,
        cloudCover: 0,
        atmosphere: {
          color: palette.atmosphere,
          thickness: rockyAtmosphereThickness(T_s, g),
          density: palette.density,
        },
        lavaGlow: clamp((T_s - 700) / 800, 0.25, 1),
        specular: 0.3,
      };
    }

    case 'mini_neptune': {
      const palette = paletteOf(miniNeptunePalette(equilibrium));

      return {
        ...base,
        kind,
        palette,
        terrainAmp: 0.12,
        cloudCover: 0.35,
        bands: { count: 5, contrast: 0.25 },
        atmosphere: { color: palette.atmosphere, thickness: 0.06, density: palette.density },
        specular: 0.14,
      };
    }

    case 'gas_giant': {
      const palette = paletteOf(gasGiantPalette(equilibrium));

      return {
        ...base,
        kind,
        palette,
        terrainAmp: 0.1,
        cloudCover: 0.55,
        bands: {
          count: 9 + Math.floor(5 * clamp(bandUnit, 0, 0.999999)),
          contrast: 0.45,
        },
        atmosphere: { color: palette.atmosphere, thickness: 0.03, density: palette.density },
        specular: 0.1,
      };
    }
  }
}
