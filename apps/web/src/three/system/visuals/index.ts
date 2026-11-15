import '../spin/spinProvider';
import '../stubs/stubFactories';
import { createPlanetPlaceholder, createStarPlaceholder } from '../placeholders';
import { createPlanetVisual } from './planetVisual';
import { createStarVisual } from './starVisual';
import { getStubFactory, registerVisualFactory } from './registry';
import type { PlanetVisualHandle, StarVisualHandle, VisualCtx } from './types';

export * from './atmosphereMesh';
export * from './cloudMesh';
export * from './planetVisual';
export * from './registry';
export * from './starVisual';
export * from './types';

/**
 * Фабрика звезды (задача 25; п. 9.1).
 *
 * Если данных звезды не хватает (`gaps.starStub`), используется
 * зарегистрированная заглушка задачи 27, иначе — сфера из `placeholders.ts`.
 *
 * @param ctx Контекст визуала.
 */
export function starFactory(ctx: VisualCtx): StarVisualHandle {
  if (ctx.detail.gaps?.starStub === true) {
    const stub = getStubFactory('star');

    return stub !== undefined ? (stub(ctx) as StarVisualHandle) : createStarPlaceholder(ctx);
  }

  return createStarVisual(ctx);
}

/**
 * Фабрика планеты (задача 25; п. 9.2, 9.3).
 *
 * Если включена заглушка (`gaps.planetStub`), используется зарегистрированная
 * заглушка задачи 27, иначе — серая сфера из `placeholders.ts`.
 *
 * @param ctx Контекст визуала.
 */
export function planetFactory(ctx: VisualCtx): PlanetVisualHandle {
  if (ctx.detail.gaps?.planetStub === true) {
    const stub = getStubFactory('planet');

    return stub !== undefined ? (stub(ctx) as PlanetVisualHandle) : createPlanetPlaceholder(ctx);
  }

  return createPlanetVisual(ctx);
}

/**
 * Регистрирует фабрики звезды и планеты задачи 25.
 *
 * @returns Функция отмены регистрации.
 */
export function registerDefaultVisuals(): () => void {
  const undoStar = registerVisualFactory('star', starFactory);
  const undoPlanet = registerVisualFactory('planet', planetFactory);

  return () => {
    undoPlanet();
    undoStar();
  };
}

/** Фабрики задачи 25 зарегистрированы при импорте. */
export const unregisterDefaultVisuals = registerDefaultVisuals();
