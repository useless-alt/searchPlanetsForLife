import { useStore } from 'zustand';

import { ExtraOnly } from '../../extra/ExtraOnly';
import { formatMessage, ru } from '../../i18n/ru';
import { selectSearchMatchIds } from '../../state/searchSelectors';
import { appStore, type AppStore } from '../../state/store';
import { Button } from '../../components/ui';

/**
 * Оверлей 3D-карты Галактики (задача 21; п. 6.2, 10.8; U43, U44).
 *
 * Внизу справа — возврат к обзору и перелёт к выбранной планете. Служебные
 * сведения (число совпадений сверх лимита подсветки и число планет без
 * координат) показываются над кнопками; второе скрыто режимом
 * «Показать дополнительные данные» (11.2).
 */

/** Пропсы оверлея. */
export interface MapOverlayProps {
  /** Хранилище; в тестах подставляется изолированный экземпляр. */
  store?: AppStore;
  /** Сколько планет не удалось разместить на карте (U44). */
  unplacedCount?: number;
}

/** Порог подсветки совпадений поиска (п. 6.2). */
export const SEARCH_HIGHLIGHT_LIMIT = 200;

/** Оверлей карты. */
export function MapOverlay({ store = appStore, unplacedCount = 0 }: MapOverlayProps) {
  const viewMode = useStore(store, (state) => state.viewMode);
  const selectedPlanetId = useStore(store, (state) => state.selectedPlanetId);
  const requestCameraReset = useStore(store, (state) => state.requestCameraReset);
  const requestFly = useStore(store, (state) => state.requestFly);
  const searchMatchIds = useStore(store, selectSearchMatchIds);

  // Оверлей принадлежит только карте: в перелёте и системе его заменяют
  // индикатор и SceneControls (задача 22).
  if (viewMode !== 'galaxy') return null;

  const tooManyMatches = searchMatchIds.length > SEARCH_HIGHLIGHT_LIMIT;

  return (
    <div className="map-overlay">
      {tooManyMatches ? (
        <p className="map-overlay__notice" role="status">
          {formatMessage(ru['map.searchTooMany'], { count: searchMatchIds.length })}
        </p>
      ) : null}

      {unplacedCount > 0 ? (
        <ExtraOnly id="map.unplaced" store={store}>
          <p className="map-overlay__notice" data-help-key="map.unplaced">
            {formatMessage(ru['map.unplaced'], { count: unplacedCount })}
          </p>
        </ExtraOnly>
      ) : null}

      <div className="map-overlay__actions">
        {selectedPlanetId === null ? null : (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => requestFly(selectedPlanetId, 'planet')}
          >
            {ru['map.fly']}
          </Button>
        )}

        <Button variant="secondary" size="sm" onClick={requestCameraReset}>
          {ru['map.overview']}
        </Button>
      </div>
    </div>
  );
}

export default MapOverlay;
