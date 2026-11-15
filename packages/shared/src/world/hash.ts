/**
 * Детерминированные хеши и генераторы для процедурного вида миров
 * (задача 25; п. 9.3; U51).
 *
 * В `packages/shared` нет DOM и Node API: UTF-8 кодируется вручную, чтобы
 * одинаковый идентификатор планеты давал одинаковый seed в браузере,
 * в тестах и на сервере.
 */

/**
 * Кодирует строку в UTF-8 без `TextEncoder` (его нет в lib ES2022).
 *
 * @param value Строка JavaScript.
 * @returns Последовательность байтов UTF-8.
 */
export function utf8Bytes(value: string): number[] {
  const bytes: number[] = [];

  for (const character of value) {
    const codePoint = character.codePointAt(0);

    if (codePoint === undefined) continue;

    if (codePoint <= 0x7f) {
      bytes.push(codePoint);
    } else if (codePoint <= 0x7ff) {
      bytes.push(0xc0 | (codePoint >> 6), 0x80 | (codePoint & 0x3f));
    } else if (codePoint <= 0xffff) {
      bytes.push(
        0xe0 | (codePoint >> 12),
        0x80 | ((codePoint >> 6) & 0x3f),
        0x80 | (codePoint & 0x3f),
      );
    } else {
      bytes.push(
        0xf0 | (codePoint >> 18),
        0x80 | ((codePoint >> 12) & 0x3f),
        0x80 | ((codePoint >> 6) & 0x3f),
        0x80 | (codePoint & 0x3f),
      );
    }
  }

  return bytes;
}

/** Начальное значение FNV-1a 32 бита. */
export const FNV1A32_OFFSET_BASIS = 0x811c9dc5;

/** Простое число FNV-1a 32 бита. */
export const FNV1A32_PRIME = 0x01000193;

/**
 * FNV-1a 32 бита по байтам UTF-8 (п. 9.3; U51).
 *
 *   h = 0x811c9dc5
 *   для каждого байта b: h ^= b; h = imul(h, 0x01000193) >>> 0
 *
 * @param value Строка; для идентификатора планеты — его `id`.
 * @returns Беззнаковое 32-битное число.
 */
export function fnv1a32(value: string): number {
  let hash = FNV1A32_OFFSET_BASIS;

  for (const byte of utf8Bytes(value)) {
    hash ^= byte;
    hash = Math.imul(hash, FNV1A32_PRIME) >>> 0;
  }

  return hash >>> 0;
}

/**
 * Генератор псевдослучайных чисел mulberry32 (U51).
 *
 * Возвращает функцию без состояния-счётчика: каждый вызов даёт следующее
 * число в `[0, 1)`; последовательность полностью определяется seed.
 *
 * @param seed Беззнаковый 32-битный seed.
 */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;

  return function next(): number {
    state = (state + 0x6d2b79f5) >>> 0;

    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);

    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Складывает seed планеты с солью — отдельный поток случайности на свойство.
 *
 * @param seed Seed планеты (`fnv1a32(planetId)`).
 * @param salt Строковая соль, например `'ocean'`.
 * @returns Беззнаковый 32-битный seed соли.
 */
export function saltedSeed(seed: number, salt: string): number {
  return (seed ^ fnv1a32(salt)) >>> 0;
}

/**
 * Создаёт генератор для конкретного свойства мира.
 *
 * @param seed Seed планеты.
 * @param salt Строковая соль свойства.
 */
export function createSeededRandom(seed: number, salt: string): () => number {
  return mulberry32(saltedSeed(seed, salt));
}

/**
 * Одно случайное число в `[0, 1)` для свойства мира.
 *
 * @param seed Seed планеты.
 * @param salt Строковая соль свойства.
 */
export function seededUnit(seed: number, salt: string): number {
  return mulberry32(saltedSeed(seed, salt))();
}
