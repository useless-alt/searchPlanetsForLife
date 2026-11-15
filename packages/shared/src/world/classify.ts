import { surfaceTemperature } from '../ranking/filters';
import type { ResolvedPlanet } from '../types/solver';

import { WORLD_THRESHOLDS } from './thresholds';

/**
 * Класс мира для подписи карточки и отрисовки (задача 19; п. 9.3, U41).
 *
 * `unknown` — данных не хватает: нет радиуса или температуры поверхности.
 */
export type WorldClass =
  'earthlike' | 'ice' | 'desert' | 'lava' | 'mini_neptune' | 'gas_giant' | 'unknown';

/**
 * Температура поверхности T_s = T_eq + 33 K (п. 2.1).
 *
 * Используется та же функция, что в фильтрах T_s: карточка, фильтр и
 * классификация миров показывают одно число.
 */
export function planetSurfaceTemperature(planet: ResolvedPlanet): number | null {
  return surfaceTemperature(planet.T_eq.value);
}

/**
 * Классифицирует мир по радиусу и температуре поверхности (U41).
 *
 *   R = null                              → unknown
 *   R > 6 R⊕                              → gas_giant
 *   1.65 < R ≤ 6 R⊕                       → mini_neptune
 *   R ≤ 1.65 R⊕, T_s = null               → unknown
 *   R ≤ 1.65 R⊕, T_s < 230 K              → ice
 *   230 ≤ T_s ≤ 330 K                     → earthlike
 *   330 < T_s < 700 K                     → desert
 *   T_s ≥ 700 K                           → lava
 */
export function classifyWorld(planet: ResolvedPlanet): WorldClass {
  const radius = planet.R.value;

  if (radius === null || !Number.isFinite(radius)) return 'unknown';
  if (radius > WORLD_THRESHOLDS.gasGiantRadiusMin) return 'gas_giant';
  if (radius > WORLD_THRESHOLDS.rockyRadiusMax) return 'mini_neptune';

  const temperature = planetSurfaceTemperature(planet);

  if (temperature === null || !Number.isFinite(temperature)) return 'unknown';
  if (temperature < WORLD_THRESHOLDS.iceTemperatureMax) return 'ice';
  if (temperature <= WORLD_THRESHOLDS.earthlikeTemperatureMax) return 'earthlike';
  if (temperature < WORLD_THRESHOLDS.lavaTemperatureMin) return 'desert';

  return 'lava';
}
