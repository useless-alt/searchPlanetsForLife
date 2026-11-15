import type { ExoMastProps, SpectrumMeta } from '@exo/shared';

import { ExoMastApiError, type ExoMastApi, type ExoMastErrorReason } from './api';

/**
 * Клиентский кэш Exo.MAST (задача 28; п. 10.1.4, 10.7.5; U6).
 *
 * Записи хранятся по `planetId`. Кэш ограничен 30 планетами: давно
 * неиспользуемые вытесняются, но запись планеты текущей сцены не
 * вытесняется никогда. Повторное приближение к планете с готовыми
 * данными запрос не повторяет; ручное обновление выполняется всегда и
 * отменяет предыдущий запрос. При ошибке прежние `props` остаются —
 * карточка показывает ранее загруженные данные.
 */

/** Триггер загрузки. */
export type ExoMastTrigger = 'approach' | 'manual';

/** Состояние одного спектра. */
export interface ExoMastSpectrumEntry {
  /** Стадия загрузки. */
  state: 'idle' | 'loading' | 'ready' | 'error';
  /** Разобранные сведения; null — ещё нет. */
  meta: SpectrumMeta | null;
}

/** Запись Exo.MAST одной планеты. */
export interface ExoMastEntry {
  /** Состояние свойств. */
  state: 'idle' | 'loading' | 'updated' | 'backup' | 'error';
  /** Последние успешные свойства; при ошибке остаются. */
  props: ExoMastProps | null;
  /** Причина последней ошибки; null — ошибки нет. */
  errorReason: ExoMastErrorReason | null;
  /** Чем запущена текущая (или последняя) загрузка. */
  trigger: ExoMastTrigger | null;
  /** Состояния спектров по имени файла. */
  spectra: Record<string, ExoMastSpectrumEntry>;
}

/** Предел числа записей кэша. */
export const EXOMAST_CACHE_LIMIT = 30;

/** Состояние, которое ведёт слайс. */
export interface ExoMastHostState {
  /** Записи Exo.MAST по идентификатору планеты. */
  exoMast: Record<string, ExoMastEntry>;
  /** Планета текущей сцены: её запись не вытесняется. */
  scenePlanetId: string | null;
}

/** Действия слайса. */
export interface ExoMastSliceActions {
  /** Загружает свойства планеты; повторный approach не дублирует запрос. */
  loadExoMast(planetId: string, trigger: ExoMastTrigger): Promise<void>;
  /** Отменяет автоматический запрос, не помечая его ошибкой. */
  cancelExoMast(planetId: string, trigger: 'approach'): void;
  /** Загружает сведения о спектре из полученного списка. */
  loadSpectrum(planetId: string, file: string): Promise<void>;
}

/** Зависимости слайса. */
export interface ExoMastSliceDeps {
  /** Клиент Exo.MAST. */
  api: ExoMastApi;
  /** Планета текущей сцены (не вытесняется). */
  getScenePlanetId: () => string | null;
  /** Текущее время [мс] для вытеснения. */
  now?: () => number;
}

/** Результат создания слайса. */
export interface ExoMastSlice {
  /** Начальное состояние. */
  state: Pick<ExoMastHostState, 'exoMast'>;
  /** Действия. */
  actions: ExoMastSliceActions;
}

/** Пустая запись планеты. */
export function emptyExoMastEntry(): ExoMastEntry {
  return {
    state: 'idle',
    props: null,
    errorReason: null,
    trigger: null,
    spectra: {},
  };
}

/** Состояние по прежним данным (после отмены или при ошибке). */
function settledState(props: ExoMastProps | null): ExoMastEntry['state'] {
  if (props === null) return 'idle';
  return props.fromBackup ? 'backup' : 'updated';
}

