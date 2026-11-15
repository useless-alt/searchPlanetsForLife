import { useEffect } from 'react';
import { useStore } from 'zustand';

import { ru, formatMessage } from '../../i18n/ru';
import { appStore, type AppStore } from '../../state/store';
import { Button } from '../ui';
import { showToast } from '../ui/Toast';
import { exoMastReasonText } from './ExoMastSection';

/**
 * Кнопка «Обновить данные планеты» (задача 28; слот `refreshPlanet`).
 *
 * Ручное обновление выполняется всегда, даже если данные уже есть, и
 * отменяет предыдущий запрос. На время загрузки кнопка отключена и
 * показывает индикатор; остальная карточка остаётся доступной.
 * Успех и ошибка сообщаются уведомлением.
 */

/** Пропсы кнопки. */
export interface RefreshPlanetButtonProps {
  /** Хранилище; в тестах подставляется изолированный экземпляр. */
  store?: AppStore;
}

/** Кнопка обновления данных планеты. */
export function RefreshPlanetButton({ store = appStore }: RefreshPlanetButtonProps) {
  const planetId = useStore(store, (state) => state.selectedPlanetId);
  const entry = useStore(store, (state) =>
    planetId === null ? undefined : state.exoMast[planetId],
  );
  const loadExoMast = useStore(store, (state) => state.loadExoMast);
  const registerAction = useStore(store, (state) => state.registerAction);
  const loading = entry?.state === 'loading';

  /** Запускает ручное обновление и показывает результат. */
  async function refresh(): Promise<void> {
    if (planetId === null) return;

    await loadExoMast(planetId, 'manual');

    const next = store.getState().exoMast[planetId];

    if (next === undefined) return;

    if (next.state === 'updated' || next.state === 'backup') {
      showToast(ru['exomast.toast.updated']);
      return;
    }

    if (next.state !== 'error') return;

    showToast(
      next.props === null
        ? formatMessage(ru['exomast.status.errorNoProps'], {
            reason: exoMastReasonText(next.errorReason),
          })
        : formatMessage(ru['exomast.status.errorWithProps'], {
            reason: exoMastReasonText(next.errorReason),
          }),
    );
  }

  // Действие доступно и другим местам карточки через реестр (задача 19).
  useEffect(() => {
    registerAction('refreshPlanet', () => {
      void refresh();
    });

    return () => registerAction('refreshPlanet', null);
    // refresh зависит только от planetId и функций хранилища.
  }, [planetId, registerAction]);

  if (planetId === null) return null;

  return (
    <Button
      variant="secondary"
      loading={loading}
      disabled={loading}
      aria-busy={loading || undefined}
      onClick={() => void refresh()}
      data-layer="panel"
      data-cluster="planet"
      data-ui-text
    >
      {ru['planet.action.refresh']}
    </Button>
  );
}
