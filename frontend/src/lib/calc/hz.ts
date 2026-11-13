import { HZ_COEFFS, HZ_TEFF, type HzBound, SUN_TEFF } from '@/config';
import { clamp } from './num';

export interface HzResult {
  dIn: number | null;
  dOut: number | null;
  dEff: number | null;
  hzd: number | null;
  fHz: number | null;
  extrapolated: boolean;
  valid: boolean;
  tempUsed: number | null;
}

function seff(coeffs: number[], teff: number): number {
  const t = teff - SUN_TEFF;
  const [s0, a, b, c, d] = coeffs;
  return s0 + a * t + b * t * t + c * t * t * t + d * t * t * t * t;
}

/**
 * Зона обитаемости по Коппарапу.
 * @param teff эффективная температура звезды, K
 * @param lum светимость, L☉
 * @param a большая полуось, а.е.
 * @param ecc эксцентриситет (0, если неизвестен)
 */
export function habitableZone(
  teff: number | null,
  lum: number | null,
  a: number | null,
  ecc: number | null,
  bound: HzBound,
): HzResult {
  const empty: HzResult = {
    dIn: null,
    dOut: null,
    dEff: null,
    hzd: null,
    fHz: null,
    extrapolated: false,
    valid: false,
    tempUsed: null,
  };
  if (teff === null || lum === null || a === null) return empty;
  if (!Number.isFinite(teff) || !Number.isFinite(lum) || !Number.isFinite(a)) return empty;
  if (lum <= 0 || a <= 0) return empty;

  if (teff < HZ_TEFF.extrapMin || teff > HZ_TEFF.extrapMax) return empty;

  const extrapolated = teff < HZ_TEFF.min || teff > HZ_TEFF.max;
  const tempUsed = clamp(teff, HZ_TEFF.min, HZ_TEFF.max);
  const coeffs = HZ_COEFFS[bound];

  const sIn = seff(coeffs.in, tempUsed);
  const sOut = seff(coeffs.out, tempUsed);
  if (!Number.isFinite(sIn) || !Number.isFinite(sOut) || sIn <= 0 || sOut <= 0) return empty;

  const dIn = Math.sqrt(lum / sIn);
  const dOut = Math.sqrt(lum / sOut);
  if (!Number.isFinite(dIn) || !Number.isFinite(dOut) || dOut <= dIn) {
    return { ...empty, extrapolated, tempUsed };
  }

  const e = ecc !== null && Number.isFinite(ecc) && ecc >= 0 && ecc < 1 ? ecc : 0;
  const dEff = a * Math.pow(1 - e * e, 0.25);
  const hzd = (2 * dEff - dOut - dIn) / (dOut - dIn);
  const fHz = Math.max(0, 1 - hzd * hzd);

  return { dIn, dOut, dEff, hzd, fHz, extrapolated, valid: true, tempUsed };
}
