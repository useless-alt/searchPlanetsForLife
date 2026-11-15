import { DEFAULT_SETTINGS, type Range } from '../types/settings';
import type { CalcMode } from '../types/scoring';

import { SHARE_SPECTRAL_ORDER, SHARE_VERSION, type SharedState } from './types';

/**
 * Кодирование состояния в параметры ссылки (задача 20; 13.1, U45).
 *
 * Значения по умолчанию не попадают в ссылку (кроме версии `v`): короткая
 * ссылка остаётся короткой, а умолчания можно менять в одном месте.
 */

/** Число в параметре диапазона; null — граница не задана. */
function bound(value: number | null): string {
  return value === null || !Number.isFinite(value) ? '' : String(value);
}

/** Диапазон в виде `min..max`; обе пустые стороны означают «без ограничения». */
function encodeRange(range: Range): string | null {
  if (range.min === null && range.max === null) return null;

  return `${bound(range.min)}..${bound(range.max)}`;
}

/** Спектральные классы в каноническом порядке (`MKGFABO`). */
function encodeSpectralClasses(classes: readonly string[]): string {
  const selected = new Set(classes);

  return SHARE_SPECTRAL_ORDER.filter((cls) => selected.has(cls)).join('');
}

/** Настройки модели в параметрах ссылки. */
function encodeSettings(params: URLSearchParams, state: SharedState): void {
  const { settings } = state;

  if (settings.mode !== DEFAULT_SETTINGS.mode) params.set('m', settings.mode);

  if (settings.hzBounds !== DEFAULT_SETTINGS.hzBounds) {
    params.set('hz', settings.hzBounds === 'conservative' ? 'c' : 'o');
  }

  const penalties = [
    settings.penalties.rocky,
    settings.penalties.ecc,
    settings.penalties.star,
    settings.penalties.qdata,
  ]
    .map((enabled) => (enabled ? '1' : '0'))
    .join('');

  if (penalties !== '1111') params.set('pen', penalties);

  const qPercent = Math.round(settings.qMin * 100);

  if (qPercent !== 75) params.set('q', String(qPercent));
}

/** Фильтры в параметрах ссылки. */
function encodeFilters(params: URLSearchParams, state: SharedState): void {
  const { filters } = state;
  const classes = encodeSpectralClasses(filters.spectralClasses);

  if (classes !== '') params.set('cls', classes);

  const radius = encodeRange(filters.radius);
  if (radius !== null) params.set('r', radius);

  const tSurface = encodeRange(filters.T_s);
  if (tSurface !== null) params.set('t', tSurface);

  const eccentricity = encodeRange(filters.e);
  if (eccentricity !== null) params.set('e', eccentricity);

  if (filters.includeCandidates) params.set('cand', '1');
  if (filters.earthReference) params.set('earth', '1');
}

/** Сортировка в параметре `sort`. */
function encodeSort(params: URLSearchParams, state: SharedState): void {
  const { column, dir } = state.sort;

  if (column !== 'rank' || dir !== 'asc') params.set('sort', `${column}.${dir}`);
}

/**
 * Кодирует состояние в строку параметров без ведущего `#`.
 *
 * Полный адрес собирает клиент: `origin + pathname + '#' + encodeShare(state)`.
 */
export function encodeShare(state: SharedState): string {
  const params = new URLSearchParams();

  params.set('v', String(SHARE_VERSION));
  encodeSettings(params, state);
  encodeFilters(params, state);
  encodeSort(params, state);

  if (state.selectedPlanetId !== null && state.selectedPlanetId !== '') {
    params.set('p', state.selectedPlanetId);
  }

  if (state.planetCardOpen) params.set('open', '1');

  return params.toString();
}

/** Режим расчёта по значению параметра `m`; null — значение неизвестно. */
export function parseMode(value: string): CalcMode | null {
  if (value === 'adaptive' || value === 'rhi' || value === 'classic_esi' || value === 'strict') {
    return value;
  }

  return null;
}

/** Короткий псевдоним кодировщика: `encode(state)` (задача 20). */
export { encodeShare as encode };
