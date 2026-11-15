import { useStore } from 'zustand';

import { ru } from '../../i18n/ru';
import { Slot } from '../../slots';
import { appStore, type AppStore } from '../../state/store';
import type { PlanetDetail } from '../../workers/protocol';
import { Button } from '../ui';

/**
 * Действия карточки планеты (задача 19; п. 10.7, U38, U44).
 *
 * «Показать на карте» закрывает вид планеты и просит карту сфокусироваться
 * на ней; без координат кнопка отключена. «Приблизить» запрашивает перелёт
 * в 3D-сцене и остаётся доступной даже для заглушки (U38). Кнопка
 * «Обновить данные планеты» появляется из слота задачи 28.
 */

/** Пропсы действий. */
export interface PlanetActionsProps {
  /** Деталь планеты. */
  detail: PlanetDetail;
  /** Хранилище; в тестах подставляется изолированный экземпляр. */
  store?: AppStore;
}

/** Есть ли у планеты координаты для карты (U44). */
export function hasCoordinates(detail: PlanetDetail): boolean {
  const { ra, dec, dist_pc } = detail.resolved;

  return ra.value !== null && dec.value !== null && dist_pc.value !== null;
}

/** Кнопки карточки. */
export function PlanetActions({ detail, store = appStore }: PlanetActionsProps) {
  const setPlanetCardOpen = useStore(store, (state) => state.setPlanetCardOpen);
  const requestMapFocus = useStore(store, (state) => state.requestMapFocus);
  const requestFly = useStore(store, (state) => state.requestFly);

  const canShowOnMap = hasCoordinates(detail);

  /** Закрывает карточку и просит карту выделить планету. */
  function showOnMap(): void {
    setPlanetCardOpen(false);
    requestMapFocus(detail.id);
  }

  return (
    <div className="planet-card__actions">
      <Button
        variant="secondary"
        disabled={!canShowOnMap}
        onClick={showOnMap}
        aria-describedby={canShowOnMap ? undefined : `planet-no-coords-${detail.id}`}
      >
        {ru['planet.action.showOnMap']}
      </Button>

      {canShowOnMap ? null : (
        <span className="planet-card__hint" id={`planet-no-coords-${detail.id}`}>
          {ru['planet.action.noCoords']}
        </span>
      )}

      <Button
        variant="secondary"
        onClick={() => requestFly(detail.id, 'planet')}
        // U38: приближение доступно и при заглушке планеты.
      >
        {ru['planet.action.fly']}
      </Button>

      <Slot name="refreshPlanet" />
    </div>
  );
}
