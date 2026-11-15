import { buildPlanetStyle, computeRotation } from '@exo/shared';

import type { PlanetDetail } from '../../../workers/protocol';
import type { SimClock } from '../SimClock';
import type { PlanetVisualHandle, SpinController } from '../visuals/types';
import { registerSpinProvider } from '../visuals/registry';
import { createSpinController } from './spinController';

/**
 * Провайдер вращения планеты (задача 26; п. 9.3, 11.5; U53–U55).
 *
 * Регистрируется в реестре задачи 25. Для заглушки (`gaps.planetStub`)
 * возвращает null: вращать нечего. Для обычной планеты строит модель
 * `computeRotation` и контроллер.
 */

/**
 * Создаёт контроллер для планеты.
 *
 * @param handle Построенная планета.
 * @param detail Деталь планеты.
 * @param sim Часы сцены.
 */
export function planetSpinProvider(
  handle: PlanetVisualHandle,
  detail: PlanetDetail,
  sim: SimClock,
): SpinController | null {
  if (detail.gaps?.planetStub === true) return null;

  const style = buildPlanetStyle(detail);
  const spec = computeRotation(detail.resolved, style);

  return createSpinController(handle, spec, sim);
}

/** Псевдоним по имени файла. */
export const spinProvider = planetSpinProvider;

/** Провайдер зарегистрирован при импорте модуля (задача 26). */
export const unregisterSpinProvider = registerSpinProvider(planetSpinProvider);
