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
 */

/** Максимальный шаг кадра [с]. */
export const MAX_FRAME_STEP_SEC = 0.1;

/** Настройки часов. */
export interface SimClockOptions {
  /** Подмена проверки видимости вкладки (для тестов). */
  isHidden?: () => boolean;
}

/** Проверяет, скрыта ли вкладка браузера. */
function documentHidden(): boolean {
  return typeof document !== 'undefined' && document.visibilityState === 'hidden';
}

/** Часы анимации орбиты. */
export class SimClock {
  /** Период обращения [сут]; null — движение невозможно. */
  private periodDays: number | null;

  /** Накопленное время [с]. */
  private elapsed = 0;

  /** Проверка видимости вкладки. */
  private readonly isHidden: () => boolean;

  /**
   * @param periodDays Период обращения [сут] или null.
   * @param options Подмена проверки видимости в тестах.
   */
  constructor(periodDays: number | null, options: SimClockOptions = {}) {
    this.periodDays = validPeriod(periodDays);
    this.isHidden = options.isHidden ?? documentHidden;
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
    if (this.isHidden()) return this.days();
    if (!Number.isFinite(dtSec) || dtSec <= 0) return this.days();

    this.elapsed += Math.min(dtSec, MAX_FRAME_STEP_SEC);

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
