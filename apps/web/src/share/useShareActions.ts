import {
  buildCsv,
  csvFileName,
  encodeShare,
  type FilterState,
  type SharedFilters,
  type SharedState,
} from '@exo/shared';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useStore } from 'zustand';

import { showToast } from '../components/ui/Toast';
import { ru } from '../i18n/ru';
import { copyText } from '../lib/clipboard';
import { downloadCsv } from '../lib/download';
import { selectTableRows } from '../state/selectors';
import { appStore, type AppStore } from '../state/store';

/**
 * Действия «CSV» и «Ссылка» (задача 20; 13.1, U42, U45).
 *
 * Хук подключает действия к реестру шапки и следит за актуальностью: состав
 * CSV — это ровно `selectTableRows(state)`, поэтому при пустой таблице
 * действие `exportCsv` равно null и кнопка недоступна.
 */

/** Результат хука. */
export interface ShareActionsState {
  /** Ссылка для ручного копирования; null — диалог закрыт. */
  fallbackLink: string | null;
  /** Закрывает запасной диалог. */
  closeFallback: () => void;
}

/** Фильтры без поиска: поиск не входит в ссылку (13.1). */
function sharedFilters(filters: FilterState): SharedFilters {
  return {
    spectralClasses: [...filters.spectralClasses],
    radius: { ...filters.radius },
    T_s: { ...filters.T_s },
    e: { ...filters.e },
    includeCandidates: filters.includeCandidates,
    earthReference: filters.earthReference,
  };
}

/** Собирает полный адрес состояния из текущего location. */
function shareUrl(state: SharedState): string {
  const { origin, pathname } = window.location;

  return `${origin}${pathname}#${encodeShare(state)}`;
}

/**
 * Подключает «CSV» и «Ссылка».
 *
 * @param store Хранилище; в тестах подставляется изолированный экземпляр.
 */
export function useShareActions(store: AppStore = appStore): ShareActionsState {
  const rows = useStore(store, selectTableRows);
  const settings = useStore(store, (state) => state.settings);
  const filters = useStore(store, (state) => state.filters);
  const sort = useStore(store, (state) => state.sort);
  const selectedPlanetId = useStore(store, (state) => state.selectedPlanetId);
  const planetCardOpen = useStore(store, (state) => state.planetCardOpen);
  const builtAt = useStore(store, (state) => state.builtAt);
  const registerAction = useStore(store, (state) => state.registerAction);

  const [fallbackLink, setFallbackLink] = useState<string | null>(null);

  /** CSV текущего Топ-50; null — строк нет, кнопка должна быть отключена. */
  const exportCsv = useMemo<(() => void) | null>(() => {
    if (rows.length === 0) return null;

    return () => {
      const csv = buildCsv(rows, {
        mode: settings.mode,
        hzBounds: settings.hzBounds,
        builtAt,
      });

      downloadCsv(csvFileName(settings.mode), csv);
    };
  }, [rows, settings.mode, settings.hzBounds, builtAt]);

  /** Копирует ссылку; при отказе обоих способов показывает диалог. */
  const copyLink = useCallback(async (): Promise<void> => {
    const state: SharedState = {
      settings,
      filters: sharedFilters(filters),
      sort: { column: sort.column, dir: sort.dir },
      selectedPlanetId,
      planetCardOpen,
    };

    const url = shareUrl(state);
    const copied = await copyText(url);

    if (copied) {
      showToast(ru['share.copied']);
      return;
    }

    setFallbackLink(url);
  }, [settings, filters, sort, selectedPlanetId, planetCardOpen]);

  useEffect(() => {
    registerAction('exportCsv', exportCsv);
  }, [exportCsv, registerAction]);

  useEffect(() => {
    registerAction('copyLink', () => {
      void copyLink();
    });
  }, [copyLink, registerAction]);

  // Реестр очищается только при размонтировании: шапка не должна показывать
  // кнопки, ведущие в никуда.
  useEffect(
    () => () => {
      registerAction('exportCsv', null);
      registerAction('copyLink', null);
    },
    [registerAction],
  );

  const closeFallback = useCallback(() => setFallbackLink(null), []);

  return { fallbackLink, closeFallback };
}
