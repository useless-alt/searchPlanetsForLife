import type { ResolvedPlanet } from '../types/solver';

/**
 * Пробелы данных для отрисовки (задача 19; п. 9.2).
 *
 * Функция переиспользуется карточкой планеты (задача 19), 3D-сценой
 * (задача 22) и заглушкой (задача 27): список отсутствующих ключей должен
 * совпадать во всех местах.
 */
export interface RenderGaps {
  /** Отсутствующие ключевые параметры планеты: `R`, `T_eq`. */
  planet: string[];
  /** Отсутствующие параметры звезды: `st_teff`, `L_or_st_rad`. */
  star: string[];
  /** Планета рисуется заглушкой: мало данных или нет размера/температуры. */
  planetStub: boolean;
  /** Звезда рисуется заглушкой: нет температуры или светимости/радиуса. */
  starStub: boolean;
}

/**
 * Собирает пробелы данных планеты и звезды (п. 9.2).
 *
 * `planetStub` учитывает не только размер и температуру, но и флаг
 * `insufficient_data`: заглушка рисуется и тогда, когда индекс посчитать
 * не из чего. `L_or_st_rad` появляется, только если отсутствуют оба
 * параметра сразу: по любому из них светимость восстанавливается на
 * Уровне А.
 */
export function renderGaps(planet: ResolvedPlanet): RenderGaps {
  const planetKeys: string[] = [];

  if (planet.R.value === null) planetKeys.push('R');
  if (planet.T_eq.value === null) planetKeys.push('T_eq');

  const starKeys: string[] = [];

  if (planet.st_teff.value === null) starKeys.push('st_teff');
  if (planet.L.value === null && planet.st_rad.value === null) starKeys.push('L_or_st_rad');

  return {
    planet: planetKeys,
    star: starKeys,
    planetStub: planet.flags.insufficient_data || planetKeys.length > 0,
    starStub: starKeys.length > 0,
  };
}
