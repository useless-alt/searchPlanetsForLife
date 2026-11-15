import { describe, expect, it, vi } from 'vitest';

import {
  initialQuality,
  lowerQuality,
  QUALITY_FRAME_BUDGET_MS,
  QUALITY_PROFILES,
  QUALITY_WINDOW_FRAMES,
  QualityMonitor,
} from './quality';

/**
 * Тесты профилей качества (задача 25; п. 9.1, 11.6; U51).
 *
 * Проверяются таблица профилей, выбор начального уровня, окно из 120
 * кадров, необратимое понижение и подписка визуальных объектов.
 */

describe('QUALITY_PROFILES', () => {
  it('совпадает с таблицей задачи', () => {
    expect(QUALITY_PROFILES.high).toMatchObject({
      sphereSegments: 96,
      noiseOctaves: 6,
      bump: true,
      clouds: true,
      dust: 2500,
    });
    expect(QUALITY_PROFILES.medium).toMatchObject({
      sphereSegments: 64,
      noiseOctaves: 5,
      bump: true,
      clouds: true,
      dust: 1500,
    });
    expect(QUALITY_PROFILES.low).toMatchObject({
      sphereSegments: 40,
      noiseOctaves: 3,
      bump: false,
      clouds: false,
      dust: 600,
    });
  });
});

describe('initialQuality', () => {
  it('high — 8 потоков и плотность пикселей не выше 2', () => {
    expect(initialQuality({ hardwareConcurrency: 8, devicePixelRatio: 2 })).toBe('high');
    expect(initialQuality({ hardwareConcurrency: 16, devicePixelRatio: 1 })).toBe('high');
  });

  it('medium — 4–7 потоков или высокая плотность пикселей', () => {
    expect(initialQuality({ hardwareConcurrency: 4, devicePixelRatio: 1 })).toBe('medium');
    expect(initialQuality({ hardwareConcurrency: 7, devicePixelRatio: 1 })).toBe('medium');
    expect(initialQuality({ hardwareConcurrency: 8, devicePixelRatio: 3 })).toBe('medium');
  });

  it('low — меньше 4 потоков', () => {
    expect(initialQuality({ hardwareConcurrency: 2, devicePixelRatio: 1 })).toBe('low');
  });

  it('medium, если число потоков не определено', () => {
    expect(initialQuality({ hardwareConcurrency: undefined })).toBe('medium');
  });
});

describe('lowerQuality', () => {
  it('понижает на ступень и не выходит за low', () => {
    expect(lowerQuality('high')).toBe('medium');
    expect(lowerQuality('medium')).toBe('low');
    expect(lowerQuality('low')).toBe('low');
  });
});

describe('QualityMonitor', () => {
  it('не понижает качество до полного окна', () => {
    const monitor = new QualityMonitor('high');

    for (let index = 0; index < QUALITY_WINDOW_FRAMES - 1; index += 1) {
      monitor.onFrame(40);
    }

    expect(monitor.level).toBe('high');
  });

  it('понижает качество, если медиана окна выше 24 мс', () => {
    const monitor = new QualityMonitor('high');

    for (let index = 0; index < QUALITY_WINDOW_FRAMES; index += 1) {
      monitor.onFrame(30);
    }

    expect(QUALITY_FRAME_BUDGET_MS).toBe(24);
    expect(monitor.level).toBe('medium');
  });

  it('не понижает качество при быстрых кадрах', () => {
    const monitor = new QualityMonitor('high');

    for (let index = 0; index < QUALITY_WINDOW_FRAMES * 2; index += 1) {
      monitor.onFrame(16);
    }

    expect(monitor.level).toBe('high');
  });

  it('понижает только на одну ступень за окно и не повышает', () => {
    const monitor = new QualityMonitor('high');

    for (let index = 0; index < QUALITY_WINDOW_FRAMES; index += 1) monitor.onFrame(40);
    expect(monitor.level).toBe('medium');

    for (let index = 0; index < QUALITY_WINDOW_FRAMES * 4; index += 1) monitor.onFrame(8);
    expect(monitor.level).toBe('medium');

    for (let index = 0; index < QUALITY_WINDOW_FRAMES; index += 1) monitor.onFrame(40);
    expect(monitor.level).toBe('low');
  });

  it('остаётся на low и очищает окно', () => {
    const monitor = new QualityMonitor('low');

    for (let index = 0; index < QUALITY_WINDOW_FRAMES * 2; index += 1) monitor.onFrame(60);

    expect(monitor.level).toBe('low');
    expect(monitor.windowSize).toBe(0);
  });

  it('уведомляет подписчиков при понижении', () => {
    const monitor = new QualityMonitor('high');
    const listener = vi.fn();
    const unsubscribe = monitor.subscribe(listener);

    for (let index = 0; index < QUALITY_WINDOW_FRAMES; index += 1) monitor.onFrame(40);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith('medium', QUALITY_PROFILES.medium);

    unsubscribe();
    for (let index = 0; index < QUALITY_WINDOW_FRAMES; index += 1) monitor.onFrame(40);

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('setLevel меняет уровень и уведомляет подписчиков', () => {
    const monitor = new QualityMonitor('high');
    const listener = vi.fn();

    monitor.subscribe(listener);
    monitor.setLevel('low');

    expect(monitor.profile).toBe(QUALITY_PROFILES.low);
    expect(listener).toHaveBeenCalledWith('low', QUALITY_PROFILES.low);
  });
});
