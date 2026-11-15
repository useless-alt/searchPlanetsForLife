import type {
  AtmosphereHints,
  ModelSettings,
  PlanetStyle,
  ScaleModel,
  StarStyle,
} from '@exo/shared';
import type * as THREE from 'three';

import type { QualityLevel } from '../../host/quality';
import type { PlanetDetail } from '../../../workers/protocol';
import type { SimClock } from '../SimClock';
import type { SystemContext } from '../runtime';

/**
 * Контракты визуальных объектов сцены системы (задача 25; п. 9.1, 9.3).
 *
 * Задачи 26 и 27 используют точки подключения `SpinController`,
 * `registerStubFactory` и `setHints`: контракты фиксируют форму объектов,
 * чтобы фабрики, сцена и будущие задачи не расходились.
 */

/** Вид объекта сцены. */
export type VisualKind = 'star' | 'planet';

/** Контекст фабрики визуального объекта. */
export interface VisualCtx {
  /** Деталь планеты: разрешённые параметры, класс мира, пробелы. */
  detail: PlanetDetail;
  /** Модель масштаба сцены (задача 22). */
  scale: ScaleModel;
  /** Текущий профиль качества. */
  quality: QualityLevel;
  /** Готовый стиль звезды или планеты; null — заглушка. */
  style: StarStyle | PlanetStyle | null;
  /** Настройки модели. */
  settings: ModelSettings;
}

/**
 * Контекст шага вращения (задача 26).
 *
 * Поля необязательны, чтобы задачи 26–27 могли расширять контекст, не
 * ломая уже написанные контроллеры.
 */
export interface SpinCtx {
  /** Контекст сцены системы. */
  scene?: SystemContext;
  /** Время сцены [с]. */
  timeSec?: number;
  /** Прошедшие модельные сутки орбиты. */
  simDays?: number;
}

/** Контроллер вращения/дрейфа, который подключает задача 26. */
export interface SpinController {
  /** Шаг анимации. */
  update(dtSec: number, ctx: SpinCtx): void;
  /** Сброс в начальную фазу. */
  reset(): void;
  /** Освобождение ресурсов контроллера. */
  dispose(): void;
}

/** Общая часть визуального объекта. */
export interface VisualHandleBase {
  /** Корневой объект, который добавляется в сцену. */
  root: THREE.Object3D;
  /** Псевдоним `root` для совместимости с задачей 22. */
  object: THREE.Object3D;
  /** Освобождение ресурсов объекта. */
  dispose(): void;
}

/** Живой визуальный объект звезды. */
export interface StarVisualHandle extends VisualHandleBase {
  /** Корень звезды. */
  root: THREE.Object3D;
  /** Смена профиля качества без пересоздания геометрии. */
  setQuality(quality: QualityLevel): void;
  /** Шаг анимации: время процедурного шума. */
  update(dtSec: number, timeSec: number): void;
}

/** Живой визуальный объект планеты. */
export interface PlanetVisualHandle extends VisualHandleBase {
  /** Корень планеты; позицию задаёт `SystemScene`. */
  root: THREE.Group;
  /** Группа оси; наклон и вращение задаёт задача 26. */
  axisGroup: THREE.Group;
  /** Меш поверхности. */
  surface: THREE.Mesh;
  /** Облака; null — у класса их нет. */
  clouds: THREE.Mesh | null;
  /** Атмосфера; null — нет. */
  atmosphere: THREE.Mesh | null;
  /** Положение и цвет звезды для освещения. */
  setSunState(sunWorldPos: THREE.Vector3, sunColor: [number, number, number]): void;
  /** Смена профиля качества без пересоздания геометрии. */
  setQuality(quality: QualityLevel): void;
  /** Подсказки об атмосфере (задача 28). */
  setHints(hints: AtmosphereHints | null): void;
  /** Подключение контроллера вращения (задача 26). */
  attachSpin(controller: SpinController | null): void;
  /** Шаг анимации. */
  update(dtSec: number, ctx: SpinCtx): void;
}

/** Совместимый псевдоним для кода задачи 22. */
export type VisualInstance = StarVisualHandle | PlanetVisualHandle;

/** Фабрика визуального объекта. */
export type VisualFactory = (ctx: VisualCtx) => StarVisualHandle | PlanetVisualHandle;

/** Фабрика заглушки (задача 27). */
export type StubFactory = (ctx: VisualCtx) => StarVisualHandle | PlanetVisualHandle;

/** Поставщик контроллера вращения (задача 26). */
export type SpinProvider = (
  handle: PlanetVisualHandle,
  detail: PlanetDetail,
  sim: SimClock,
) => SpinController | null;

/**
 * Входные данные `createVisual`: контекст сцены задачи 22 либо полный
 * `VisualCtx`. Качество и стиль при необходимости вычисляются реестром.
 */
export interface VisualCtxInput extends Omit<VisualCtx, 'quality' | 'style'> {
  /** Профиль качества; по умолчанию — текущий монитор. */
  quality?: QualityLevel;
  /** Готовый стиль; по умолчанию вычисляется фабрикой. */
  style?: StarStyle | PlanetStyle | null;
}
