import {
  CALIBRATION_THRESHOLDS,
  EARTH_REFERENCE_RECORD,
  EARTH_REFERENCE_VALUES,
  computeHz,
  computeSubindices,
  solvePlanet,
  type HzBounds,
  type ResolvedPlanet,
} from '@exo/shared';

/**
 * Калибровка «Земля (эталон)» (задача 15; п. 13.3, U11, U35).
 *
 * Эталон прогоняется через тот же `solvePlanet`, что и каталог, и через
 * функции индексов в основном потоке. Функция чистая: ранжирование,
 * таблицу и карту она не меняет — блок только диагностический (U35).
 */

/** Идентификатор проверки калибровки. */
export type EarthCheckId = 'ESI_R' | 'ESI_rho' | 'ESI_ve' | 'ESI_S' | 'T_s' | 'F_HZ';

/** Уровень калибровки по отдельной шкале U35. */
export type CalibrationLevel = 'high' | 'medium' | 'low';

/** Одна проверка эталона. */
export interface EarthCheck {
  /** Идентификатор проверки. */
  id: EarthCheckId;
  /** Полученное значение; null — величина не вычислилась. */
  value: number | null;
  /** Эталонное значение. */
  expected: number;
  /** Допуск проверки. */
  tolerance: number;
  /** Проверка пройдена. */
  passed: boolean;
}

/** Результат калибровки «Земля (эталон)». */
export interface EarthCalibrationResult {
  /** Эталон после `solvePlanet`. */
  planet: ResolvedPlanet;
  /** Шесть проверок из 13.3. */
  checks: EarthCheck[];
  /** Число пройденных проверок. */
  passed: number;
  /** Всего проверок (6). */
  total: number;
  /** Доля пройденных проверок [0..1]. */
  share: number;
  /** Доля в процентах с одним знаком. */
  sharePercent: number;
  /** Уровень по шкале калибровки U35. */
  level: CalibrationLevel;
  /** Контрольный F_HZ для текущих границ `settings.hzBounds`. */
  fHzCurrent: number | null;
  /** Контрольный F_HZ для оптимистичных границ (U11). */
  fHzOptimistic: number | null;
  /** Границы, для которых посчитан `fHzCurrent`. */
  hzBounds: HzBounds;
  /** Эталонные значения для подписи блока. */
  reference: typeof EARTH_REFERENCE_VALUES;
}

/** Проверка «значение близко к эталону». */
function check(
  id: EarthCheckId,
  value: number | null,
  expected: number,
  tolerance: number,
): EarthCheck {
  return {
    id,
    value,
    expected,
    tolerance,
    passed: value !== null && Math.abs(value - expected) <= tolerance,
  };
}

/** Уровень калибровки по доле пройденных проверок (U35). */
function calibrationLevel(share: number): CalibrationLevel {
  if (share >= CALIBRATION_THRESHOLDS.high) return 'high';
  if (share >= CALIBRATION_THRESHOLDS.medium) return 'medium';

  return 'low';
}

/**
 * Считает калибровку эталона для заданных границ зоны обитаемости.
 *
 * Проверка F_HZ в доле всегда считается по оптимистичным границам (U11):
 * именно для них эталон даёт 0.74. `fHzCurrent` показывает значение для
 * выбранных пользователем границ и на долю не влияет.
 */
export function computeEarthCalibration(
  hzBounds: HzBounds = 'conservative',
): EarthCalibrationResult {
  const planet = solvePlanet(EARTH_REFERENCE_RECORD);
  const esi = computeSubindices(planet);

  const optimistic = computeHz({
    st_teff: planet.st_teff.value,
    L: planet.L.value,
    d: planet.d.value,
    e: planet.e.value,
    bounds: 'optimistic',
  });

  const current = computeHz({
    st_teff: planet.st_teff.value,
    L: planet.L.value,
    d: planet.d.value,
    e: planet.e.value,
    bounds: hzBounds,
  });

  const checks: EarthCheck[] = [
    check('ESI_R', esi.ESI_R, 1, 0.01),
    check('ESI_rho', esi.ESI_rho, 1, 0.01),
    check('ESI_ve', esi.ESI_ve, 1, 0.01),
    check('ESI_S', esi.ESI_S, 1, 0.01),
    check('T_s', esi.T_s, EARTH_REFERENCE_VALUES.T_s, 1),
    check('F_HZ', optimistic.F_HZ, 0.74, 0.01),
  ];

  const passed = checks.filter((item) => item.passed).length;
  const total = checks.length;
  const share = passed / total;

  return {
    planet,
    checks,
    passed,
    total,
    share,
    sharePercent: Math.round(share * 1000) / 10,
    level: calibrationLevel(share),
    fHzCurrent: current.F_HZ,
    fHzOptimistic: optimistic.F_HZ,
    hzBounds,
    reference: EARTH_REFERENCE_VALUES,
  };
}
