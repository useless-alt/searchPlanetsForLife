import { useEffect, useRef, useState } from 'react';
import { useStore } from 'zustand';

import { appStore, type AppStore } from './store';
import type { PlanetDetail } from '../workers/protocol';

/**
 * Загрузка полной детали планеты для карточки и 3D-сцены
 * (задача 19; п. 10.7, 13.5).
 *
 * Деталь запрашивается при каждой смене выбранной планеты, настроек модели
 * или снимка каталога. Запросы нумеруются: ответ, пришедший после более
 * свежего запроса, не перезаписывает данные. Пока новая деталь не пришла,
 * на экране остаётся прежняя — карточка не мигает пустотой.
 */

/** Состояние загрузки детали. */
export interface PlanetDetailState {
  /** Последняя полученная деталь; null — ещё не загружена. */
  detail: PlanetDetail | null;
  /** Идёт запрос; прежняя деталь при этом остаётся на экране. */
  loading: boolean;
}

/** Загрузчик с отбрасыванием устаревших ответов. */
export interface PlanetDetailLoader {
  /** Последняя применённая деталь. */
  readonly detail: PlanetDetail | null;
  /** Загружает деталь; `null` — ответ устарел и не применён. */
  load(id: string): Promise<PlanetDetail | null>;
}

/**
 * Создаёт загрузчик детали.
 *
 * `request` подменяется в тестах. Номер запроса увеличивается до отправки,
 * поэтому медленный ответ на прошлый вызов не сможет перезаписать свежий.
 */
export function createPlanetDetailLoader(
  request: (id: string) => Promise<PlanetDetail>,
): PlanetDetailLoader {
  let sequence = 0;
  let detail: PlanetDetail | null = null;

  return {
    get detail() {
      return detail;
    },

    async load(id: string): Promise<PlanetDetail | null> {
      const current = ++sequence;
      const next = await request(id);

      if (current !== sequence) return null;

      detail = next;
      return next;
    },
  };
}

/** Хук детали выбранной планеты. */
export function usePlanetDetail(store: AppStore = appStore): PlanetDetailState {
  const selectedPlanetId = useStore(store, (state) => state.selectedPlanetId);
  const settings = useStore(store, (state) => state.settings);
  const snapshotId = useStore(store, (state) => state.snapshotId);

  const [state, setState] = useState<PlanetDetailState>({ detail: null, loading: false });

  // Загрузчик привязан к хранилищу: в тестах подставляется изолированный экземпляр.
  const loaderRef = useRef<{ store: AppStore; loader: PlanetDetailLoader } | null>(null);
  if (loaderRef.current === null || loaderRef.current.store !== store) {
    loaderRef.current = {
      store,
      loader: createPlanetDetailLoader((id) => store.getState().getPlanetDetail(id)),
    };
  }

  const loader = loaderRef.current.loader;

  useEffect(() => {
    if (selectedPlanetId === null) {
      setState({ detail: null, loading: false });
      return undefined;
    }

    let alive = true;

    setState((previous) => ({ ...previous, loading: true }));

    loader
      .load(selectedPlanetId)
      .then((detail) => {
        if (!alive || detail === null) return;

        setState({ detail, loading: false });
      })
      .catch((error: unknown) => {
        if (!alive) return;

        console.warn('[planetDetail] деталь планеты не загружена:', error);
        setState((previous) => ({ ...previous, loading: false }));
      });

    return () => {
      alive = false;
    };
  }, [loader, selectedPlanetId, settings, snapshotId]);

  return state;
}
