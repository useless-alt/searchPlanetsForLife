import { describe, expect, it } from 'vitest';

import { HZ_FILL_OPACITY, tokens } from '../../../styles/theme';

/**
 * Тесты цветов зоны обитаемости (задача 24; п. 11.4; палитра 12a).
 *
 * Заливка и контур должны по оттенку отличаться от изумрудного акцента
 * лидеров Топ-50 не меньше чем на 40°, а контур — от линии орбиты. Проверка
 * идёт по HSL, поэтому сравнение не зависит от яркости и насыщенности.
 */

/** Компоненты HSL: оттенок [°], насыщенность и светлота [0..1]. */
interface Hsl {
  /** Оттенок [°]. */
  h: number;
  /** Насыщенность 0..1. */
  s: number;
  /** Светлота 0..1. */
  l: number;
}

/** Разбирает `#rrggbb` в HSL. */
function parseHsl(value: string): Hsl {
  const hex = value.replace('#', '');
  const red = Number.parseInt(hex.slice(0, 2), 16) / 255;
  const green = Number.parseInt(hex.slice(2, 4), 16) / 255;
  const blue = Number.parseInt(hex.slice(4, 6), 16) / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  const l = (max + min) / 2;

  if (delta === 0) return { h: 0, s: 0, l };

  const s = delta / (1 - Math.abs(2 * l - 1));
  let h: number;

  if (max === red) {
    h = 60 * (((green - blue) / delta) % 6);
  } else if (max === green) {
    h = 60 * ((blue - red) / delta + 2);
  } else {
    h = 60 * ((red - green) / delta + 4);
  }

  return { h: (h + 360) % 360, s, l };
}

/** Кратчайшая разница оттенков по кругу [°]. */
function hueDistance(first: number, second: number): number {
  const difference = Math.abs(first - second) % 360;

  return Math.min(difference, 360 - difference);
}

describe('цвета зоны обитаемости', () => {
  it('заливка отличается от изумрудного акцента лидеров не меньше чем на 40°', () => {
    const fill = parseHsl(tokens['hz-fill']);
    const leader = parseHsl(tokens['color-leader']);

    expect(hueDistance(fill.h, leader.h)).toBeGreaterThanOrEqual(40);
  });

  it('контур отличается от изумрудного акцента не меньше чем на 40°', () => {
    const edge = parseHsl(tokens['hz-edge']);
    const leader = parseHsl(tokens['color-leader']);

    expect(hueDistance(edge.h, leader.h)).toBeGreaterThanOrEqual(40);
  });

  it('контур зоны отличается от линии орбиты', () => {
    expect(tokens['hz-edge']).not.toBe(tokens['orbit-line']);
    expect(tokens['hz-edge']).not.toBe(tokens['color-orbit']);
  });

  it('заливка и контур различаются между собой', () => {
    expect(tokens['hz-fill']).not.toBe(tokens['hz-edge']);
  });

  it('непрозрачность заливки лежит в диапазоне 0.12–0.30', () => {
    expect(HZ_FILL_OPACITY).toBeGreaterThanOrEqual(0.12);
    expect(HZ_FILL_OPACITY).toBeLessThanOrEqual(0.3);
  });
});
