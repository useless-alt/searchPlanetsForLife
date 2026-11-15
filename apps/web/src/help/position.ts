/**
 * Позиционирование подсказки (задача 17; п. 11.1).
 *
 * Чистая функция без DOM: получает точку курсора (или прямоугольник цели
 * при фокусе с клавиатуры), размер подсказки и размер окна. Возвращает
 * координаты левого верхнего угла в системе `position: fixed`.
 */

/** Точка на экране. */
export interface Point {
  /** Координата по горизонтали. */
  x: number;
  /** Координата по вертикали. */
  y: number;
}

/** Прямоугольник элемента в координатах окна. */
export interface RectLike {
  /** Левый край. */
  x: number;
  /** Верхний край. */
  y: number;
  /** Ширина. */
  width: number;
  /** Высота. */
  height: number;
}

/** Размер подсказки. */
export interface Size {
  /** Ширина. */
  width: number;
  /** Высота. */
  height: number;
}

/** Размер окна. */
export interface ViewportSize {
  /** Ширина. */
  width: number;
  /** Высота. */
  height: number;
}

/** Входные данные позиционирования. */
export interface PositionInput {
  /** Курсор мыши; отсутствует при фокусе с клавиатуры. */
  pointer?: Point;
  /** Прямоугольник цели. */
  targetRect: RectLike;
  /** Размер подсказки. */
  tipSize: Size;
  /** Размер окна. */
  viewport: ViewportSize;
  /** Отступ от краёв окна; по умолчанию 8 px. */
  margin?: number;
  /** Смещение от курсора и цели; по умолчанию 12 px. */
  offset?: number;
}

/** Ограничивает значение отрезком; при пустом отрезке возвращает минимум. */
function clamp(value: number, min: number, max: number): number {
  if (max < min) return min;

  return Math.min(Math.max(value, min), max);
}

/** Пересекаются ли прямоугольники (нулевой размер не считается пересечением). */
export function rectsIntersect(a: RectLike, b: RectLike): boolean {
  if (a.width <= 0 || a.height <= 0 || b.width <= 0 || b.height <= 0) return false;

  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

/**
 * Вычисляет положение подсказки.
 *
 * Правила (п. 11.1):
 * 1. У курсора — смещение `offset` вправо и вниз; при фокусе — под
 *    элементом по центру.
 * 2. Выход за правую границу отражается влево, за нижнюю — вверх.
 * 3. Результат ограничивается рамкой окна с отступом `margin`.
 * 4. Если подсказка перекрывает цель, она переносится выше или ниже —
 *    на сторону с большим свободным местом.
 */
export function computePosition({
  pointer,
  targetRect,
  tipSize,
  viewport,
  margin = 8,
  offset = 12,
}: PositionInput): Point {
  const maxX = Math.max(margin, viewport.width - margin - tipSize.width);
  const maxY = Math.max(margin, viewport.height - margin - tipSize.height);

  let x: number;
  let y: number;

  if (pointer !== undefined) {
    x = pointer.x + offset;
    y = pointer.y + offset;

    if (x + tipSize.width > viewport.width - margin) x = pointer.x - offset - tipSize.width;
    if (y + tipSize.height > viewport.height - margin) y = pointer.y - offset - tipSize.height;
  } else {
    x = targetRect.x + targetRect.width / 2 - tipSize.width / 2;
    y = targetRect.y + targetRect.height + offset;

    if (x + tipSize.width > viewport.width - margin) {
      x = targetRect.x + targetRect.width - tipSize.width;
    }

    if (y + tipSize.height > viewport.height - margin) {
      y = targetRect.y - offset - tipSize.height;
    }
  }

  x = clamp(x, margin, maxX);
  y = clamp(y, margin, maxY);

  const tipRect: RectLike = { x, y, width: tipSize.width, height: tipSize.height };

  if (rectsIntersect(tipRect, targetRect)) {
    const spaceAbove = targetRect.y - margin;
    const spaceBelow = viewport.height - margin - (targetRect.y + targetRect.height);
    const above = spaceAbove >= spaceBelow;

    y = above ? targetRect.y - offset - tipSize.height : targetRect.y + targetRect.height + offset;
    y = clamp(y, margin, maxY);

    // Если места с выбранной стороны всё равно не хватает, пробуем другую.
    if (rectsIntersect({ x, y, width: tipSize.width, height: tipSize.height }, targetRect)) {
      y = above
        ? targetRect.y + targetRect.height + offset
        : targetRect.y - offset - tipSize.height;
      y = clamp(y, margin, maxY);
    }
  }

  return { x, y };
}
