import type { ModelSettings, ScaleModel } from '@exo/shared';

import type { PlanetDetail } from '../../workers/protocol';
import { SimClock } from './SimClock';

/**
 * Контекст выполнения 3D-сцены системы и точка расширения движения
 * (задача 22; п. 9.1, 11.3; U46, U49).
 *
 * Сцена не знает, как именно планета движется по орбите: она вызывает
 * `motion.positionAU(simDays)`. По умолчанию планета статична в точке
 * `[d, 0, 0]`; задача 23 регистрирует кеплеровское движение через
 * `registerMotionProvider`.
 */

/** Координата в сцене или в астрономических единицах: `[x, y, z]`. */
export type Vec3Tuple = [number, number, number];

/** Цель камеры и выбора мышью. */
export type SceneTarget = 'planet' | 'star';

/** Поставщик положения планеты по модельным суткам. */
export interface SystemMotion {
  /**
   * Положение планеты [а.е.].
   *
   * @param simDays Прошедшие модельные сутки.
   */
  positionAU(simDays: number): Vec3Tuple;
}

/** Фабрика движения, получающая контекст сцены. */
export type MotionProviderFactory = (ctx: SystemContext) => SystemMotion;

/** Зарегистрированное движение или фабрика движения. */
export type MotionProviderSource = SystemMotion | MotionProviderFactory;

/** Переключатели слоёв сцены (U14). */
export interface SystemToggles {
  /** Показывать орбиту (задача 23). */
  showOrbit: boolean;
  /** Показывать зону обитаемости (задача 24). */
  showHz: boolean;
}

/** Полный контекст, доступный визуальным фабрикам и слоям. */
export interface SystemContext {
  /** Деталь планеты: разрешённые параметры, класс мира, зона обитаемости. */
  detail: PlanetDetail;
  /** Модель масштаба сцены. */
  scale: ScaleModel;
  /** Настройки модели (границы HZ, режим расчёта). */
  settings: ModelSettings;
  /** Текущее движение планеты. */
  motion: SystemMotion;
  /** Часы анимации орбиты. */
  sim: SimClock;
  /** Переключатели слоёв. */
  toggles: SystemToggles;
}

/** Умолчания переключателей: оба слоя включены. */
export const DEFAULT_SYSTEM_TOGGLES: SystemToggles = {
  showOrbit: true,
  showHz: true,
};

/** Стек зарегистрированных движений: последнее перекрывает предыдущие. */
const motionProviders: MotionProviderSource[] = [];

/**
 * Регистрирует движение планеты (задача 23).
 *
 * @param provider Движение или фабрика; последняя регистрация побеждает.
 * @returns Функция отмены регистрации.
 */
export function registerMotionProvider(provider: MotionProviderSource): () => void {
  motionProviders.push(provider);

  return () => {
    const index = motionProviders.lastIndexOf(provider);

    if (index >= 0) motionProviders.splice(index, 1);
  };
}

/** Убирает все зарегистрированные движения (для тестов). */
export function resetMotionProviders(): void {
  motionProviders.length = 0;
}

/**
 * Создаёт статичное движение в заданной точке.
 *
 * @param position Положение [а.е.].
 */
export function staticMotion(position: Vec3Tuple): SystemMotion {
  const fixed: Vec3Tuple = [position[0], position[1], position[2]];

  return {
    positionAU(): Vec3Tuple {
      return [fixed[0], fixed[1], fixed[2]];
    },
  };
}

/** Проверяет, что координата конечна. */
function finiteTuple(value: Vec3Tuple): Vec3Tuple {
  const [x, y, z] = value;

  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
    return [0, 0, 0];
  }

  return [x, y, z];
}

/** Оборачивает движение защитой от нечисловых координат. */
function safeMotion(motion: SystemMotion): SystemMotion {
  return {
    positionAU(simDays: number): Vec3Tuple {
      const value = motion.positionAU(Number.isFinite(simDays) ? simDays : 0);

      return finiteTuple(value);
    },
  };
}

/**
 * Создаёт движение по умолчанию с учётом зарегистрированных расширений.
 *
 * @param ctx Контекст без итогового движения.
 * @param defaultDistanceAU Расстояние по умолчанию [а.е.].
 */
export function createSystemMotion(ctx: SystemContext, defaultDistanceAU: number): SystemMotion {
  const fallback = staticMotion([defaultDistanceAU, 0, 0]);
  const provider = motionProviders[motionProviders.length - 1];

  if (provider === undefined) return safeMotion(fallback);

  if (typeof provider === 'function') {
    const produced = provider({ ...ctx, motion: fallback });

    return safeMotion(produced);
  }

  return safeMotion(provider);
}

/** Параметры создания контекста. */
export interface SystemContextOptions {
  /** Деталь планеты. */
  detail: PlanetDetail;
  /** Настройки модели. */
  settings: ModelSettings;
  /** Модель масштаба. */
  scale: ScaleModel;
  /** Часы; по умолчанию создаются по периоду планеты. */
  sim?: SimClock;
  /** Переключатели; по умолчанию оба включены. */
  toggles?: Partial<SystemToggles>;
  /** Явно заданное движение (перекрывает реестр). */
  motion?: SystemMotion;
}

/**
 * Собирает контекст сцены.
 *
 * @param options Деталь, настройки, масштаб и необязательные части.
 */
export function createSystemContext(options: SystemContextOptions): SystemContext {
  const { detail, settings, scale } = options;
  const sim = options.sim ?? new SimClock(detail.resolved.P.value);
  const context: SystemContext = {
    detail,
    settings,
    scale,
    sim,
    toggles: {
      showOrbit: options.toggles?.showOrbit ?? DEFAULT_SYSTEM_TOGGLES.showOrbit,
      showHz: options.toggles?.showHz ?? DEFAULT_SYSTEM_TOGGLES.showHz,
    },
    motion: staticMotion([detail.resolved.d.value ?? 1, 0, 0]),
  };

  context.motion = options.motion ?? createSystemMotion(context, detail.resolved.d.value ?? 1);

  return context;
}
