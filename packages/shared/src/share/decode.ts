import type { Range, SpectralClass } from '../types/settings';

import { parseMode } from './encode';
import {
  SHARE_SORT_KEYS,
  SHARE_SPECTRAL_ORDER,
  SHARE_SPECTRAL_SET,
  SHARE_VERSION,
  defaultSharedState,
  type DecodeResult,
  type SharedState,
} from './types';

/**
 * Устойчивый разбор ссылки (задача 20; 13.1, U45).
 *
 * Любое недопустимое значение отбрасывается отдельно: остальные параметры
 * продолжают действовать, а имя отброшенного попадает в `ignored`. Ссылка
 * чужой версии игнорируется целиком — частично применять её опаснее, чем
 * показать сообщение и оставить состояние по умолчанию.
 */

/** Вид диапазона: обычная величина или эксцентриситет. */
type RangeKind = 'plain' | 'eccentricity';

/** Разобранный диапазон. */
interface ParsedRange {
  /** Диапазон с проверенными границами. */
  range: Range;
}

/** Разбирает одну сторону диапазона; null — значение не число или отрицательное. */
function parseBound(raw: string, kind: RangeKind): { value: number | null } | null {
  const value = raw.trim();

  if (value === '') return { value: null };

  const number = Number(value);

  if (!Number.isFinite(number) || number < 0) return null;
  if (kind === 'eccentricity' && number > 1) return null;

  return { value: number };
}

/**
 * Разбирает диапазон `min..max`.
 *
 * Пустая сторона означает «без ограничения». Нечисловая или отрицательная
 * граница, эксцентриситет вне 0..1 и min > max делают диапазон недопустимым.
 */
function parseRange(raw: string, kind: RangeKind): ParsedRange | null {
  const parts = raw.split('..');

  if (parts.length !== 2) return null;

  const min = parseBound(parts[0] ?? '', kind);
  const max = parseBound(parts[1] ?? '', kind);

  if (min === null || max === null) return null;
  if (min.value !== null && max.value !== null && min.value > max.value) return null;

  return { range: { min: min.value, max: max.value } };
}

/** Читает штрафы из четырёхсимвольной строки `0/1`. */
function parsePenalties(
  raw: string,
): { rocky: boolean; ecc: boolean; star: boolean; qdata: boolean } | null {
  if (!/^[01]{4}$/.test(raw)) return null;

  return {
    rocky: raw[0] === '1',
    ecc: raw[1] === '1',
    star: raw[2] === '1',
    qdata: raw[3] === '1',
  };
}

/** Спектральные классы из параметра `cls`: недопустимые символы отбрасываются. */
function parseSpectralClasses(raw: string): { classes: SpectralClass[]; dirty: boolean } {
  const chars = [...raw];
  const dirty = chars.some((char) => !SHARE_SPECTRAL_SET.has(char));
  const selected = new Set(chars.filter((char) => SHARE_SPECTRAL_SET.has(char)));

  // Порядок ссылки канонический: decode(encode(s)) не зависит от порядка выбора.
  const classes = SHARE_SPECTRAL_ORDER.filter((cls) => selected.has(cls));

  return { classes, dirty };
}

/** Целое число процентов Q_data в диапазоне 75..100. */
function parseQPercent(raw: string): number | null {
  if (!/^\d+$/.test(raw)) return null;

  const value = Number(raw);

  return Number.isInteger(value) && value >= 75 && value <= 100 ? value : null;
}

/** Двузначный флаг `0/1`; null — значение недопустимо. */
function parseFlag(raw: string): boolean | null {
  if (raw === '1') return true;
  if (raw === '0') return false;

  return null;
}

/**
 * Разбирает хэш ссылки.
 *
 * @param hash Хэш с ведущим `#` или без него.
 * @returns Состояние и список отброшенных параметров.
 */
export function decodeShare(hash: string): DecodeResult {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;

  if (raw === '') return { state: {}, ignored: [] };

  const params = new URLSearchParams(raw);

  // Ссылка другой версии не применяется: формат мог измениться целиком.
  if (params.get('v') !== String(SHARE_VERSION)) {
    return { state: {}, ignored: ['v'] };
  }

  const state: SharedState = defaultSharedState();
  const ignored: string[] = [];

  const mode = params.get('m');
  if (mode !== null) {
    const parsed = parseMode(mode);

    if (parsed === null) ignored.push('m');
    else state.settings.mode = parsed;
  }

  const hz = params.get('hz');
  if (hz !== null) {
    if (hz === 'c') state.settings.hzBounds = 'conservative';
    else if (hz === 'o') state.settings.hzBounds = 'optimistic';
    else ignored.push('hz');
  }

  const pen = params.get('pen');
  if (pen !== null) {
    const penalties = parsePenalties(pen);

    if (penalties === null) ignored.push('pen');
    else state.settings.penalties = penalties;
  }

  const q = params.get('q');
  if (q !== null) {
    const percent = parseQPercent(q);

    if (percent === null) ignored.push('q');
    else state.settings.qMin = percent / 100;
  }

  const cls = params.get('cls');
  if (cls !== null) {
    const parsed = parseSpectralClasses(cls);

    state.filters.spectralClasses = parsed.classes;
    if (parsed.dirty) ignored.push('cls');
  }

  const radius = params.get('r');
  if (radius !== null) {
    const parsed = parseRange(radius, 'plain');

    if (parsed === null) ignored.push('r');
    else state.filters.radius = parsed.range;
  }

  const tSurface = params.get('t');
  if (tSurface !== null) {
    const parsed = parseRange(tSurface, 'plain');

    if (parsed === null) ignored.push('t');
    else state.filters.T_s = parsed.range;
  }

  const eccentricity = params.get('e');
  if (eccentricity !== null) {
    const parsed = parseRange(eccentricity, 'eccentricity');

    if (parsed === null) ignored.push('e');
    else state.filters.e = parsed.range;
  }

  const candidates = params.get('cand');
  if (candidates !== null) {
    const parsed = parseFlag(candidates);

    if (parsed === null) ignored.push('cand');
    else state.filters.includeCandidates = parsed;
  }

  const earth = params.get('earth');
  if (earth !== null) {
    const parsed = parseFlag(earth);

    if (parsed === null) ignored.push('earth');
    else state.filters.earthReference = parsed;
  }

  const sort = params.get('sort');
  if (sort !== null) {
    const parts = sort.split('.');
    const column = parts[0] ?? '';
    const dir = parts[1] ?? '';

    if (
      parts.length !== 2 ||
      !(SHARE_SORT_KEYS as readonly string[]).includes(column) ||
      (dir !== 'asc' && dir !== 'desc')
    ) {
      // Неизвестная колонка или направление — сортировка по рангу.
      ignored.push('sort');
    } else {
      state.sort = { column: column as SharedState['sort']['column'], dir };
    }
  }

  const planetId = params.get('p');
  if (planetId !== null) {
    if (planetId === '') ignored.push('p');
    else state.selectedPlanetId = planetId;
  }

  const open = params.get('open');
  if (open !== null) {
    const parsed = parseFlag(open);

    if (parsed === null) ignored.push('open');
    else state.planetCardOpen = parsed;
  }

  return { state, ignored };
}

/** Короткий псевдоним разборщика: `decode(hash)` (задача 20). */
export { decodeShare as decode };
