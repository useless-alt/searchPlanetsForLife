import { PENALTY } from '@/config';

/** Вероятность того, что планета каменистая (порог Фултона). */
export function pRocky(radius: number | null): number {
  if (radius === null || !Number.isFinite(radius)) return 1;
  return 1 / (1 + Math.exp(PENALTY.rockySteepness * (radius - PENALTY.rockyThreshold)));
}

/** Штраф за эксцентриситет. */
export function pEcc(ecc: number | null): number {
  if (ecc === null || !Number.isFinite(ecc)) return 1;
  const e = Math.min(Math.abs(ecc), 0.999);
  return 1 - e * e;
}

/** Штраф за активность красного карлика. */
export function pStar(teff: number | null): number {
  if (teff === null || !Number.isFinite(teff)) return 1;
  return teff < PENALTY.redDwarfTeff ? PENALTY.redDwarfFactor : 1;
}
