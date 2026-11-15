import type { ScoreBreakdown } from '../types/scoring';
import type { ModelSettings } from '../types/settings';

/**
 * Разложение балла для карточки планеты (задача 19; п. 10.7, 13.5).
 *
 * `buildDecomposition` восстанавливает цепочку расчёта из готового
 * `ScoreBreakdown`: входы режима → базовый балл → множители штрафов →
 * итоговый индекс. Отдельный расчёт индексов не выполняется, поэтому
 * карточка всегда показывает ровно то число, которое попало в Топ-50.
 */

/** Идентификатор строки разложения; он же суффикс ключа подсказки `decomp.<id>`. */
export type DecompRowId =
  | 'ESI_R'
  | 'ESI_rho'
  | 'ESI_ve'
  | 'ESI_S'
  | 'ESI_interior'
  | 'F_HZ'
  | 'ESI4'
  | 'base'
  | 'P_rocky'
  | 'P_ecc'
  | 'P_star'
  | 'Q_data'
  | 'result';

/** Вид строки: вход, базовый балл, множитель или итог. */
export type DecompRowKind = 'input' | 'base' | 'factor' | 'result';

/**
 * Состояние строки:
 * - `used` — значение вошло в расчёт;
 * - `excluded` — значения нет, субиндекс исключён (Уровень В);
 * - `disabled` — множитель отключён настройкой, в расчёт вошла единица;
 * - `na` — строку нельзя применить (нет данных или режим не применим).
 */
export type DecompRowState = 'used' | 'excluded' | 'disabled' | 'na';

/** Строка таблицы «Декомпозиция балла». */
export interface DecompRow {
  /** Идентификатор строки. */
  id: DecompRowId;
  /** Вид строки. */
  kind: DecompRowKind;
  /** Значение, реально вошедшее в расчёт (для отключённого множителя — 1). */
  value: number | null;
  /** Сохранённое значение (для отключённого штрафа — то, что было бы). */
  rawValue: number | null;
  /** Состояние строки. */
  state: DecompRowState;
  /** Накопленный балл после применения строки. */
  cumulative: number | null;
  /** Изменение накопленного балла для множителя; всегда ≤ 0. */
  delta: number | null;
}

/** Результат разложения. */
export interface Decomposition {
  /** Строки сверху вниз: входы, база, множители, итог. */
  rows: DecompRow[];
  /** Пояснение над таблицей; null — пояснения нет. */
  note: string | null;
}

/** Тексты пояснений (п. 10.7). */
export const DECOMPOSITION_NOTES = {
  /** Штрафы не входят в классический и строгий режимы (U20). */
  noPenalties: 'В этом режиме штрафы не применяются',
  /** Мало данных для адаптивного индекса (п. 10.5). */
  insufficient: 'Недостаточно данных: доступно {k} из {n} субиндексов (нужно не менее 3)',
} as const;

/** Множители штрафов и Q_data: ключ настройки и строка разложения. */
interface FactorSpec {
  /** Идентификатор строки. */
  id: DecompRowId;
  /** Сохранённое значение из разложения. */
  raw: number;
  /** Чекбокс настройки, включающий множитель. */
  enabled: boolean;
}

/** Строка-вход: значение или «исключён». */
function inputRow(id: DecompRowId, value: number | null): DecompRow {
  const safe = value !== null && Number.isFinite(value) ? value : null;

  return {
    id,
    kind: 'input',
    value: safe,
    rawValue: safe,
    state: safe === null ? 'excluded' : 'used',
    cumulative: null,
    delta: null,
  };
}

/** Геометрическое среднее доступных значений. */
function geometricMean(values: ReadonlyArray<number | null>): number | null {
  const parts = values.filter((value): value is number => value !== null && Number.isFinite(value));

  if (parts.length === 0) return null;

  const product = parts.reduce((acc, value) => acc * value, 1);
  if (!Number.isFinite(product) || product <= 0) return null;

  const value = product ** (1 / parts.length);
  return Number.isFinite(value) ? value : null;
}

/** Корень n-й степени из произведения; null — хотя бы один вход отсутствует. */
function rootOfProduct(values: ReadonlyArray<number | null>, degree: number): number | null {
  if (values.some((value) => value === null || !Number.isFinite(value))) return null;

  const product = (values as number[]).reduce((acc, value) => acc * value, 1);
  if (!Number.isFinite(product) || product <= 0) return null;

  const value = product ** (1 / degree);
  return Number.isFinite(value) ? value : null;
}

/** Квадратный корень из произведения двух значений. */
function sqrtProduct(a: number | null, b: number | null): number | null {
  return rootOfProduct([a, b], 2);
}

/**
 * Базовый балл режима до штрафов.
 *
 *   adaptive    — геометрическое среднее доступных субиндексов;
 *   rhi         — √(ESI_interior · F_HZ);
 *   classic_esi — √(ESI_S · ESI_R);
 *   strict      — √(ESI₄ · F_HZ), ESI₄ = (R·ρ·v_e·S)^(1/4).
 */
