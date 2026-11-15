import type { RenderGaps } from './renderGaps';
import type { SolverFlags } from '../types/solver';

/**
 * Недостающие параметры для отрисовки (задача 27; п. 9.2; U38).
 *
 * Один список используется подсказкой `stub.missing`, знаком вопроса,
 * бейджем «Недостаточно данных для отрисовки» и причиной недоступности
 * цели «Звезда». Повторы формулировок удаляются, порядок фиксирован:
 * планета → звезда → исключённые субиндексы.
 */

/** Один недостающий параметр. */
export interface MissingItem {
  /** Исходный ключ пробела или субиндекса. */
  key: string;
  /** Текст для пользователя. */
  label: string;
}

/** Минимальные данные детали планеты. */
export interface MissingDetail {
  /** Пробелы данных для отрисовки. */
  gaps: RenderGaps;
  /** Разрешённая планета с флагами решателя. */
  resolved: { flags: SolverFlags };
}

/** Подписи пробелов планеты. */
const PLANET_GAP_LABELS: Readonly<Record<string, string>> = {
  R: 'радиус планеты',
  T_eq: 'равновесная температура планеты',
};

/** Подписи пробелов звезды. */
const STAR_GAP_LABELS: Readonly<Record<string, string>> = {
  st_teff: 'температура звезды',
  L_or_st_rad: 'светимость или радиус звезды',
};

/** Подписи исключённых субиндексов. */
const SUBINDEX_LABELS: Readonly<Record<string, string>> = {
  ESI_R: 'радиус планеты',
  ESI_rho: 'плотность (масса и радиус)',
  ESI_ve: 'вторая космическая скорость (масса и радиус)',
  F_HZ: 'параметры звезды или орбиты (температура звезды, светимость, большая полуось)',
};

/** Область списка. */
export type MissingScope = 'all' | 'planet' | 'star';

/** Добавляет подпись, если её ещё нет. */
function pushUnique(items: MissingItem[], key: string, label: string | undefined): void {
  if (label === undefined) return;
  if (items.some((item) => item.label === label)) return;

  items.push({ key, label });
}

/**
 * Собирает список недостающих параметров.
 *
 * @param detail Деталь планеты с пробелами и флагами решателя.
 * @param scope Какие группы включать; по умолчанию все.
 */
export function missingParams(detail: MissingDetail, scope: MissingScope = 'all'): MissingItem[] {
  const items: MissingItem[] = [];

  if (scope !== 'star') {
    for (const key of detail.gaps.planet) {
      pushUnique(items, key, PLANET_GAP_LABELS[key]);
    }
  }

  if (scope !== 'planet') {
    for (const key of detail.gaps.star) {
      pushUnique(items, key, STAR_GAP_LABELS[key]);
    }
  }

  if (scope !== 'star' && detail.resolved.flags.insufficient_data) {
    for (const key of detail.resolved.flags.excluded_subindices) {
      pushUnique(items, key, SUBINDEX_LABELS[key]);
    }
  }

  return items;
}
