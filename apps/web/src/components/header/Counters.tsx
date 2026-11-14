import type { RankingCounters } from '@exo/shared';

import { formatMessage, ru } from '../../i18n/ru';

/**
 * Счётчики выборки в шапке (задача 13; п. 4.1, 10.2, 13.1).
 *
 * Формат: «Всего в базе: N | Рассчитано: N₁ | В строго измеренных: N₂»,
 * где N — число уникальных планет после дедупликации, N₁ и N₂ — результаты
 * текущего расчёта. Числа форматируются с разделителем тысяч (ru-RU).
 *
 * Счётчики — служебные данные: по п. 11.2 (U12) они скрыты, пока
 * пользователь не включит «Показать дополнительные данные».
 */

/** Формат чисел с разделителем тысяч (ru-RU). */
const NUMBER_FORMAT = new Intl.NumberFormat('ru-RU');

/** Пропсы счётчиков. */
export interface CountersProps {
  /** Счётчики текущего расчёта; null — расчёта ещё не было. */
  counters: RankingCounters | null;
}

/** Счётчики выборки. */
export function Counters({ counters }: CountersProps) {
  const text = formatMessage(ru['header.counters'], {
    total: NUMBER_FORMAT.format(counters?.total ?? 0),
    computed: NUMBER_FORMAT.format(counters?.computed ?? 0),
    strict: NUMBER_FORMAT.format(counters?.strictMeasured ?? 0),
  });

  return <p className="header__counters">{text}</p>;
}
