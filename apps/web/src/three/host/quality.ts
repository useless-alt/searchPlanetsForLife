/**
 * Профили качества 3D-сцены (задача 25; п. 9.1, 11.6; U51).
 *
 * Уровень выбирается один раз при старте и может только понижаться:
 * сегменты геометрии фиксируются при создании визуального объекта, поэтому
 * при понижении меняются только uniform-значения и видимость слоёв.
 * Повышения в рамках сессии нет — это защищает от «пилы» качества.
 */

/** Уровень качества. */
export type QualityLevel = 'high' | 'medium' | 'low';

/** Порядок уровней от лучшего к худшему. */
export const QUALITY_ORDER: readonly QualityLevel[] = ['high', 'medium', 'low'];

/** Профиль качества. */
export interface QualityProfile {
  /** Уровень. */
  level: QualityLevel;
  /** Сегменты сферы по широте/долготе. */
  sphereSegments: number;
  /** Октавы процедурного шума в шейдере. */
  noiseOctaves: number;
  /** Рельеф (bump) включён. */
  bump: boolean;
  /** Облака включены. */
  clouds: boolean;
  /** Число частиц пыли заглушки (задача 27). */
  dust: number;
}

/** Профили из таблицы задачи 25. */
export const QUALITY_PROFILES: Readonly<Record<QualityLevel, QualityProfile>> = {
  high: {
    level: 'high',
    sphereSegments: 96,
    noiseOctaves: 6,
    bump: true,
    clouds: true,
    dust: 2500,
  },
  medium: {
    level: 'medium',
    sphereSegments: 64,
    noiseOctaves: 5,
    bump: true,
    clouds: true,
    dust: 1500,
  },
  low: {
    level: 'low',
    sphereSegments: 40,
    noiseOctaves: 3,
    bump: false,
    clouds: false,
    dust: 600,
  },
};

/** Окно наблюдения за кадрами. */
export const QUALITY_WINDOW_FRAMES = 120;

/** Бюджет кадра: медиана выше него означает перегрузку [мс]. */
export const QUALITY_FRAME_BUDGET_MS = 24;

/** Окружение для выбора начального уровня (подменяется в тестах). */
export interface QualityEnvironment {
  /** Число аппаратных потоков. */
  hardwareConcurrency?: number | null;
  /** Плотность пикселей. */
  devicePixelRatio?: number | null;
}

/** Число потоков из глобального окружения. */
function detectedConcurrency(): number | undefined {
  if (typeof navigator === 'undefined') return undefined;

  const value = navigator.hardwareConcurrency;

  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/** Плотность пикселей из глобального окружения. */
function detectedPixelRatio(): number | undefined {
  if (typeof globalThis.devicePixelRatio === 'number') return globalThis.devicePixelRatio;
  if (typeof window !== 'undefined' && typeof window.devicePixelRatio === 'number') {
    return window.devicePixelRatio;
  }

  return undefined;
}

/**
 * Начальный уровень качества.
 *
 * `high` — не меньше 8 потоков и плотность пикселей не выше 2;
 * `medium` — не меньше 4 потоков; `low` — иначе.
 * Если `hardwareConcurrency` не определён, принимается `medium`.
 *
 * @param environment Подмена окружения (тесты); без аргумента — реальное.
 */
export function initialQuality(environment: QualityEnvironment = {}): QualityLevel {
  const concurrency =
    'hardwareConcurrency' in environment
      ? (environment.hardwareConcurrency ?? undefined)
      : detectedConcurrency();

  if (concurrency === undefined) return 'medium';

  const pixelRatio =
    'devicePixelRatio' in environment
      ? (environment.devicePixelRatio ?? 1)
      : (detectedPixelRatio() ?? 1);

  if (concurrency >= 8 && pixelRatio <= 2) return 'high';
  if (concurrency >= 4) return 'medium';

  return 'low';
}

/** Следующий (худший) уровень. */
export function lowerQuality(level: QualityLevel): QualityLevel {
  const index = QUALITY_ORDER.indexOf(level);

  return QUALITY_ORDER[Math.min(QUALITY_ORDER.length - 1, index + 1)] ?? 'low';
}

/** Подписчик на изменение качества. */
export type QualityListener = (level: QualityLevel, profile: QualityProfile) => void;

/**
 * Монитор кадров: понижает качество при устойчивой перегрузке.
 *
 * Медиана окна из 120 кадров выше 24 мс означает, что кадр не укладывается
 * в бюджет; уровень понижается на одну ступень, окно сбрасывается.
 * Повышения нет.
 */
export class QualityMonitor {
  /** Текущий уровень. */
  private current: QualityLevel;

  /** Длительности кадров в окне [мс]. */
  private frames: number[] = [];

  /** Подписчики. */
  private readonly listeners = new Set<QualityListener>();

  /**
   * @param initial Начальный уровень; по умолчанию `initialQuality()`.
   */
  constructor(initial: QualityLevel = initialQuality()) {
    this.current = initial;
  }

  /** Текущий уровень. */
  get level(): QualityLevel {
    return this.current;
  }

  /** Текущий профиль. */
  get profile(): QualityProfile {
    return QUALITY_PROFILES[this.current];
  }

  /** Размер окна наблюдения. */
  get windowSize(): number {
    return this.frames.length;
  }

  /**
   * Принудительно задаёт уровень (тесты, ручной выбор в галерее).
   *
   * @param level Новый уровень.
   */
  setLevel(level: QualityLevel): void {
    if (level === this.current) return;

    this.current = level;
    this.frames = [];
    this.emit();
  }

  /**
   * Учитывает длительность кадра.
   *
   * @param dtMs Время кадра [мс].
   * @returns Уровень после проверки окна.
   */
  onFrame(dtMs: number): QualityLevel {
    if (!Number.isFinite(dtMs) || dtMs <= 0) return this.current;

    this.frames.push(dtMs);

    if (this.frames.length > QUALITY_WINDOW_FRAMES) this.frames.shift();
    if (this.frames.length < QUALITY_WINDOW_FRAMES) return this.current;

    const median = medianOf(this.frames);

    if (median > QUALITY_FRAME_BUDGET_MS && this.current !== 'low') {
      this.current = lowerQuality(this.current);
      this.frames = [];
      this.emit();

      return this.current;
    }

    if (this.current === 'low') {
      this.frames = [];
    }

    return this.current;
  }

  /**
   * Подписка на понижение качества.
   *
   * @param listener Получает уровень и профиль.
   * @returns Функция отписки.
   */
  subscribe(listener: QualityListener): () => void {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Сбрасывает окно наблюдения. */
  reset(): void {
    this.frames = [];
  }

  /** Сообщает подписчикам о новом уровне. */
  private emit(): void {
    const profile = this.profile;

    for (const listener of [...this.listeners]) listener(this.current, profile);
  }
}

/** Медиана набора длительностей. */
function medianOf(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    const lower = sorted[middle - 1] ?? 0;
    const upper = sorted[middle] ?? 0;

    return (lower + upper) / 2;
  }

  return sorted[middle] ?? 0;
}

/**
 * Общий монитор сцены системы.
 *
 * Визуальные объекты подписываются на него при создании, а `SystemScene`
 * передаёт длительности кадров через `onFrame`.
 */
export const qualityMonitor = new QualityMonitor();
