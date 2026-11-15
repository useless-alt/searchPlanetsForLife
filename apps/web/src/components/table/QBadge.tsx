import { formatMessage, ru } from '../../i18n/ru';
import type { QLevel } from '../../workers/protocol';
import { Badge, type BadgeKind } from '../ui';

/**
 * Бейдж достоверности Q_data в таблице (задача 16; U8).
 *
 * Подпись всегда несёт уровень словами и значение Q_data целым процентом:
 * «Высокая 96%». Цвет — вспомогательный признак, не единственный.
 */

/** Вид бейджа по уровню достоверности. */
const BADGE_KIND: Record<QLevel, BadgeKind> = {
  high: 'quality-high',
  medium: 'quality-medium',
  estimated: 'quality-low',
};

/** Подписи уровней из словаря. */
const LEVEL_LABEL: Record<QLevel, string> = {
  high: ru['table.q.high'],
  medium: ru['table.q.medium'],
  estimated: ru['table.q.estimated'],
};

/** Пропсы бейджа Q_data. */
export interface QBadgeProps {
  /** Уровень достоверности по порогам U8. */
  level: QLevel;
  /** Коэффициент достоверности 0..1. */
  value: number;
  /** Идентификатор планеты (подсказка задачи 17). */
  planetId: string;
}

/** Бейдж Q_data с уровнем и значением. */
export function QBadge({ level, value, planetId }: QBadgeProps) {
  const label = formatMessage(ru['table.q.label'], {
    level: LEVEL_LABEL[level],
    value: Math.round(value * 100),
  });

  return (
    <span data-help-key={`badge.q.${level}`} data-help-planet={planetId}>
      <Badge kind={BADGE_KIND[level]} label={label} />
    </span>
  );
}
