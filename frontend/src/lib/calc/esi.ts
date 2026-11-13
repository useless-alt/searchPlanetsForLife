import { ESI_PARAMS } from '@/config';

/** ESI_i = (1 − |x − x0| / (x + x0)) ^ w */
export function esi(x: number | null, x0: number, w: number): number | null {
  if (x === null || !Number.isFinite(x) || x <= 0 || x0 <= 0) return null;
  const inner = 1 - Math.abs(x - x0) / (x + x0);
  if (!Number.isFinite(inner) || inner <= 0) return 0;
  return Math.pow(inner, w);
}

export function esiR(radius: number | null): number | null {
  return esi(radius, ESI_PARAMS.rade.x0, ESI_PARAMS.rade.w);
}
export function esiRho(rho: number | null): number | null {
  return esi(rho, ESI_PARAMS.rho.x0, ESI_PARAMS.rho.w);
}
export function esiVe(ve: number | null): number | null {
  return esi(ve, ESI_PARAMS.ve.x0, ESI_PARAMS.ve.w);
}
export function esiS(flux: number | null): number | null {
  return esi(flux, ESI_PARAMS.insol.x0, ESI_PARAMS.insol.w);
}
export function esiT(ts: number | null): number | null {
  return esi(ts, ESI_PARAMS.ts.x0, ESI_PARAMS.ts.w);
}
