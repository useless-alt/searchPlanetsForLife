/** Чен — Киппинг (2017): восстановление массы/радиуса по степенным законам. */

export function massFromRadius(radius: number | null): number | null {
  if (radius === null || !Number.isFinite(radius) || radius <= 0) return null;
  if (radius < 1.23) return Math.pow(radius, 3.58);
  if (radius <= 12) return 1.43 * Math.pow(radius, 1.7);
  return null;
}

export function radiusFromMass(mass: number | null): number | null {
  if (mass === null || !Number.isFinite(mass) || mass <= 0) return null;
  if (mass < 2.04) return Math.pow(mass, 0.279);
  if (mass < 132) return 0.81 * Math.pow(mass, 0.588);
  return null;
}
