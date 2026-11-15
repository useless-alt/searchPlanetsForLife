import { orbitAvailability, positionAU, type OrbitPoint } from '@exo/shared';

import {
  registerMotionProvider,
  type MotionProviderFactory,
  type SystemContext,
  type SystemMotion,
} from '../runtime';

/**
 * Кеплеровское движение планеты (задача 23; п. 11.3; U46, U49).
 *
 * Фабрика регистрируется через `registerMotionProvider` и получает контекст
 * сцены. Положение считается той же функцией `positionAU`, что и контур
 * орбиты, с `a = d`, `e` и `P` из `sceneDetail.resolved`; в сцену координаты
 * переводит `SystemScene` через `scale.mapAU`. Начальная фаза — перицентр
 * (`simDays = 0`).
 *
 * Если орбита недоступна (нет большой полуоси, эксцентриситет вне `[0, 1)`
 * или расстояние условное), возвращается статичное движение задачи 22.
 */

/**
 * Создаёт кеплеровское движение для контекста сцены.
 *
 * @param ctx Контекст сцены.
 */
export function createKeplerMotion(ctx: SystemContext): SystemMotion {
  const resolved = ctx.detail.resolved;
  const availability = orbitAvailability(resolved, ctx.scale);
  const semiMajorAxis = resolved.d.value;

  if (!availability.available || semiMajorAxis === null) return ctx.motion;

  const eccentricity = resolved.e.value ?? 0;
  const period = resolved.P.value;

  return {
    positionAU(simDays: number): OrbitPoint {
      return positionAU(semiMajorAxis, eccentricity, simDays, period);
    },
  };
}

/** Фабрика движения для реестра задачи 22. */
export const keplerMotion: MotionProviderFactory = (ctx) => createKeplerMotion(ctx);

/** Регистрирует кеплеровское движение в реестре сцены. */
export const unregisterKeplerMotion = registerMotionProvider(keplerMotion);
