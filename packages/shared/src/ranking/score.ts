import { computeScore } from '../indices/indexes';
import type { ScoreBreakdown } from '../types/scoring';
import type { ModelSettings } from '../types/settings';
import type { ResolvedPlanet } from '../types/solver';

/**
 * Оценка планеты в текущем режиме расчёта (Задача 6).
 *
 * Функция вызывает формулу режима из Задачи 5 (`computeScore`); границы зоны
 * обитаемости берутся из `settings.hzBounds`. Планета, которую режим не
 * оценивает (U20), в Топ-50 не попадает.
 */

/**
 * Полное разложение балла в текущем режиме.
 *
 * В отличие от `scorePlanet` возвращает разложение всегда, даже когда режим
 * не применим к планете: в этом случае `index === null`, остальные поля
 * (Q_data, k, T_s, штрафы) заполнены и нужны фильтрам и счётчикам.
 */
export function scoreBreakdown(r: ResolvedPlanet, s: ModelSettings): ScoreBreakdown {
  return computeScore(s.mode, r, s);
}

/**
 * Балл планеты в текущем режиме.
 *
 * Возвращает `null`, если планета в этом режиме не оценивается (U20):
 * в RHI — нет F_HZ или ESI_interior, в «Упрощённом ESI» — нет S или R,
 * в «Строгий научный» — запись не `strict_complete`.
 */
export function scorePlanet(r: ResolvedPlanet, s: ModelSettings): ScoreBreakdown | null {
  const breakdown = scoreBreakdown(r, s);

  return breakdown.index === null ? null : breakdown;
}

/**
 * Балл в режиме «Упрощённый ESI (R, S)» — база для сдвига ранга (U21).
 *
 * `null`, если нет ESI_S или ESI_R: базового ранга у планеты нет.
 */
export function scoreClassicEsi(r: ResolvedPlanet, s: ModelSettings): ScoreBreakdown | null {
  const breakdown = computeScore('classic_esi', r, s);

  return breakdown.index === null ? null : breakdown;
}

/**
 * Балл в режиме «Строгий научный» — для счётчика строго измеренных планет.
 *
 * Записи без единого пропуска (`strict_complete`) в этом режиме не
 * оцениваются (U19, U20), поэтому считать их балл не имеет смысла.
 */
export function scoreStrict(r: ResolvedPlanet, s: ModelSettings): ScoreBreakdown | null {
  if (!r.flags.strict_complete) return null;

  const breakdown = computeScore('strict', r, s);

  return breakdown.index === null ? null : breakdown;
}

/**
 * Запись-кандидат: данных не хватило, содержательного балла нет (13.2).
 *
 * Кандидат — запись с неполными данными, у которой в текущем режиме получился
 * нулевой балл: в «Адаптивном» это ровно k < 3 (индекс 0.00). Такие записи
 * скрыты по умолчанию (чекбокс «Показывать кандидатов») и, если включены,
 * стоят в конце таблицы.
 *
 * Планеты, которым режим данных не хватает вовсе (`index === null`), кандидатами
 * не считаются: они и так не попадают в таблицу (U20). Благодаря этому
 * «Упрощённый ESI» сохраняет покрытие «планеты с S и R», а «Строгий научный» —
 * покрытие полностью измеренных записей.
 */
export function isCandidate(score: ScoreBreakdown): boolean {
  return score.insufficient_data && score.index === 0;
}

/**
 * Базовый балл упрощённого ESI из разложения любого режима.
 *
 * `indexClassicEsi = √(ESI_S · ESI_R)`; субиндексы ESI_S и ESI_R не зависят
 * от режима, поэтому базовый балл извлекается из уже посчитанного
 * разложения — без повторного расчёта всех субиндексов.
 *
 * `null`, если нет ESI_S или ESI_R: базового ранга у планеты нет.
 */
export function classicIndexOf(score: ScoreBreakdown): number | null {
  const { ESI_S, ESI_R } = score;

  if (ESI_S === null || ESI_R === null) return null;

  return Math.sqrt(ESI_S * ESI_R);
}

/**
 * Балл строгого научного режима из разложения любого режима.
 *
 * `√(ESI₄ · F_HZ)`, где `ESI₄ = (ESI_R·ESI_ρ·ESI_ve·ESI_S)^(1/4)` (U3).
 * Запись без единого пропуска (`strict_complete`) в этом режиме не
 * оценивается (U19, U20).
 */
export function strictIndexOf(score: ScoreBreakdown, strictComplete: boolean): number | null {
  if (!strictComplete) return null;

  const { ESI_R, ESI_rho, ESI_ve, ESI_S, F_HZ } = score;

  if (ESI_R === null || ESI_rho === null || ESI_ve === null || ESI_S === null || F_HZ === null) {
    return null;
  }

  const esi4 = (ESI_R * ESI_rho * ESI_ve * ESI_S) ** 0.25;

  return Math.sqrt(esi4 * F_HZ);
}
