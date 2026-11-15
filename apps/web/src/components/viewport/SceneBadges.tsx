import { missingParams, Q_BADGE_THRESHOLDS } from '@exo/shared';
import { useStore } from 'zustand';

import { ExtraOnly } from '../../extra/ExtraOnly';
import { hideHelp, showHelpAt } from '../../help/api';
import { formatMessage, ru } from '../../i18n/ru';
import { appStore, type AppStore } from '../../state/store';
import type { PlanetDetail, QLevel } from '../../workers/protocol';
import { Badge, type BadgeKind } from '../ui';

/**
 * Бейджи состояния 3D-сцены (задача 27; п. 9.5, 10.9.7).
 *
 * Левый нижний угол, стопка над переключателем цели: реконструкция,
 * недостаток данных для отрисовки и Q_data. Q_data — служебные данные и
 * показывается только через `ExtraOnly`.
 */

/** Вид бейджа Q_data. */
const Q_KIND: Record<QLevel, BadgeKind> = {
  high: 'quality-high',
  medium: 'quality-medium',
  estimated: 'quality-low',
};

/** Подписи Q_data. */
const Q_LABEL: Record<QLevel, string> = {
  high: ru['table.q.high'],
  medium: ru['table.q.medium'],
  estimated: ru['table.q.estimated'],
};

/** Уровень Q_data по порогам U8. */
function qLevel(value: number): QLevel {
  if (value >= Q_BADGE_THRESHOLDS.high) return 'high';
  if (value >= Q_BADGE_THRESHOLDS.medium) return 'medium';

  return 'estimated';
}

/** Пропсы бейджей сцены. */
export interface SceneBadgesProps {
  /** Хранилище; в тестах подставляется изолированное. */
  store?: AppStore;
}

/** Показывает подсказку с недостающими параметрами. */
function showMissing(element: HTMLElement, detail: PlanetDetail): void {
  const rect = element.getBoundingClientRect();

  showHelpAt({
    key: 'stub.missing',
    ctx: { missing: missingParams(detail).map((item) => item.label) },
    x: rect.left + rect.width / 2,
    y: rect.top,
  });
}

/** Бейджи в углу вьюпорта. */
export function SceneBadges({ store = appStore }: SceneBadgesProps) {
  const viewMode = useStore(store, (state) => state.viewMode);
  const detail = useStore(store, (state) => state.sceneDetail);

  if (viewMode !== 'system' || detail === null) return null;

  const { flags } = detail.resolved;
  const reconstructed = flags.levelB_mass || flags.levelB_radius;
  const insufficient = detail.gaps.planetStub || detail.gaps.starStub;
  const level = detail.score === null ? null : qLevel(detail.score.Q_data);

  return (
    <div className="scene-badges">
      {reconstructed ? (
        <span
          className="scene-badges__item"
          data-help-key="badge.recon"
          data-help-planet={detail.id}
        >
          <Badge kind="reconstructed" label={ru['badge.reconstructed']} />
        </span>
      ) : null}

      {insufficient ? (
        <span
          className="scene-badges__item"
          data-help-key="stub.missing"
          data-help-planet={detail.id}
          tabIndex={0}
          onPointerEnter={(event) => showMissing(event.currentTarget, detail)}
          onPointerLeave={hideHelp}
          onFocus={(event) => showMissing(event.currentTarget, detail)}
          onBlur={hideHelp}
        >
          <Badge kind="insufficient" label={ru['badge.insufficient']} />
        </span>
      ) : null}

      {level === null ? null : (
        <ExtraOnly id="scene.qdata" store={store}>
          <span
            className="scene-badges__item"
            data-help-key="val.Q_data"
            data-help-planet={detail.id}
          >
            <Badge
              kind={Q_KIND[level]}
              label={formatMessage(ru['table.q.label'], {
                level: Q_LABEL[level],
                value: String(Math.round((detail.score?.Q_data ?? 0) * 100)),
              })}
            />
          </span>
        </ExtraOnly>
      )}
    </div>
  );
}

export default SceneBadges;
