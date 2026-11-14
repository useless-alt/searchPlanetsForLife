import { GREENHOUSE_DELTA_K } from '../constants/solver';
import { SPECTRAL_THRESHOLDS } from '../constants/spectral';
import type { ScoreBreakdown } from '../types/scoring';
import type { FilterState, ModelSettings, Range, SpectralClass } from '../types/settings';
import type { ResolvedPlanet } from '../types/solver';

import { isCandidate } from './score';

/**
 * Фильтрация Топ-50 (п. 10.5).
 *
 * Фильтры работают по параметрам планеты и по разложению балла текущего
 * режима. Все правила детерминированы: пустая граница диапазона означает
 * «без ограничения», а отсутствующее значение параметра при заданной границе
 * отбрасывает планету.
 *
 * Поиск (`filters.search`) в фильтрации не участвует: он только подсвечивает
 * строки и метки (Задача 14).
 */

/** Запись, которую можно отфильтровать. */
export interface FilterInput {
  /** Планета-источник. */
  planet: ResolvedPlanet;
  /** Разложение балла текущего режима; `index` может быть `null` (U20). */
  score: ScoreBreakdown;
}

/**
 * Спектральный класс звезды по эффективной температуре (U9).
 *
 *   O ≥ 30000; B ≥ 10000; A ≥ 7500; F ≥ 6000; G ≥ 5200; K ≥ 3900; M < 3900 К.
 *
 * Отсутствующая или некорректная температура — класс неизвестен (`null`).
 */
export function spectralClass(st_teff: number | null): SpectralClass | null {
  if (st_teff === null || !Number.isFinite(st_teff)) return null;

  for (const threshold of SPECTRAL_THRESHOLDS) {
    if (st_teff >= threshold.minTeff) return threshold.cls;
  }

  return null;
}

/**
 * Температура поверхности планеты: T_s = T_eq + 33 (К).
 *
 * Отсутствующая равновесная температура — температура неизвестна (`null`).
 */
export function surfaceTemperature(T_eq: number | null): number | null {
  if (T_eq === null || !Number.isFinite(T_eq)) return null;

  return T_eq + GREENHOUSE_DELTA_K;
}

/**
 * Проверка попадания значения в диапазон.
 *
 * `null` в границе — ограничения нет. Значение `null` при заданной границе
 * не проходит: неизвестный параметр не может удовлетворить ограничение.
 */
export function withinRange(value: number | null, range: Range): boolean {
  const min = range.min !== null && Number.isFinite(range.min) ? range.min : null;
  const max = range.max !== null && Number.isFinite(range.max) ? range.max : null;

  if (min === null && max === null) return true;
  if (value === null || !Number.isFinite(value)) return false;
  if (min !== null && value < min) return false;
  if (max !== null && value > max) return false;

  return true;
}

/**
 * «Геометрические» фильтры: спектральный класс, радиус, температура
 * поверхности и эксцентриситет.
 *
 * Эти фильтры не зависят от режима расчёта, от порога Q_data и от
 * переключателя «Показывать кандидатов», поэтому применяются и к основному
 * набору, и к набору для базового классического ранга (U21).
 */
export function applyAttributeFilters(
  rows: readonly FilterInput[],
  filters: FilterState,
): FilterInput[] {
  return rows.filter((row) => {
    const { planet } = row;

    // Спектральный класс: пустой список — без ограничения;
    // неизвестный класс при непустом списке отбрасывается.
    if (filters.spectralClasses.length > 0) {
      const cls = spectralClass(planet.st_teff.value);
      if (cls === null || !filters.spectralClasses.includes(cls)) return false;
    }

    // Радиус планеты [R⊕].
    if (!withinRange(planet.R.value, filters.radius)) return false;

    // Температура поверхности [К].
    if (!withinRange(surfaceTemperature(planet.T_eq.value), filters.T_s)) return false;

    // Эксцентриситет: берётся из ResolvedPlanet.e, включая принятый ноль.
    if (!withinRange(planet.e.value, filters.e)) return false;

    return true;
  });
}

/**
 * Полный набор фильтров панели (10.5.2).
 *
 * К геометрическим фильтрам добавляются:
 *   - порог достоверности `Q_data ≥ settings.qMin − 1e-9`
 *     (ползунок работает независимо от чекбокса `qdata`);
 *   - переключатель «Показывать кандидатов»: при `includeCandidates = false`
 *     записи-кандидаты (неполные данные, балл 0.00) отбрасываются.
 */
export function applyFilters(
  rows: readonly FilterInput[],
  filters: FilterState,
  settings: ModelSettings,
): FilterInput[] {
  const geometric = applyAttributeFilters(rows, filters);

  return geometric.filter((row) => {
    // Порог Q_data: чекбокс штрафа `qdata` на него не влияет.
    if (row.score.Q_data < settings.qMin - 1e-9) return false;

    // Кандидаты (неполные данные) показываются только по запросу.
    if (!filters.includeCandidates && isCandidate(row.score)) return false;

    return true;
  });
}
