import { Q_BADGE_THRESHOLDS } from '@exo/shared';

import { ExtraOnly } from '../../extra/ExtraOnly';
import { ru } from '../../i18n/ru';
import type { AppStore } from '../../state/store';
import type { PlanetDetail, QLevel } from '../../workers/protocol';
import { Badge, type BadgeKind } from '../ui';

/**
 * Бейджи карточки планеты (задача 19; п. 9.5, 10.7).
 *
 * «Реконструкция по расчётной модели» показывается всегда при Уровне Б,
 * «Недостаточно данных для отрисовки» — по `gaps.planetStub`. Бейдж Q_data
 * относится к служебным данным и скрыт до включения режима (11.2).
 */

/** Вид бейджа Q_data по порогам U8. */
const Q_KIND: Record<QLevel, BadgeKind> = {
  high: 'quality-high',
  medium: 'quality-medium',
  estimated: 'quality-low',
};

/** Подписи уровня Q_data. */
const Q_LABEL: Record<QLevel, string> = {
  high: ru['table.q.high'],
  medium: ru['table.q.medium'],
  estimated: ru['table.q.estimated'],
};

/** Уровень Q_data по порогам U8. */
function qLevel(q: number): QLevel {
  if (q >= Q_BADGE_THRESHOLDS.high) return 'high';
  if (q >= Q_BADGE_THRESHOLDS.medium) return 'medium';

  return 'estimated';
}

/** Пропсы бейджей. */
export interface PlanetBadgesProps {
  /** Деталь планеты. */
  detail: PlanetDetail;
  /** Хранилище для режима служебных данных. */
  store?: AppStore;
}

/** Бейджи состояния карточки. */
export function PlanetBadges({ detail, store }: PlanetBadgesProps) {
  const { flags } = detail.resolved;
  const reconstructed = flags.levelB_mass || flags.levelB_radius;
  const level = detail.score === null ? null : qLevel(detail.score.Q_data);

  return (
    <div className="planet-card__badges">
      {reconstructed ? (
        <span data-help-key="badge.recon" data-help-planet={detail.id}>
          <Badge kind="reconstructed" label={ru['badge.reconstructed']} />
        </span>
      ) : null}

      {detail.gaps.planetStub ? (
        <span data-help-key="badge.noData" data-help-planet={detail.id}>
          <Badge kind="insufficient" label={ru['badge.insufficient']} />
        </span>
      ) : null}

      {level === null ? null : (
        <ExtraOnly id="card.qdata" store={store}>
          <span data-help-key={`badge.q.${level}`} data-help-planet={detail.id}>
            <Badge kind={Q_KIND[level]} label={Q_LABEL[level]} />
          </span>
        </ExtraOnly>
      )}
    </div>
  );
}