/** Создаёт слайс Exo.MAST. */
export function createExoMastSlice(
  set: (patch: Partial<ExoMastHostState>) => void,
  get: () => ExoMastHostState,
  deps: ExoMastSliceDeps,
): ExoMastSlice {
  const now = deps.now ?? (() => Date.now());
  /** Время последнего обращения к записи. */
  const usedAt = new Map<string, number>();
  /** Активные запросы свойств. */
  const controllers = new Map<string, { controller: AbortController; trigger: ExoMastTrigger }>();

  /** Отмечает запись использованной. */
  function touch(planetId: string): void {
    usedAt.set(planetId, now());
  }

  /** Возвращает запись или пустую. */
  function entryOf(planetId: string): ExoMastEntry {
    return get().exoMast[planetId] ?? emptyExoMastEntry();
  }

  /** Записывает запись планеты и при необходимости вытесняет старые. */
  function writeEntry(planetId: string, entry: ExoMastEntry): void {
    const entries = { ...get().exoMast, [planetId]: entry };

    touch(planetId);

    if (Object.keys(entries).length > EXOMAST_CACHE_LIMIT) {
      const current = deps.getScenePlanetId();
      const removable = Object.keys(entries)
        .filter((id) => id !== current && id !== planetId)
        .sort((a, b) => (usedAt.get(a) ?? 0) - (usedAt.get(b) ?? 0));

      for (const id of removable) {
        if (Object.keys(entries).length <= EXOMAST_CACHE_LIMIT) break;
        delete entries[id];
        usedAt.delete(id);
      }
    }

    set({ exoMast: entries });
  }

  /** Отменяет активный запрос планеты без ошибки. */
  function abort(planetId: string): void {
    const active = controllers.get(planetId);

    if (active === undefined) return;

    controllers.delete(planetId);
    active.controller.abort();
  }

  return {
    state: { exoMast: {} },

    actions: {
      async loadExoMast(planetId, trigger) {
        const entry = entryOf(planetId);

        // Повторное приближение к уже загруженной планете запрос не делает.
        if (
          trigger === 'approach' &&
          (entry.state === 'updated' || entry.state === 'backup' || entry.state === 'loading')
        ) {
          return;
        }

        // Ручное обновление отменяет предыдущий запрос; approach — нет.
        if (trigger === 'manual') abort(planetId);

        const controller = new AbortController();
        controllers.set(planetId, { controller, trigger });

        writeEntry(planetId, {
          ...entry,
          state: 'loading',
          trigger,
          errorReason: null,
        });

        try {
          const result = await deps.api.getExoMast(planetId, controller.signal);

          if (controllers.get(planetId)?.controller !== controller) return;

          writeEntry(planetId, {
            state: result.status,
            props: result.props,
            errorReason: null,
            trigger,
            spectra: entryOf(planetId).spectra,
          });
        } catch (error: unknown) {
          if (controller.signal.aborted) {
            // Отмена не ошибка: возвращаем состояние по прежним данным.
            if (controllers.get(planetId)?.controller === controller) {
              const current = entryOf(planetId);
              writeEntry(planetId, {
                ...current,
                state: settledState(current.props),
                trigger: null,
                errorReason: null,
              });
            }

            return;
          }

          if (controllers.get(planetId)?.controller !== controller) return;

          const reason: ExoMastErrorReason =
            error instanceof ExoMastApiError ? error.reason : 'dns_error';
          const current = entryOf(planetId);

          // 10.7.5: прежние данные остаются доступными.
          writeEntry(planetId, {
            ...current,
            state: 'error',
            errorReason: reason,
            trigger: null,
          });
        } finally {
          if (controllers.get(planetId)?.controller === controller) {
            controllers.delete(planetId);
          }
        }
      },

      cancelExoMast(planetId, trigger) {
        const active = controllers.get(planetId);

        if (trigger !== 'approach' || active === undefined || active.trigger !== 'approach') {
          return;
        }

        abort(planetId);

        const entry = entryOf(planetId);
        writeEntry(planetId, {
          ...entry,
          state: settledState(entry.props),
          trigger: null,
          errorReason: null,
        });
      },

      async loadSpectrum(planetId, file) {
        const entry = entryOf(planetId);
        const previous = entry.spectra[file];

        // Повторный клик по готовому или идущему запросу ничего не делает.
        if (
          previous !== undefined &&
          (previous.state === 'loading' || previous.state === 'ready')
        ) {
          return;
        }

        writeEntry(planetId, {
          ...entry,
          spectra: { ...entry.spectra, [file]: { state: 'loading', meta: null } },
        });

        try {
          const meta = await deps.api.getSpectrum(planetId, file);
          const current = entryOf(planetId);

          writeEntry(planetId, {
            ...current,
            spectra: { ...current.spectra, [file]: { state: 'ready', meta } },
          });
        } catch {
          const current = entryOf(planetId);

          writeEntry(planetId, {
            ...current,
            spectra: { ...current.spectra, [file]: { state: 'error', meta: null } },
          });
        }
      },
    },
  };
}

/** Запись по идентификатору; null — данных ещё нет. */
export function selectExoMastEntry(
  entries: Record<string, ExoMastEntry>,
  planetId: string,
): ExoMastEntry | null {
  return entries[planetId] ?? null;
}
