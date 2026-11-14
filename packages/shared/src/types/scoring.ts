/**
 * Режим расчёта индекса (п. 3.1).
 *
 * classic_esi — «Упрощённый ESI (R, S)» (подпись по 13.1 как более поздняя, U2);
 * strict      — «Строгий научный».
 */
export type CalcMode = 'adaptive' | 'rhi' | 'classic_esi' | 'strict';

/**
 * Декомпозиция итогового балла: вклад субиндексов, штрафов и Q_data.
 *
 * `index` лежит в диапазоне 0..1; при `insufficient_data` равен 0.00.
 */
export interface ScoreBreakdown {
  /** Режим, в котором посчитан балл. */
  mode: CalcMode;
  /** Субиндекс радиуса. */
  ESI_R: number | null;
  /** Субиндекс плотности. */
  ESI_rho: number | null;
  /** Субиндекс второй космической скорости. */
  ESI_ve: number | null;
  /** Субиндекс потока излучения. */
  ESI_S: number | null;
  /** Субиндекс температуры поверхности. */
  ESI_T: number | null;
  /** Геофизическое подобие: (ESI_R·ESI_ρ·ESI_ve)^(1/3). */
  ESI_interior: number | null;
  /** Климатический балл зоны обитаемости. */
  F_HZ: number | null;
  /** Положение в зоне обитаемости. */
  HZD: number | null;
  /** Штраф за микронептун по разрыву Фултона. */
  P_rocky: number;
  /** Штраф за эксцентриситет. */
  P_ecc: number;
  /** Штраф за тип звезды (красные карлики). */
  P_star: number;
  /** Коэффициент достоверности данных. */
  Q_data: number;
  /** Итоговый индекс [0..1]. */
  index: number;
  /** Число доступных субиндексов k. */
  k: number;
  /** Число субиндексов n. */
  n: number;
}

/**
 * Строка рейтинга Топ-50.
 *
 * `delta` = rankClassic − rank; формат отображения «[+8]» / «[-12]» (п. 4.2).
 */
export interface RankedRow {
  /** Текущий ранг (1 — лучший). */
  rank: number;
  /** Глобальный ранг в режиме classic_esi; null — если режим не считается. */
  rankClassic: number | null;
  /** Сдвиг ранга относительно classic_esi; null — если нет базы для сравнения. */
  delta: number | null;
  /** Идентификатор планеты (U17). */
  planetId: string;
  /** Декомпозиция балла. */
  score: ScoreBreakdown;
}
