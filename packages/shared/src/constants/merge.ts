/**
 * Константы дедупликации и слияния записей из разных источников
 * (задача 10, п. 7 сухой спецификации).
 *
 * Все пороги сравнения и порядки приоритетов заданы здесь — внутри функций
 * слияния литералов быть не должно.
 */

import type { RawParamKey } from '../types/planet';
import type { SourceId } from '../types/provenance';

/** Допуск углового расстояния при слиянии по координатам [″] (п. 7.2, R3/R4). */
export const COORD_TOLERANCE_ARCSEC = 5;

/** Относительный допуск сравнения периодов в R4 (п. 7.2). */
export const PERIOD_REL_TOL = 0.01;

/** Относительный допуск сравнения больших полуосей в R4 (п. 7.2). */
export const SMA_REL_TOL = 0.02;

/**
 * Вето R3: относительная разница периодов, выше которой слияние по
 * координатам запрещено (п. 7.2) — защита от склейки соседних планет
 * одной звезды с размытыми координатами каталогов.
 */
export const PERIOD_VETO_REL = 0.1;

/**
 * Порог расхождения значений одного поля (п. 7.3): кандидаты, отличающиеся
 * от победителя слабее, в alternatives не попадают.
 */
export const ALT_REL_EPS = 1e-6;

/** Размер ячейки пространственной сетки поиска пар [°] (п. 7.2). */
export const MERGE_GRID_CELL_DEG = 0.01;

/** Широта, выше которой пары ищутся по всей полосе по Dec без разбиения по RA [°]. */
export const MERGE_POLAR_DEC_DEG = 85;

/**
 * Ключи, кандидаты которых берутся только из записей планет (pl_*, п. 7.3).
 * Остальные ключи `RawParamKey` (st_*, sy_dist, ra, dec) разрешаются
 * по `STAR_PARAM_PRIORITY` из `constants/sources.ts`.
 */
export const PLANET_PARAM_KEYS: readonly RawParamKey[] = [
  'pl_rade',
  'pl_bmasse',
  'pl_orbsmax',
  'pl_orbper',
  'pl_orbeccen',
  'pl_insol',
  'pl_eqt',
];

/** Ключи, кандидаты которых приходят и от записей планет, и от StarRecord (п. 7.3). */
export const STAR_FIELD_KEYS: readonly RawParamKey[] = [
  'st_teff',
  'st_rad',
  'st_mass',
  'st_lum',
  'sy_dist',
  'ra',
  'dec',
];

/**
 * Порядок источников для планетных параметров `pl_*` (п. 7.3, U6).
 *
 * Exo.MAST остаётся вторым по приоритету, хотя в статической сборке
 * не участвует: он ленивый per-planet источник (п. 10.1.4, U6).
 */
export const PLANET_PARAM_PRIORITY: SourceId[] = ['exomast', 'nasa', 'exoplanet_eu', 'exomercat'];
