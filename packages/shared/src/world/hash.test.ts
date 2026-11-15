import { describe, expect, it } from 'vitest';

import {
  createSeededRandom,
  fnv1a32,
  FNV1A32_OFFSET_BASIS,
  mulberry32,
  saltedSeed,
  seededUnit,
  utf8Bytes,
} from './hash';

/**
 * Тесты детерминированных хешей (задача 25; U51).
 *
 * Проверяются векторы FNV-1a, UTF-8 без `TextEncoder`, диапазон mulberry32
 * и независимость потоков случайности по солям.
 */

describe('utf8Bytes', () => {
  it('кодирует ASCII, кириллицу и подстрочную цифру', () => {
    expect(utf8Bytes('A')).toEqual([0x41]);
    expect(utf8Bytes('Ж')).toEqual([0xd0, 0x96]);
    expect(utf8Bytes('₂')).toEqual([0xe2, 0x82, 0x82]);
  });
});

describe('fnv1a32', () => {
  it('совпадает с эталонными векторами FNV-1a 32', () => {
    expect(fnv1a32('')).toBe(FNV1A32_OFFSET_BASIS);
    expect(fnv1a32('hello')).toBe(0x4f9f2cab);
    expect(fnv1a32('a')).toBe(3826002220);
    expect(fnv1a32('Проксима Центавра b')).toBe(4112501109);
    expect(fnv1a32('H₂O')).toBe(2947797792);
  });

  it('различает близкие идентификаторы', () => {
    expect(fnv1a32('planet-b')).not.toBe(fnv1a32('planet-c'));
  });

  it('возвращает беззнаковое 32-битное число', () => {
    const value = fnv1a32('TRAPPIST-1 e');

    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThanOrEqual(0xffffffff);
    expect(Number.isInteger(value)).toBe(true);
  });
});

describe('mulberry32', () => {
  it('даёт известную последовательность для seed = 1', () => {
    const random = mulberry32(1);

    expect(random()).toBeCloseTo(0.6270739405881613, 12);
    expect(random()).toBeCloseTo(0.002735721180215478, 12);
    expect(random()).toBeCloseTo(0.5274470399599522, 12);
  });

  it('всегда попадает в [0, 1)', () => {
    const random = mulberry32(0xdeadbeef);

    for (let index = 0; index < 1000; index += 1) {
      const value = random();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});

describe('соли', () => {
  it('дают разные потоки для разных свойств', () => {
    expect(saltedSeed(42, 'ocean')).not.toBe(saltedSeed(42, 'clouds'));
    expect(seededUnit(42, 'ocean')).not.toBe(seededUnit(42, 'clouds'));
  });

  it('детерминированы по seed и соли', () => {
    expect(seededUnit(1234, 'bands')).toBe(seededUnit(1234, 'bands'));
    expect(seededUnit(1234, 'bands')).toBe(mulberry32(saltedSeed(1234, 'bands'))());
  });

  it('генератор продолжает поток после первого значения', () => {
    const random = createSeededRandom(7, 'terrain');
    const first = random();
    const next = [random(), random(), random()];

    expect(first).toBe(seededUnit(7, 'terrain'));
    expect(new Set(next).size).toBeGreaterThan(1);
  });
});
