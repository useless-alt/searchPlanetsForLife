/** Экваториальные координаты J2000 -> сцена; радиальное сжатие r' = K·log10(1+r). */

export const MAP_K = 900;

export function compressDistance(distancePc: number): number {
  if (!Number.isFinite(distancePc) || distancePc < 0) return 0;
  return MAP_K * Math.log10(1 + distancePc);
}

export function equatorialToScene(
  raDeg: number,
  decDeg: number,
  distancePc: number,
): [number, number, number] | null {
  if (
    !Number.isFinite(raDeg) ||
    !Number.isFinite(decDeg) ||
    !Number.isFinite(distancePc) ||
    distancePc <= 0
  ) {
    return null;
  }
  const ra = (raDeg * Math.PI) / 180;
  const dec = (decDeg * Math.PI) / 180;
  const r = compressDistance(distancePc);
  const x = r * Math.cos(dec) * Math.cos(ra);
  const y = r * Math.cos(dec) * Math.sin(ra);
  const z = r * Math.sin(dec);
  return [x, y, z];
}
