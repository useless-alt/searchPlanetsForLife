import { useStore } from 'zustand';

import { ru } from '../../i18n/ru';
import { appStore, type AppStore } from '../../state/store';
import { MapOverlay } from '../../three/map/MapOverlay';
import { Button, Spinner } from '../ui';
import { SceneControls } from './SceneControls';

/**
 * Оверлей правой панели по режиму вида (задача 22; 10.8, 10.9; U47).
 *
 * - `galaxy` — оверлей карты задачи 21;
 * - `flying` — только индикатор перелёта и отмена;
 * - `system` — элементы управления сценой системы по четырём углам.
 */

/** Пропсы оверлея. */
export interface ViewportOverlayProps {
  /** Хранилище; в тестах подставляется изолированный экземпляр. */
  store?: AppStore;
  /** Число планет без координат для оверлея карты (U44). */
  unplacedCount?: number;
}

/** Оверлей вида. */
export function ViewportOverlay({ store = appStore, unplacedCount = 0 }: ViewportOverlayProps) {
  const viewMode = useStore(store, (state) => state.viewMode);
  const leaveSystem = useStore(store, (state) => state.leaveSystem);

  return (
    <div className="viewport-overlay" data-view-mode={viewMode}>
      {viewMode === 'galaxy' ? <MapOverlay store={store} unplacedCount={unplacedCount} /> : null}

      {viewMode === 'flying' ? (
        <div className="viewport-overlay__flying" role="status" aria-live="polite">
          <span className="viewport-overlay__flying-label">
            <Spinner size="sm" decorative />
            {ru['scene.flying']}
          </span>
          <Button variant="secondary" size="sm" onClick={leaveSystem}>
            {ru['scene.overview']}
          </Button>
        </div>
      ) : null}

      {viewMode === 'system' ? <SceneControls store={store} /> : null}
    </div>
  );
}

export default ViewportOverlay;
