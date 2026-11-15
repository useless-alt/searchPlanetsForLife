import type { ParamValue } from '../types/provenance';
import type { ResolvedPlanet } from '../types/solver';

/**
 * Радиус звезды для 3D-сцены системы (задача 22; п. 9.1).
 *
 * `st_rad` берётся напрямую, если он известен. Иначе радиус оценивается
 * по закону Стефана — Больцмана:
 *
 *   R = sqrt(L) · (T_sun / T_eff)²
 *
 * где L — светимость [L☉], T_eff — эффективная температура [К],
 * T_sun = 5772 К. Если ни один способ не даёт конечного положительного
 * значения, функция возвращает null: модель масштаба не строится,
 * а сцена показывает заглушку звезды (задача 27).
 */

/** Эффективная температура Солнца [К]. */
export const SUN_EFFECTIVE_TEMPERATURE = 5772;

/** Минимальный набор полей, нужный для радиуса звезды. */
export type StarRadiusInput = Pick<ResolvedPlanet, 'L' | 'st_rad' | 'st_teff'>;

/**
 * Возвращает конечное положительное значение параметра или null.
 *
 * @param parameter Значение с происхождением.
 * @returns Число или null, если значение отсутствует или нефизично.
 */
export function finitePositive(parameter: ParamValue | null | undefined): number | null {
  const value = parameter?.value;

  if (value === null || value === undefined || !Number.isFinite(value) || value <= 0) return null;

  return value;
}

/**
 * Радиус звезды в радиусах Солнца (п. 9.1).
 *
 * @param resolved Разрешённые параметры планеты.
 * @returns Радиус [R☉] или null, если его нельзя определить.
 */
export function starRadiusSolar(resolved: StarRadiusInput): number | null {
  const measured = finitePositive(resolved.st_rad);

  if (measured !== null) return measured;

  const luminosity = finitePositive(resolved.L);
  const temperature = finitePositive(resolved.st_teff);

  if (luminosity === null || temperature === null) return null;

  const radius = Math.sqrt(luminosity) * (SUN_EFFECTIVE_TEMPERATURE / temperature) ** 2;

  return Number.isFinite(radius) && radius > 0 ? radius : null;
}
