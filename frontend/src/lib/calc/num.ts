/** Приведение чисел: null вместо 0 и любых нефизичных значений. */

export function num(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'boolean') return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '' || trimmed.toLowerCase() === 'nan' || trimmed.toLowerCase() === 'null') return null;
    const parsed = Number(trimmed.replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function positive(value: number | null): number | null {
  return value !== null && Number.isFinite(value) && value > 0 ? value : null;
}

export const JUPITER_MASS_TO_EARTH = 317.83;
export const JUPITER_RADIUS_TO_EARTH = 11.209;

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function median(values: number[]): number | null {
  const finite = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (finite.length === 0) return null;
  const mid = Math.floor(finite.length / 2);
  return finite.length % 2 === 0 ? (finite[mid - 1] + finite[mid]) / 2 : finite[mid];
}

/** Среднее геометрическое доступных значений; null, если доступных меньше порога. */
export function geomean(values: (number | null)[], minCount = 1): number | null {
  const finite = values.filter((v): v is number => v !== null && Number.isFinite(v) && v >= 0);
  if (finite.length < minCount || finite.length === 0) return null;
  if (finite.some((v) => v === 0)) return 0;
  const logSum = finite.reduce((acc, v) => acc + Math.log(v), 0);
  return Math.exp(logSum / finite.length);
}
