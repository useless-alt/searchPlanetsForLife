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
 * `id` — стабильный идентификатор: slug канонического имени
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
  /** Синонимы имени родительской звезды из разных каталогов (задача 10). */
  hostAliases: string[];
  /** Источники, из которых получена запись («N ист.», п. 13.4). */
  sources: SourceId[];
  /** Предупреждения слияния, строки на русском (задача 10, п. 7). */
  warnings: string[];
  /** Значения сырых параметров из каталогов. */
  params: Record<RawParamKey, ParamValue>;
}

/**
 * Правило дедупликации, по которому выполнено объединение записей (п. 7.2):
 * R1 — имя; R2 — звезда + компонент; R3 — координаты + компонент;
 * R4 — орбитальные параметры (дополнительный признак).
 */
export type MergeRule = 'R1' | 'R2' | 'R3' | 'R4';

/** Статистика дедупликации и слияния (п. 7, задача 10). */
export interface MergeStats {
  /** Число входных записей планет по каждому источнику. */
  recordsBySource: Record<SourceId, number>;
  /** Число уникальных планет после слияния — N для всех счётчиков (п. 7.1). */
  uniquePlanets: number;
  /** Число кластеров из двух и более записей планет. */
  mergedClusters: number;
  /** Объединения, отклонённые ограничением уникальности источника. */
  rejectedUnions: number;
  /** Объединённые записи одного источника с одинаковым именем (настоящие дубли). */
  sameSourceDuplicates: number;
  /** Сколько объединений выполнено по каждому правилу (п. 7.2). */
  ruleCounts: Record<MergeRule, number>;
  /** Пары R3, заблокированные вето по периоду (п. 7.2). */
  vetoed: number;
}