function baseScore(score: ScoreBreakdown): number | null {
  switch (score.mode) {
    case 'adaptive':
      return geometricMean([score.ESI_R, score.ESI_rho, score.ESI_ve, score.F_HZ]);
    case 'rhi':
      return sqrtProduct(score.ESI_interior, score.F_HZ);
    case 'classic_esi':
      return sqrtProduct(score.ESI_S, score.ESI_R);
    case 'strict': {
      const esi4 = rootOfProduct([score.ESI_R, score.ESI_rho, score.ESI_ve, score.ESI_S], 4);
      return sqrtProduct(esi4, score.F_HZ);
    }
    default:
      return null;
  }
}

/** Входные строки режима (в порядке расчёта). */
function inputRows(score: ScoreBreakdown): DecompRow[] {
  switch (score.mode) {
    case 'adaptive':
      return [
        inputRow('ESI_R', score.ESI_R),
        inputRow('ESI_rho', score.ESI_rho),
        inputRow('ESI_ve', score.ESI_ve),
        inputRow('F_HZ', score.F_HZ),
      ];
    case 'rhi':
      // Вложенные входы ESI_interior показываются в режиме служебных данных.
      return [
        inputRow('ESI_R', score.ESI_R),
        inputRow('ESI_rho', score.ESI_rho),
        inputRow('ESI_ve', score.ESI_ve),
        inputRow('ESI_interior', score.ESI_interior),
        inputRow('F_HZ', score.F_HZ),
      ];
    case 'classic_esi':
      return [inputRow('ESI_S', score.ESI_S), inputRow('ESI_R', score.ESI_R)];
    case 'strict': {
      const rows = [
        inputRow('ESI_R', score.ESI_R),
        inputRow('ESI_rho', score.ESI_rho),
        inputRow('ESI_ve', score.ESI_ve),
        inputRow('ESI_S', score.ESI_S),
      ];
      const esi4 = rootOfProduct([score.ESI_R, score.ESI_rho, score.ESI_ve, score.ESI_S], 4);

      rows.push(inputRow('ESI4', esi4));
      rows.push(inputRow('F_HZ', score.F_HZ));
      return rows;
    }
    default:
      return [];
  }
}

/** Штрафы и Q_data, входящие в режим (adaptive и rhi, U20). */
function factorSpecs(score: ScoreBreakdown, settings: ModelSettings): FactorSpec[] {
  if (score.mode !== 'adaptive' && score.mode !== 'rhi') return [];

  return [
    { id: 'P_rocky', raw: score.P_rocky, enabled: settings.penalties.rocky },
    { id: 'P_ecc', raw: score.P_ecc, enabled: settings.penalties.ecc },
    { id: 'P_star', raw: score.P_star, enabled: settings.penalties.star },
    { id: 'Q_data', raw: score.Q_data, enabled: settings.penalties.qdata },
  ];
}

/**
 * Собирает разложение балла для таблицы карточки (п. 10.7).
 *
 * Инвариант для adaptive и rhi: `cumulative` строки `result` совпадает
 * с `score.index` с точностью 1e-9 — это то же произведение в том же
 * порядке, что и в формулах Задачи 5.
 */
export function buildDecomposition(score: ScoreBreakdown, settings: ModelSettings): Decomposition {
  const rows: DecompRow[] = inputRows(score);

  const base = baseScore(score);

  rows.push({
    id: 'base',
    kind: 'base',
    value: base,
    rawValue: base,
    state: base === null ? 'na' : 'used',
    cumulative: base,
    delta: null,
  });

  let cumulative = base;

  for (const factor of factorSpecs(score, settings)) {
    const value = factor.enabled ? factor.raw : 1;
    const previous = cumulative;
    const next = previous === null ? null : previous * value;
    const delta = !factor.enabled ? 0 : previous !== null && next !== null ? next - previous : null;

    rows.push({
      id: factor.id,
      kind: 'factor',
      value,
      rawValue: factor.raw,
      state: factor.enabled ? 'used' : 'disabled',
      cumulative: next,
      delta,
    });

    cumulative = next;
  }

  // В «Адаптивном» при k < 3 индекс по определению равен 0.00 (U20),
  // в остальных режимах insufficient_data относится к набору адаптивных
  // субиндексов и не обнуляет уже посчитанный балл.
  const adaptiveInsufficient = score.mode === 'adaptive' && score.insufficient_data;
  const resultValue = adaptiveInsufficient ? 0 : score.index;

  rows.push({
    id: 'result',
    kind: 'result',
    value: resultValue,
    rawValue: score.index,
    state: resultValue === null ? 'na' : adaptiveInsufficient ? 'na' : 'used',
    cumulative: resultValue,
    delta: null,
  });

  let note: string | null = null;

  if (adaptiveInsufficient) {
    note = DECOMPOSITION_NOTES.insufficient
      .replace('{k}', String(score.k))
      .replace('{n}', String(score.n));
  } else if (score.mode === 'classic_esi' || score.mode === 'strict') {
    note = DECOMPOSITION_NOTES.noPenalties;
  }

  return { rows, note };
}
