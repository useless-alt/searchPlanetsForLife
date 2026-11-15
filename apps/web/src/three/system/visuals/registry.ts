import { buildPlanetStyle, buildStarStyle, fnv1a32 } from '@exo/shared';

import type { SimClock } from '../SimClock';
import { createPlanetPlaceholder, createStarPlaceholder } from '../placeholders';
import { qualityMonitor } from '../../host/quality';
import type {
  PlanetVisualHandle,
  SpinController,
  SpinProvider,
  StarVisualHandle,
  StubFactory,
  VisualCtx,
  VisualCtxInput,
  VisualFactory,
  VisualKind,
} from './types';

/**
 * Реестр фабрик визуализации звезды и планеты (задачи 22, 25; п. 9.1, 9.2).
 *
 * Задача 25 расширяет реестр тремя механизмами:
 * - `registerVisualFactory` — «настоящие» процедурные фабрики;
 * - `registerStubFactory` — заглушки задачи 27 (пока используется серая сфера);
 * - `registerSpinProvider` — контроллер вращения задачи 26.
 */

/** Зарегистрированные фабрики. */
const visualFactories = new Map<VisualKind, VisualFactory>();

/** Зарегистрированные фабрики заглушек. */
const stubFactories = new Map<VisualKind, StubFactory>();

/** Стек поставщиков вращения: последняя регистрация побеждает. */
const spinProviders: SpinProvider[] = [];

/** Заполняет контекст качеством и стилем, если их нет. */
function resolveContext(kind: VisualKind, input: VisualCtxInput): VisualCtx {
  const quality = input.quality ?? qualityMonitor.level;
  const style =
    input.style !== undefined
      ? input.style
      : kind === 'star'
        ? buildStarStyle(input.detail.resolved, fnv1a32(input.detail.id))
        : buildPlanetStyle(input.detail);

  return {
    detail: input.detail,
    scale: input.scale,
    settings: input.settings,
    quality,
    style,
  };
}

/**
 * Регистрирует фабрику визуализации.
 *
 * @param kind Звезда или планета.
 * @param factory Фабрика, получающая контекст визуала.
 * @returns Функция отмены регистрации.
 */
export function registerVisualFactory(kind: VisualKind, factory: VisualFactory): () => void {
  const previous = visualFactories.get(kind);

  visualFactories.set(kind, factory);

  return () => {
    if (visualFactories.get(kind) !== factory) return;

    if (previous === undefined) {
      visualFactories.delete(kind);
    } else {
      visualFactories.set(kind, previous);
    }
  };
}

/**
 * Регистрирует фабрику заглушки (задача 27).
 *
 * @param kind Звезда или планета.
 * @param factory Фабрика заглушки.
 * @returns Функция отмены регистрации.
 */
export function registerStubFactory(kind: VisualKind, factory: StubFactory): () => void {
  const previous = stubFactories.get(kind);

  stubFactories.set(kind, factory);

  return () => {
    if (stubFactories.get(kind) !== factory) return;

    if (previous === undefined) {
      stubFactories.delete(kind);
    } else {
      stubFactories.set(kind, previous);
    }
  };
}

/** Зарегистрированная фабрика заглушки. */
export function getStubFactory(kind: VisualKind): StubFactory | undefined {
  return stubFactories.get(kind);
}

/**
 * Регистрирует поставщика контроллера вращения (задача 26).
 *
 * @param provider Функция, создающая контроллер для построенной планеты.
 * @returns Функция отмены регистрации.
 */
export function registerSpinProvider(provider: SpinProvider): () => void {
  spinProviders.push(provider);

  return () => {
    const index = spinProviders.lastIndexOf(provider);

    if (index >= 0) spinProviders.splice(index, 1);
  };
}

/**
 * Создаёт контроллер вращения для планеты.
 *
 * @param handle Построенная планета.
 * @param detail Деталь планеты.
 * @param sim Часы анимации.
 * @returns Контроллер или null, если поставщики не зарегистрированы.
 */
export function createSpinController(
  handle: PlanetVisualHandle,
  detail: VisualCtx['detail'],
  sim: SimClock,
): SpinController | null {
  for (let index = spinProviders.length - 1; index >= 0; index -= 1) {
    const provider = spinProviders[index];

    if (provider === undefined) continue;
    const controller = provider(handle, detail, sim);

    if (controller !== null) return controller;
  }

  return null;
}

/**
 * Создаёт визуальный объект: зарегистрированную фабрику или заглушку.
 *
 * @param kind Звезда или планета.
 * @param ctx Контекст сцены или готовый `VisualCtx`.
 */
export function createVisual(kind: 'star', ctx: VisualCtxInput): StarVisualHandle;
export function createVisual(kind: 'planet', ctx: VisualCtxInput): PlanetVisualHandle;
export function createVisual(
  kind: VisualKind,
  ctx: VisualCtxInput,
): StarVisualHandle | PlanetVisualHandle {
  const visualCtx = resolveContext(kind, ctx);
  const factory = visualFactories.get(kind);

  if (factory !== undefined) return factory(visualCtx);

  const stub = stubFactories.get(kind);
  const stubbed =
    kind === 'star'
      ? visualCtx.detail.gaps?.starStub === true
      : visualCtx.detail.gaps?.planetStub === true;

  if (stubbed && stub !== undefined) return stub(visualCtx);

  return kind === 'star' ? createStarPlaceholder(visualCtx) : createPlanetPlaceholder(visualCtx);
}

/** Зарегистрированная фабрика или undefined. */
export function getVisualFactory(kind: VisualKind): VisualFactory | undefined {
  return visualFactories.get(kind);
}

/** Убирает фабрики, заглушки и поставщиков вращения (для тестов). */
export function resetVisualFactories(): void {
  visualFactories.clear();
  stubFactories.clear();
  spinProviders.length = 0;
}

/** Убирает все фабрики заглушек (для тестов). */
export function resetStubFactories(): void {
  stubFactories.clear();
}

/** Убирает всех поставщиков вращения (для тестов). */
export function resetSpinProviders(): void {
  spinProviders.length = 0;
}
