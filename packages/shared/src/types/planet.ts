import type { ParamValue, SourceId } from './provenance';

/**
 * Ключи «сырых» параметров в исходных колонках каталогов.
 *
 * Имена pl_orbsmax, pl_orbper, pl_insol, pl_eqt, st_teff, st_rad, st_mass, st_lum
 * заданы в ТЗ. Остальные — имена колонок NASA, в ТЗ явно не названы.
 */
export type RawParamKey =
  | 'pl_rade'
  | 'pl_bmasse'
  | 'pl_orbsmax'
  | 'pl_orbper'
  | 'pl_orbeccen'
  | 'pl_insol'
  | 'pl_eqt'
  | 'st_teff'
  | 'st_rad'
  | 'st_mass'
  | 'st_lum'
  | 'sy_dist'
  | 'ra'
  | 'dec';

/**
 * Запись планеты после слияния источников (черновик PlanetRecord).
 *
 * `id` — стабильный идентификатор: нормализованное каноническое имя
 * (нижний регистр, пробелы → «-», U17).
 */
export interface PlanetRecord {
  /** Стабильный идентификатор записи (U17). */
  id: string;
  /** Отображаемое имя планеты. */
  name: string;
  /** Синонимы и альтернативные имена из разных каталогов. */
  aliases: string[];
  /** Имя родительской звезды. */
  hostname: string;
  /** Буква планеты у звезды (b..z); null — если не определена. */
  letter: string | null;
  /** Источники, из которых получена запись («N ист.», п. 13.4). */
  sources: SourceId[];
  /** Значения сырых параметров из каталогов. */
  params: Record<RawParamKey, ParamValue>;
}
