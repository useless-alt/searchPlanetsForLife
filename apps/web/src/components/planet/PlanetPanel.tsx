import { useEffect, useRef, type KeyboardEvent } from 'react';
import { useStore } from 'zustand';

import { ru } from '../../i18n/ru';
import { Slot } from '../../slots';
import { usePlanetDetail } from '../../state/planetDetail';
import { appStore, type AppStore } from '../../state/store';
import { Button, EmptyState } from '../ui';
import { Decomposition } from './Decomposition';
import { ExoMastSection } from './ExoMastSection';
import { ParamTable } from './ParamTable';
import { PlanetActions } from './PlanetActions';
import { PlanetBadges } from './PlanetBadges';
import { PlanetHeader } from './PlanetHeader';

/**
 * Вид планеты в правой панели (задача 19; п. 10.7, 13.5, U40).
 *
 * Порядок блоков по U40: «← Карта Галактики», заголовок, подсказка, слот
 * «Данные реконструкции», слот 3D-холста, бейджи, детали карточки.
 *
 * Панель не модальная: Esc закрывает её, только если событие не обработано
 * подсказкой или окном (`!event.defaultPrevented`). Слоты позволяют
 * задачам 21 и 28 подключаться, не меняя эту разметку.
 */

/** Пропсы вида планеты. */
export interface PlanetPanelProps {
  /** Хранилище; в тестах подставляется изолированный экземпляр. */
  store?: AppStore;
}

/** Вид планеты. */
export function PlanetPanel({ store = appStore }: PlanetPanelProps) {
  const open = useStore(store, (state) => state.planetCardOpen);
  const selectedPlanetId = useStore(store, (state) => state.selectedPlanetId);
  const catalogIndex = useStore(store, (state) => state.catalogIndex);
  const settings = useStore(store, (state) => state.settings);

  const setPlanetCardOpen = useStore(store, (state) => state.setPlanetCardOpen);
  const requestCameraReset = useStore(store, (state) => state.requestCameraReset);
  const leaveSystem = useStore(store, (state) => state.leaveSystem);

  const { detail, loading } = usePlanetDetail(store);
  const headingRef = useRef<HTMLHeadingElement>(null);

  // При открытии вида фокус переходит на заголовок планеты.
  useEffect(() => {
    if (open) headingRef.current?.focus();
  }, [open]);

  if (!open || selectedPlanetId === null) return null;

  const name = detail?.name ?? catalogIndex[selectedPlanetId]?.name ?? selectedPlanetId;

  /** Esc внутри панели закрывает вид планеты (если событие не обработано). */
  function handleKeyDown(event: KeyboardEvent<HTMLElement>): void {
    if (event.key !== 'Escape' || event.defaultPrevented) return;

    event.preventDefault();
    setPlanetCardOpen(false);
  }

  /** Возврат к карте: выход из системы, закрытие вида и сброс камеры (U47). */
  function backToMap(): void {
    leaveSystem();
    setPlanetCardOpen(false);
    requestCameraReset();
  }

  return (
    <aside
      className="planet-card ui-glass ui-glass--flush"
      role="region"
      aria-label={name}
      aria-busy={loading || undefined}
      onKeyDown={handleKeyDown}
    >
      <div className="planet-card__toolbar">
        <Button variant="ghost" size="sm" onClick={backToMap}>
          {ru['planet.backToMap']}
        </Button>
      </div>

      <PlanetHeader
        name={name}
        planetId={selectedPlanetId}
        world={detail?.world ?? null}
        headingRef={headingRef}
        onClose={() => setPlanetCardOpen(false)}
      />

      <p className="planet-card__hint">{ru['planet.hint']}</p>

      <Slot name="reconstruction" />

      <div className="planet-card__viewport">
        <Slot name="viewport" fallback={<EmptyState title={ru['planet.viewport.empty']} />} />
      </div>

      {detail === null ? (
        <p className="planet-card__note" role="status">
          {ru['ui.loading']}
        </p>
      ) : (
        <>
          <PlanetBadges detail={detail} store={store} />

          {detail.inTop ? null : (
            <p className="planet-card__notice" role="status">
              {ru['planet.notInTop']}
            </p>
          )}

          <ParamTable
            planet={detail.resolved}
            planetId={detail.id}
            planetStub={detail.gaps.planetStub}
            store={store}
          />

          <ExoMastSection planetId={detail.id} store={store} />

          <Decomposition
            score={detail.score}
            settings={settings}
            planetId={detail.id}
            store={store}
          />

          <PlanetActions detail={detail} store={store} />
        </>
      )}
    </aside>
  );
}
