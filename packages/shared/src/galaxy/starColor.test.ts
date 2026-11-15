import { describe, expect, it } from 'vitest';

import { MAP_STAR_UNKNOWN_RGB, teffToRGB, teffToUnitRGB, type StarColor } from './starColor';

/**
 * Тесты цвета звезды (задача 21; п. 6.2).
 *
 * Проверяется направление изменения каналов, близость к белому у Солнца,
 * красный оттенок холодной звезды и серый цвет при неизвестной температуре.
 */

/** Размах каналов цвета. */
function spread(color: StarColor): number {
  return Math.max(color.r, color.g, color.b) - Math.min(color.r, color.g, color.b);
}

describe('teffToRGB', () => {
  it('с ростом температуры красный канал убывает', () => {
    const red = [7000, 10000, 20000, 40000].map((temperature) => teffToRGB(temperature).r);

    for (let index = 1; index < red.length; index += 1) {
      expect(red[index]).toBeLessThan(red[index - 1] ?? Number.POSITIVE_INFINITY);
    }
  });

  it('с ростом температуры синий канал возрастает', () => {
    const blue = [3000, 4000, 5000, 6000].map((temperature) => teffToRGB(temperature).b);

    for (let index = 1; index < blue.length; index += 1) {
      expect(blue[index]).toBeGreaterThan(blue[index - 1] ?? Number.NEGATIVE_INFINITY);
    }
  });

  it('температура Солнца даёт почти белый цвет', () => {
    const color = teffToRGB(5772);

    expect(color.r).toBeGreaterThan(225);
    expect(color.g).toBeGreaterThan(225);
    expect(color.b).toBeGreaterThan(225);
    expect(spread(color)).toBeLessThan(35);
  });

  it('холодная звезда 2566 К краснее, чем синее', () => {
    const color = teffToRGB(2566);

    expect(color.r).toBeGreaterThan(color.b);
    expect(color.r).toBe(255);
  });

  it('неизвестная температура даёт нейтральный серый', () => {
    const color = teffToRGB(null);

    expect(color).toEqual(MAP_STAR_UNKNOWN_RGB);
    expect(color.r).toBe(color.g);
    expect(color.g).toBe(color.b);
  });

  it('клампит температуру диапазоном 1000…40000 К', () => {
    expect(teffToRGB(100)).toEqual(teffToRGB(1000));
    expect(teffToRGB(100000)).toEqual(teffToRGB(40000));
  });

  it('не отдаёт каналы вне диапазона 0…255', () => {
    for (const temperature of [null, 0, 1000, 5772, 40000, Number.NaN]) {
      const color = teffToRGB(temperature);

      for (const channel of [color.r, color.g, color.b]) {
        expect(channel).toBeGreaterThanOrEqual(0);
        expect(channel).toBeLessThanOrEqual(255);
      }
    }
  });

  it('нормализованный цвет совпадает с каналами 0…255', () => {
    const color = teffToRGB(5772);
    const unit = teffToUnitRGB(5772);

    expect(unit.r).toBeCloseTo(color.r / 255, 12);
    expect(unit.g).toBeCloseTo(color.g / 255, 12);
    expect(unit.b).toBeCloseTo(color.b / 255, 12);
  });
});
