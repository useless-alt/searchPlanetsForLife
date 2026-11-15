import { ORBIT_ANIMATION_SECONDS } from '@exo/shared';

/**
 * Часы анимации орбиты (задача 22; п. 9.1, 11.3; U46).
 *
 * Один оборот планеты занимает `ORBIT_ANIMATION_SECONDS = 120` секунд
 * реального времени. Число прошедших «модельных» суток:
 *
 *   days = elapsedSec · P / ORBIT_ANIMATION_SECONDS
 *
 * Если период `P` неизвестен, планета неподвижна и `days()` всегда 0.
 * Шаг кадра ограничен 100 мс, поэтому зависание вкладки или длинный кадр
 * не перебрасывают планету на половину орбиты. При скрытой вкладке время
 * не течёт.
 *
 * Задача 26 добавляет часы вращения: 1 реальная секунда = 1 час. При
 * `prefers-reduced-motion: reduce` (U55) часы создаются приостановленными,
 * но сцена, «Обзор» и переключатели слоёв продолжают работать.
 */

/** Максимальный шаг кадра [с]. */
export const MAX_FRAME_STEP_SEC = 0.1;

/** Настройки часов. */
export interface SimClockOptions {
  /** Подмена проверки видимости вкладки (для тестов). */
  isHidden?: () => boolean;
  /** Приостановить часы сразу (U55); по умолчанию — из reduced motion. */
  paused?: boolean;
  /** `prefers-reduced-motion`: часы создаются приостановленными. */
  reducedMotion?: boolean;
}

/** Проверяет, скрыта ли вкладка браузера. */
function documentHidden(): boolean {
  return typeof document !== 'undefined' && document.visibilityState === 'hidden';
}

/** Проверяет системную настройку уменьшенного движения. */
function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/** Часы анимации орбиты. */
export class SimClock {
  /** Период обращения [сут]; null — движение невозможно. */
  private periodDays: number | null;

  /** Накопленное время [с]. */
  private elapsed = 0;

  /** Часы приостановлены (U55). */
  private paused: boolean;

  /** Множитель скорости часов для тестового доступа (1 — обычная). */
  private timeScale = 1;

  /** Проверка видимости вкладки. */
  private readonly isHidden: () => boolean;

  /**
   * @param periodDays Период обращения [сут] или null.
   * @param options Подмена проверки видимости и начальная пауза.
   */
  constructor(periodDays: number | null, options: SimClockOptions = {}) {
    this.periodDays = validPeriod(periodDays);
    this.isHidden = options.isHidden ?? documentHidden;
    this.paused = options.paused ?? options.reducedMotion ?? prefersReducedMotion();
  }

  /** Период обращения [сут] или null. */
  get period(): number | null {
    return this.periodDays;
  }

  /** Накопленное время [с]. */
  get elapsedSeconds(): number {
    return this.elapsed;
  }

  /** Псевдоним `elapsedSeconds` по имени из спецификации. */
  get elapsedSec(): number {
    return this.elapsed;
  }

  /** Часы приостановлены. */
  get isPaused(): boolean {
    return this.paused;
  }

  /** Накопленные часы вращения; 1 реальная секунда = 1 час. */
  spinHours(): number {
    return this.elapsed;
  }

  /** Ставит часы на паузу или запускает их (U55). */
  setPaused(paused: boolean): void {
    this.paused = paused;
  }

  /** Приостанавливает часы (тестовый доступ, задача 31). */
  pause(): void {
    this.paused = true;
  }

  /** Возобновляет часы (тестовый доступ, задача 31). */
  resume(): void {
    this.paused = false;
  }

  /**
   * Множитель скорости часов (тестовый доступ, задача 31).
   *
   * Влияет только на шаг кадра `advance(dtSec)`, но не на абсолютные
   * `advanceDays`/`advanceHours`: угол поворота не должен зависеть от
   * частоты кадров (п. 11.5).
   */
  setTimeScale(scale: number): void {
    this.timeScale = Number.isFinite(scale) && scale > 0 ? scale : 1;
  }

  /**
   * Продвигает модельное время на заданное число суток (тестовый доступ).
   *
   * @param days Сутки; отрицательные значения игнорируются.
   * @returns Накопленные модельные сутки.
   */
  advanceDays(days: number): number {
    if (!Number.isFinite(days) || days <= 0) return this.days();
    if (this.periodDays === null) return this.days();

    this.elapsed += (days * ORBIT_ANIMATION_SECONDS) / this.periodDays;

    return this.days();
  }

  /**
   * Продвигает часы вращения на заданное число часов (тестовый доступ).
   *
   * 1 час вращения равен 1 секунде накопленного времени (задача 26).
   *
   * @param hours Часы; отрицательные значения игнорируются.
   * @returns Накопленные часы вращения.
   */
  advanceHours(hours: number): number {
    if (!Number.isFinite(hours) || hours <= 0) return this.spinHours();

    this.elapsed += hours;

    return this.spinHours();
  }

  /** Меняет период, не сбрасывая накопленное время. */
  setPeriod(periodDays: number | null): void {
    this.periodDays = validPeriod(periodDays);
  }

  /** Сбрасывает время в 0 (построение новой сцены). */
  reset(): void {
    this.elapsed = 0;
  }

  /**
   * Продвигает время на шаг кадра.
   *
   * @param dtSec Время с прошлого кадра [с].
   * @returns Прошедшие модельные сутки.
   */
  advance(dtSec: number): number {
    if (this.paused || this.isHidden()) return this.days();
    if (!Number.isFinite(dtSec) || dtSec <= 0) return this.days();

    this.elapsed += Math.min(dtSec, MAX_FRAME_STEP_SEC) * this.timeScale;

    return this.days();
  }

  /** Псевдоним `advance` для шага кадра. */
  tick(dtSec: number): number {
    return this.advance(dtSec);
  }

  /** Псевдоним `advance` для цикла рендера. */
  update(dtSec: number): number {
    return this.advance(dtSec);
  }

  /**
   * Прошедшие модельные сутки.
   *
   * @returns 0, если период неизвестен.
   */
  days(): number {
    if (this.periodDays === null) return 0;

    return (this.elapsedSec * this.periodDays) / ORBIT_ANIMATION_SECONDS;
  }
}

/** Проверяет и нормализует период. */
function validPeriod(periodDays: number | null): number | null {
  if (periodDays === null || !Number.isFinite(periodDays) || periodDays <= 0) return null;

  return periodDays;
}
