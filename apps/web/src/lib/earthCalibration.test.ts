import { EARTH_REFERENCE_RECORD } from '@exo/shared';
import { describe, expect, it } from 'vitest';

import { computeEarthCalibration, type EarthCheck, type EarthCheckId } from './earthCalibration';

/**
 * Тесты калибровки «Земля (эталон)» (задача 15; п. 13.3, U11, U35).
 *
 * Эталон прогоняется тем же `solvePlanet` и теми же формулами индексов,
 * что и каталог. Проверяются контрольные значения 13.3 и независимость
 * доли от выбранных пользователем границ HZ.
 */

/** Проверка по идентификатору. */
function checkById(checks: readonly EarthCheck[], id: EarthCheckId): EarthCheck {
  const found = checks.find((item) => item.id === id);

  if (found === undefined) throw new Error(`нет проверки ${id}`);

  return found;
}

describe('калибровка «Земля (эталон)»', () => {
  it('эталонная запись задана значениями measured', () => {
    const params = EARTH_REFERENCE_RECORD.params;

    expect(params.pl_rade.value).toBe(1);
    expect(params.pl_bmasse.value).toBe(1);
    expect(params.pl_orbsmax.value).toBe(1);
    expect(params.pl_orbper.value).toBe(365.25);
    expect(params.pl_orbeccen.value).toBe(0.0167);
    expect(params.st_teff.value).toBe(5772);
    expect(params.st_rad.value).toBe(1);
    expect(params.st_mass.value).toBe(1);

    for (const key of [
      'pl_rade',
      'pl_bmasse',
      'pl_orbsmax',
      'pl_orbper',
      'pl_orbeccen',
      'st_teff',
      'st_rad',
      'st_mass',
    ] as const) {
      expect(params[key].provenance).toBe('measured');
    }
  });

  it('даёт контрольные ESI, T_s и F_HZ из 13.3', () => {
    const result = computeEarthCalibration('optimistic');

    expect(checkById(result.checks, 'ESI_R').value).toBeCloseTo(1, 9);
    expect(checkById(result.checks, 'ESI_rho').value).toBeCloseTo(1, 9);
    expect(checkById(result.checks, 'ESI_ve').value).toBeCloseTo(1, 9);
    expect(checkById(result.checks, 'ESI_S').value).toBeCloseTo(0.9998, 3);
    expect(checkById(result.checks, 'T_s').value).toBeCloseTo(288, 1);
    expect(checkById(result.checks, 'F_HZ').value).toBeGreaterThanOrEqual(0.73);
    expect(checkById(result.checks, 'F_HZ').value).toBeLessThanOrEqual(0.75);
  });

  it('доля 100 % и уровень «Высокая»', () => {
    const result = computeEarthCalibration('optimistic');

    expect(result.total).toBe(6);
    expect(result.passed).toBe(6);
    expect(result.share).toBe(1);
    expect(result.sharePercent).toBe(100);
    expect(result.level).toBe('high');
    expect(result.checks.every((check) => check.passed)).toBe(true);
  });

  it('консервативные границы дают F_HZ ≈ 0.25, а доля считается по оптимистичным', () => {
    const result = computeEarthCalibration('conservative');

    expect(result.fHzCurrent).not.toBeNull();
    expect(result.fHzCurrent ?? 0).toBeCloseTo(0.25, 2);
    expect(result.fHzOptimistic ?? 0).toBeCloseTo(0.74, 2);
    expect(checkById(result.checks, 'F_HZ').value).toBeCloseTo(0.74, 2);
    expect(result.passed).toBe(6);
    expect(result.level).toBe('high');
  });

  it('оптимистичные границы дают контрольные 0.74', () => {
    const result = computeEarthCalibration('optimistic');

    expect(result.fHzCurrent ?? 0).toBeCloseTo(0.74, 2);
  });

  it('эталонные значения для подписи блока — 1.00 R⊕ / 1.00 M⊕ / 288 K', () => {
    const result = computeEarthCalibration();

    expect(result.reference).toEqual({ R: 1, M: 1, T_s: 288 });
    expect(result.planet.R.value).toBe(1);
    expect(result.planet.M.value).toBe(1);
  });
});
