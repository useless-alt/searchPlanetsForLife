import type { Provenance } from '@exo/shared';

import { ru } from '../../i18n/ru';
import { Badge, type BadgeKind } from '../ui';

/**
 * Маркер происхождения значения (задача 19; п. 4.3, 11.1, U15).
 *
 * Цвет — только вспомогательный признак: метка всегда содержит текст
 * («Измерено», «Физика», «Модель», «Оценка»), а отсутствие значения даёт
 * «Нет данных» вместо пустого места.
 */

/** Вид бейджа по происхождению. */
const BADGE_KIND: Record<Provenance, BadgeKind> = {
  measured: 'measured',
  physics: 'physics',
  model: 'model',
  estimate: 'estimate',
};

/** Текстовая метка происхождения. */
const BADGE_LABEL: Record<Provenance, string> = {
  measured: ru['provenance.measured'],
  physics: ru['provenance.physics'],
  model: ru['provenance.model'],
  estimate: ru['provenance.estimate'],
};

/** Пропсы маркера. */
export interface OriginBadgeProps {
  /** Происхождение значения; null — значения нет. */
  provenance: Provenance | null;
  /** Идентификатор планеты для подсказки. */
  planetId: string;
}

/** Маркер происхождения с текстовой меткой. */
export function OriginBadge({ provenance, planetId }: OriginBadgeProps) {
  if (provenance === null) {
    return (
      <span data-help-key="badge.noData" data-help-planet={planetId}>
        <Badge kind="neutral" label={ru['provenance.none']} />
      </span>
    );
  }

  return (
    <span data-help-key={`badge.origin.${provenance}`} data-help-planet={planetId}>
      <Badge kind={BADGE_KIND[provenance]} label={BADGE_LABEL[provenance]} />
    </span>
  );
}
