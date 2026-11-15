import { describe, expect, it } from 'vitest';

import { computePosition, rectsIntersect, type RectLike } from './position';

/**
 * Тесты позиционирования подсказки (задача 17; п. 11.1).
 *
 * Проверяются края окна, отражение у правой и нижней границы, положение при
 * фокусе и перенос подсказки, если она перекрывает цель.
 */

const viewport = { width: 1000, height: 800 };
const tipSize = { width: 200, height: 100 };

/** Подсказка у курсора. */
function atPointer(
  pointer: { x: number; y: number },
  target: RectLike = { x: 0, y: 0, width: 0, height: 0 },
) {
  return computePosition({ pointer, targetRect: target, tipSize, viewport });
}

/** Подсказка при фокусе с клавиатуры. */
function atTarget(targetRect: RectLike) {
  return computePosition({ targetRect, tipSize, viewport });
}

/** Внутри ли прямоугольник окна с отступом 8 px. */
function insideViewport(rect: RectLike): boolean {
  return (
    rect.x >= 8 &&
    rect.y >= 8 &&
    rect.x + rect.width <= viewport.width - 8 &&
    rect.y + rect.height <= viewport.height - 8
  );
}

describe('computePosition', () => {
  it('не выходит за правый край', () => {
    const position = atPointer({ x: 995, y: 400 });

    expect(insideViewport({ ...position, ...tipSize })).toBe(true);
    expect(position.x + tipSize.width).toBeLessThanOrEqual(viewport.width - 8);
  });

  it('не выходит за нижний край', () => {
    const position = atPointer({ x: 500, y: 795 });

    expect(insideViewport({ ...position, ...tipSize })).toBe(true);
    expect(position.y + tipSize.height).toBeLessThanOrEqual(viewport.height - 8);
  });

  it('не выходит за левый и верхний края', () => {
    const leftTop = atPointer({ x: 1, y: 1 });

    expect(insideViewport({ ...leftTop, ...tipSize })).toBe(true);

    const leftBottom = atPointer({ x: 1, y: 795 });

    expect(insideViewport({ ...leftBottom, ...tipSize })).toBe(true);
  });

  it('при фокусе показывает подсказку под элементом', () => {
    const position = atTarget({ x: 300, y: 200, width: 80, height: 32 });

    expect(position.x).toBe(300 + 40 - 100);
    expect(position.y).toBe(200 + 32 + 12);
  });

  it('при фокусе у нижнего края переносит подсказку над элементом', () => {
    const position = atTarget({ x: 300, y: 740, width: 80, height: 40 });

    expect(position.y + tipSize.height).toBeLessThanOrEqual(740);
    expect(insideViewport({ ...position, ...tipSize })).toBe(true);
  });

  it('не перекрывает цель, если курсор стоит на ней', () => {
    const target = { x: 400, y: 300, width: 100, height: 40 };
    const position = atPointer({ x: 450, y: 320 }, target);

    expect(rectsIntersect({ ...position, ...tipSize }, target)).toBe(false);
  });

  it('не перекрывает цель у нижнего края окна', () => {
    const target = { x: 400, y: 600, width: 100, height: 40 };
    const position = atPointer({ x: 450, y: 620 }, target);

    expect(rectsIntersect({ ...position, ...tipSize }, target)).toBe(false);
    expect(insideViewport({ ...position, ...tipSize })).toBe(true);
  });
});
