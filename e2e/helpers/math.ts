/**
 * Геометрические помощники для проверок 11.3–11.6 (задача 31).
 *
 * Чистые функции без DOM: тесты получают числа из `window.__exo` и считают
 * расстояния, углы и замкнутость контура так же, как это делает сцена.
 */

/** Точка или вектор в трёхмерном пространстве. */
export type Vec3 = [number, number, number];

/** Разность векторов. */
export function subtract(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

/** Длина вектора. */
export function length(v: Vec3): number {
  return Math.hypot(v[0], v[1], v[2]);
}

/** Расстояние между точками. */
export function distance(a: Vec3, b: Vec3): number {
  return length(subtract(a, b));
}

/** Скалярное произведение. */
export function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/** Угол между векторами [рад]. */
export function angleBetween(a: Vec3, b: Vec3): number {
  const denom = length(a) * length(b);

  if (denom === 0) return 0;

  const cosine = Math.min(1, Math.max(-1, dot(a, b) / denom));

  return Math.acos(cosine);
}

/** Угол между векторами [°]. */
export function angleDegrees(a: Vec3, b: Vec3): number {
  return (angleBetween(a, b) * 180) / Math.PI;
}

/** Расстояние от точки до отрезка. */
export function distanceToSegment(point: Vec3, start: Vec3, end: Vec3): number {
  const ab = subtract(end, start);
  const ap = subtract(point, start);
  const abLengthSq = dot(ab, ab);

  if (abLengthSq === 0) return distance(point, start);

  const t = Math.min(1, Math.max(0, dot(ap, ab) / abLengthSq));
  const projection: Vec3 = [start[0] + ab[0] * t, start[1] + ab[1] * t, start[2] + ab[2] * t];

  return distance(point, projection);
}

/** Минимальное расстояние до замкнутой ломаной. */
export function distanceToPolyline(point: Vec3, points: readonly Vec3[]): number {
  let best = Number.POSITIVE_INFINITY;

  for (let index = 0; index < points.length; index += 1) {
    const start = points[index] as Vec3;
    const end = points[(index + 1) % points.length] as Vec3;
    const current = distanceToSegment(point, start, end);

    if (current < best) best = current;
  }

  return best;
}

/** Средняя длина сегмента ломаной. */
export function averageStep(points: readonly Vec3[]): number {
  if (points.length < 2) return 0;

  let total = 0;

  for (let index = 1; index < points.length; index += 1) {
    total += distance(points[index - 1] as Vec3, points[index] as Vec3);
  }

  return total / (points.length - 1);
}

/** Нормализует угол в [0, 2π). */
export function normalizeAngle(angle: number): number {
  const twoPi = Math.PI * 2;
  const normalized = angle % twoPi;

  return normalized < 0 ? normalized + twoPi : normalized;
}

/** Разница углов по модулю, кратчайшим путём [рад]. */
export function angleDelta(a: number, b: number): number {
  const twoPi = Math.PI * 2;
  const diff = normalizeAngle(a - b);

  return Math.min(diff, twoPi - diff);
}

/** Середина между минимальной и максимальной координатой X. */
export function midpointX(points: readonly Vec3[]): number {
  const xs = points.map((point) => point[0]);

  return (Math.min(...xs) + Math.max(...xs)) / 2;
}

/** Середина между минимальной и максимальной координатой Z. */
export function midpointZ(points: readonly Vec3[]): number {
  const zs = points.map((point) => point[2]);

  return (Math.min(...zs) + Math.max(...zs)) / 2;
}
