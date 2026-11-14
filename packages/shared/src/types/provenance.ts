/**
 * Происхождение значения параметра (п. 1.4 глобального контекста).
 *
 * measured — взято из каталога (зелёный);
 * physics  — вычислено по физическим законам (синий);
 * model    — оценено по эмпирической модели (жёлтый);
 * estimate — оценка без вывода из данных (цвет не задан, U15).
 */
export type Provenance = 'measured' | 'physics' | 'model' | 'estimate';

/**
 * Порядок «хуже — лучше»: происхождение результата вычисляется как худшее
 * из происхождений его входов, measured < physics < model < estimate.
 */
export const PROVENANCE_ORDER: Record<Provenance, number> = {
  measured: 0,
  physics: 1,
  model: 2,
  estimate: 3,
};

/** Идентификатор научного источника (п. 1.6). */
export type SourceId = 'gaia' | 'exomast' | 'nasa' | 'exoplanet_eu' | 'simbad' | 'exomercat';

/**
 * Значение параметра с происхождением.
 *
 * Инвариант: `value === null` ⇒ `provenance === null`.
 * Отсутствие значения = null; подстановка правдоподобных значений запрещена.
 */
export interface ParamValue {
  /** Числовое значение параметра; null — значение отсутствует. */
  value: number | null;
  /** Происхождение значения; null только вместе с null-значением. */
  provenance: Provenance | null;
  /** Источник, из которого взято значение. */
  source: SourceId | null;
  /** Дата получения значения (ISO 8601). */
  sourceDate: string | null;
  /** Признак, что значение пришло из резервной копии. */
  fromBackup: boolean;
  /** Альтернативные значения по другим источникам (для расхождений в карточке). */
  alternatives: Array<{ source: SourceId; value: number; sourceDate: string | null }>;
}
