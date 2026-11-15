import { describe, expect, it } from 'vitest';

import type { Range } from '../types/settings';
import { decodeShare } from './decode';
import { encodeShare } from './encode';
import {
  SHARE_MODES,
  SHARE_SORT_KEYS,
  SHARE_SPECTRAL_ORDER,
  defaultSharedState,
  type SharedState,
} from './types';

/**
 * Тесты ссылки на состояние (задача 20; 13.1, U45).
 *
 * Проверяются: обратимость кодирования, отсутствие значений по умолчанию,
 * устойчивость к каждому недопустимому параметру по отдельности и отказ от
 * ссылки чужой версии.
 */

/** Простой детерминированный генератор: тесты не зависят от Math.random. */
function makeRandom(seed: number): () => number {
  let state = seed;

  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;

    return state / 4294967296;
  };
}

/** Случайный элемент массива. */
function pick<T>(random: () => number, items: readonly T[]): T {
  const item = items[Math.floor(random() * items.length)];

  if (item === undefined) throw new Error('пустой список для выбора');

  return item;
}

/** Диапазон: иногда без одной или обеих границ, всегда min ≤ max. */
function makeRange(random: () => number, eccentricity = false): Range {
  const mode = Math.floor(random() * 4);

  if (mode === 0) return { min: null, max: null };

  const scale = eccentricity ? 1 : 500;
  const precision = eccentricity ? 1000 : 100;
  const first = Math.round(random() * scale * precision) / precision;
  const second = Math.round(random() * scale * precision) / precision;
  const min = Math.min(first, second);
  const max = Math.max(first, second);

  if (mode === 1) return { min, max: null };
  if (mode === 2) return { min: null, max };

  return { min, max };
}

/** Случайное допустимое состояние. */
function randomState(random: () => number): SharedState {
  const selected = SHARE_SPECTRAL_ORDER.filter(() => random() < 0.35);

  return {
    settings: {
      mode: pick(random, SHARE_MODES),
      hzBounds: random() < 0.5 ? 'conservative' : 'optimistic',
      penalties: {
        rocky: random() < 0.5,
        ecc: random() < 0.5,
        star: random() < 0.5,
        qdata: random() < 0.5,
      },
      qMin: (75 + Math.floor(random() * 26)) / 100,
    },
    filters: {
      spectralClasses: selected,
      radius: makeRange(random),
      T_s: makeRange(random),
      e: makeRange(random, true),
      includeCandidates: random() < 0.5,
      earthReference: random() < 0.5,
    },
    sort: {
      column: pick(random, SHARE_SORT_KEYS),
      dir: random() < 0.5 ? 'asc' : 'desc',
    },
    selectedPlanetId: random() < 0.4 ? null : pick(random, ['kepler-442-b', 'trappist-1-e']),
    planetCardOpen: random() < 0.5,
  };
}

describe('encodeShare / decodeShare', () => {
  it('сохраняет 200 случайных состояний без потерь', () => {
    const random = makeRandom(20261114);

    for (let index = 0; index < 200; index += 1) {
      const state = randomState(random);
      const decoded = decodeShare(`#${encodeShare(state)}`);

      expect(decoded.ignored).toEqual([]);
      expect(decoded.state).toEqual(state);
    }
  });

  it('не включает параметры со значениями по умолчанию, кроме v', () => {
    expect(encodeShare(defaultSharedState())).toBe('v=1');
  });

  it('кодирует и разбирает диапазоны с пустой стороной', () => {
    const decoded = decodeShare('#v=1&r=0.5..2&t=..330&e=0..0.5');

    expect(decoded.ignored).toEqual([]);
    expect(decoded.state.filters?.radius).toEqual({ min: 0.5, max: 2 });
    expect(decoded.state.filters?.T_s).toEqual({ min: null, max: 330 });
    expect(decoded.state.filters?.e).toEqual({ min: 0, max: 0.5 });
  });

  it('восстанавливает планету и открытую карточку', () => {
    const decoded = decodeShare('#v=1&p=kepler-442-b&open=1');

    expect(decoded.state.selectedPlanetId).toBe('kepler-442-b');
    expect(decoded.state.planetCardOpen).toBe(true);
  });

  it('отбрасывает каждый недопустимый параметр отдельно', () => {
    const decoded = decodeShare(
      '#v=1&m=bogus&hz=o&pen=101&q=101&cls=GXK&r=abc&t=-1..5&e=0.8..0.2&cand=2&earth=1&sort=foo.desc&p=&open=2',
    );

    expect(new Set(decoded.ignored)).toEqual(
      new Set(['m', 'pen', 'q', 'cls', 'r', 't', 'e', 'cand', 'sort', 'p', 'open']),
    );

    // Корректные параметры рядом с недопустимыми продолжают действовать.
    expect(decoded.state.settings?.mode).toBe('adaptive');
    expect(decoded.state.settings?.hzBounds).toBe('optimistic');
    expect(decoded.state.settings?.penalties).toEqual({
      rocky: true,
      ecc: true,
      star: true,
      qdata: true,
    });
    expect(decoded.state.settings?.qMin).toBe(0.75);
    expect(decoded.state.filters?.spectralClasses).toEqual(['K', 'G']);
    expect(decoded.state.filters?.radius).toEqual({ min: null, max: null });
    expect(decoded.state.filters?.earthReference).toBe(true);
    expect(decoded.state.sort).toEqual({ column: 'rank', dir: 'asc' });
    expect(decoded.state.selectedPlanetId).toBeNull();
    expect(decoded.state.planetCardOpen).toBe(false);
  });

  it('игнорирует всю ссылку чужой версии', () => {
    const decoded = decodeShare('#v=2&m=rhi&r=0.5..2');

    expect(decoded.state).toEqual({});
    expect(decoded.ignored).toEqual(['v']);
  });

  it('игнорирует ссылку без версии', () => {
    const decoded = decodeShare('#m=rhi');

    expect(decoded.state).toEqual({});
    expect(decoded.ignored).toEqual(['v']);
  });

  it('не содержит search, showExtraData и compareClassic', () => {
    const state = randomState(makeRandom(7));

    // В типе этих полей нет; проверяем строку ссылки как её видит пользователь.
    const encoded = encodeShare(state);

    expect(encoded).not.toContain('search=');
    expect(encoded).not.toContain('showExtraData');
    expect(encoded).not.toContain('compareClassic');
  });

  it('укладывается в 400 символов для допустимого состояния', () => {
    const state: SharedState = {
      settings: {
        mode: 'classic_esi',
        hzBounds: 'optimistic',
        penalties: { rocky: false, ecc: false, star: false, qdata: false },
        qMin: 1,
      },
      filters: {
        spectralClasses: [...SHARE_SPECTRAL_ORDER],
        radius: { min: 0.1, max: 22.5 },
        T_s: { min: 100, max: 2000 },
        e: { min: 0, max: 1 },
        includeCandidates: true,
        earthReference: true,
      },
      sort: { column: 'dist_pc', dir: 'desc' },
      selectedPlanetId: 'kepler-442-b',
      planetCardOpen: true,
    };

    expect(encodeShare(state).length).toBeLessThanOrEqual(400);
  });
});
