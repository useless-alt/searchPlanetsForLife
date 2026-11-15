import { describe, expect, it } from 'vitest';

import { ORBIT_ANIMATION_SECONDS } from '@exo/shared';

import { MAX_FRAME_STEP_SEC, SimClock } from './SimClock';

/**
 * Тесты часов орбиты (задача 22; п. 9.1, 11.3; U46).
 *
 * Проверяются масштаб времени, отсутствие периода, ограничение шага кадра,
 * скрытая вкладка и сброс при построении новой сцены.
 */
describe('SimClock', () => {
  it('за 60 секунд при P = 120 сут проходит 60 суток', () => {
    const clock = new SimClock(ORBIT_ANIMATION_SECONDS);
    let days = 0;

    for (let frame = 0; frame < 600; frame += 1) {
      days = clock.advance(MAX_FRAME_STEP_SEC);
    }

    expect(days).toBeCloseTo(60, 9);
    expect(clock.elapsedSeconds).toBeCloseTo(60, 9);
  });

  it('без периода всегда возвращает 0', () => {
    const clock = new SimClock(null);

    clock.advance(0.1);
    clock.advance(0.1);

    expect(clock.days()).toBe(0);
    expect(clock.elapsedSeconds).toBeCloseTo(0.2, 12);
  });

  it('ограничивает шаг кадра 100 мс', () => {
    const clock = new SimClock(ORBIT_ANIMATION_SECONDS);

    clock.advance(5);

    expect(clock.elapsedSeconds).toBe(MAX_FRAME_STEP_SEC);
    expect(clock.days()).toBeCloseTo(0.1, 12);
  });

  it('не продвигает время при скрытой вкладке', () => {
    let hidden = false;
    const clock = new SimClock(ORBIT_ANIMATION_SECONDS, { isHidden: () => hidden });

    clock.advance(0.1);
    hidden = true;
    clock.advance(0.1);
    clock.advance(0.1);

    expect(clock.elapsedSeconds).toBeCloseTo(0.1, 12);

    hidden = false;
    clock.advance(0.1);

    expect(clock.elapsedSeconds).toBeCloseTo(0.2, 12);
  });

  it('сбрасывается в 0 при построении сцены', () => {
    const clock = new SimClock(ORBIT_ANIMATION_SECONDS);

    clock.advance(0.1);
    clock.reset();

    expect(clock.days()).toBe(0);
    expect(clock.elapsedSeconds).toBe(0);
  });

  it('игнорирует отрицательный и нечисловой шаг', () => {
    const clock = new SimClock(ORBIT_ANIMATION_SECONDS);

    clock.advance(-1);
    clock.advance(Number.NaN);

    expect(clock.elapsedSeconds).toBe(0);
  });

  it('spinHours: 1 реальная секунда = 1 час', () => {
    const clock = new SimClock(ORBIT_ANIMATION_SECONDS);

    clock.advance(0.1);
    clock.advance(0.1);
    clock.advance(0.1);

    expect(clock.spinHours()).toBeCloseTo(0.3, 12);
    expect(clock.elapsedSeconds).toBeCloseTo(0.3, 12);
  });

  it('reducedMotion создаёт приостановленные часы', () => {
    const clock = new SimClock(ORBIT_ANIMATION_SECONDS, { reducedMotion: true });

    clock.advance(0.1);
    clock.advance(0.1);

    expect(clock.isPaused).toBe(true);
    expect(clock.days()).toBe(0);
    expect(clock.spinHours()).toBe(0);

    clock.setPaused(false);
    clock.advance(0.1);

    expect(clock.isPaused).toBe(false);
    expect(clock.spinHours()).toBeCloseTo(0.1, 12);
  });

  it('setPaused(true) останавливает и орбиту, и часы вращения', () => {
    const clock = new SimClock(ORBIT_ANIMATION_SECONDS);

    clock.advance(0.1);
    clock.setPaused(true);
    clock.advance(0.1);
    clock.advance(0.1);

    expect(clock.elapsedSeconds).toBeCloseTo(0.1, 12);
    expect(clock.spinHours()).toBeCloseTo(0.1, 12);
  });
});
