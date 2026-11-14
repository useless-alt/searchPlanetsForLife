import {
  DEFAULT_FILTERS,
  DEFAULT_SETTINGS,
  Q_SLIDER_MAX,
  Q_SLIDER_MIN,
  type CalcMode,
  type ErrorLogEntry,
  type FilterState,
  type HzBounds,
  type ModelSettings,
  type RankingCounters,
  type SourceStatus,
  type StatusResponse,
} from '@exo/shared';
import { useStore } from 'zustand';
import { createStore, type StoreApi } from 'zustand/vanilla';

import { ERROR_LOG_LIMIT, type ApiClient } from '../api/client';
import { createDefaultApiClient } from '../api/defaultClient';
import {
  StaleComputeError,
  createDefaultBackend,
  type ComputeBackend,
} from '../workers/computeBackend';
import {
  DEFAULT_SORT_SPEC,
  type RankedRowView,
  type SortColumn,
  type SortSpec,
} from '../workers/protocol';

/**
 * Состояние клиентского приложения (задача 12, п. 10.1, 10.8.7, 10.10).
 *
 * Хранилище Zustand с единственным источником истины для:
 * - загрузки каталога (`phase`, `sources`, `snapshotId`, `builtAt`);
 * - настроек модели, фильтров и сортировки;
 * - результата пересчёта из воркера (`rows`, `counters`);
 * - выбранной планеты (`selectedPlanetId`).
 *
 * Выбор планеты не сбрасывается ни одним действием, кроме `selectPlanet`:
 * смена режима, настроек, фильтров и сортировки выбранную планету сохраняет,
 * даже если она покинула Топ-50 (10.3.4, 10.8.7).
 *
 * Задача 13 добавляет состояние шапки: показ служебных данных
 * (`showExtraData`, п. 11.2), открытие карточки планеты, запрос сброса
 * камеры, индекс каталога для бейджа выбранной планеты, реестр действий
 * шапки («CSV», «Ссылка», «Методика») и журнал ошибок источников.
 */

/** Фаза загрузки на клиенте. */
export type AppPhase = 'boot' | 'loading' | 'ready' | 'error';

/** Имя действия шапки, подключаемого задачами 17 и 20. */
export type HeaderActionName = 'exportCsv' | 'copyLink' | 'openMethodology';

/** Реестр действий шапки; `null` — действие ещё не подключено. */
export type HeaderActions = Record<HeaderActionName, (() => void) | null>;

/**
 * Запись каталога для бейджа выбранной планеты.
 *
 * Хранится отдельно от строк Топ-50: выбранная планета может выпасть из
 * Топ-50 (10.3.5), но её имя в шапке остаётся.
 */
export interface CatalogEntry {
  /** Отображаемое имя планеты. */
  name: string;
  /** Имя родительской звезды; null — если неизвестно. */
  hostname: string | null;
}

/** Ключ служебного переключателя в `sessionStorage` (п. 11.2). */
export const SHOW_EXTRA_DATA_KEY = 'exo.showExtraData';

/**
 * Читает состояние служебного переключателя из `sessionStorage`.
 *
 * Ошибки доступа к хранилищу (приватный режим, запрет cookies) не ломают
 * приложение: переключатель просто остаётся выключенным.
 */
function readShowExtraData(): boolean {
  try {
    return globalThis.sessionStorage?.getItem(SHOW_EXTRA_DATA_KEY) === 'true';
  } catch {
    return false;
  }
}

/** Сохраняет состояние служебного переключателя в `sessionStorage`. */
function writeShowExtraData(value: boolean): void {
  try {
    globalThis.sessionStorage?.setItem(SHOW_EXTRA_DATA_KEY, value ? 'true' : 'false');
  } catch {
    // Хранилище недоступно — настройка живёт только в текущем состоянии.
  }
}

/** Публичное состояние приложения и действия. */
export interface AppState {
  /** Текущая фаза загрузки. */
  phase: AppPhase;
  /** Статусы шести источников (последний ответ `/api/status`). */
  sources: SourceStatus[];
  /** ETag снимка каталога; null — снимок ещё не загружен. */
  snapshotId: string | null;
  /** Время сборки снимка (ISO 8601). */
  builtAt: string | null;
  /** Настройки модели (режим, границы HZ, штрафы, порог Q_data). */
  settings: ModelSettings;
  /** Состояние панели фильтров. */
  filters: FilterState;
  /** Сортировка таблицы. */
  sort: SortSpec;
  /** Строки Топ-50 в порядке отображения. */
  rows: RankedRowView[];
  /** Счётчики выборки N, N₁, N₂, «подходят». */
  counters: RankingCounters | null;
  /** Выбранная планета; сохраняется при любой смене настроек. */
  selectedPlanetId: string | null;
  /** Идёт повторное обновление снимка (данные остаются на экране). */
  refreshing: boolean;
  /** Показывать служебные данные: счётчики, «Ранг и сдвиг», бейджи Q_data (11.2). */
  showExtraData: boolean;
  /** Открыта ли карточка планеты (задача 19). */
  planetCardOpen: boolean;
  /** Счётчик запросов сброса камеры; каждый клик «Обзор» увеличивает его (задачи 21–22). */
  cameraResetSeq: number;
  /** Индекс каталога: идентификатор планеты → имя и звезда. */
  catalogIndex: Record<string, CatalogEntry>;
  /** Реестр действий шапки: «CSV», «Ссылка», «Методика» (задачи 17 и 20). */
  actions: HeaderActions;
  /** Журнал ошибок источников (п. 8.2). */
  errorLog: ErrorLogEntry[];
  /** Идёт загрузка журнала ошибок. */
  errorLogLoading: boolean;

  /** Запускает загрузку каталога; повторный вызов возвращает тот же промис. */
  start(): Promise<void>;
  /** Меняет режим расчёта и пересчитывает Топ-50. */
  setMode(mode: CalcMode): void;
  /** Меняет границы зоны обитаемости. */
  setHzBounds(bounds: HzBounds): void;
  /** Включает или выключает штраф. */
  setPenalty(key: keyof ModelSettings['penalties'], value: boolean): void;
  /** Меняет минимальный порог Q_data (в диапазоне ползунка). */
  setQMin(value: number): void;
  /** Обновляет часть фильтров. */
  setFilters(patch: Partial<FilterState>): void;
  /** Возвращает настройки модели к умолчаниям (U10). */
  resetSettings(): void;
  /** Возвращает фильтры к умолчаниям. */
  resetFilters(): void;
  /**
   * Меняет сортировку.
   *
   * Без `dir` повторный выбор той же колонки переключает направление,
   * выбор новой колонки начинает с возрастания.
   */
  setSort(column: SortColumn, dir?: SortSpec['dir']): void;
  /** Выбирает планету; null снимает выбор (единственное действие сброса). */
  selectPlanet(planetId: string | null): void;
  /** Запускает полное обновление каталога (10.10). */
  refresh(): Promise<void>;
  /** Включает или выключает показ служебных данных (11.2, U12). */
  setShowExtraData(value: boolean): void;
  /** Открывает или закрывает карточку планеты (задача 19). */
  setPlanetCardOpen(open: boolean): void;
  /** Запрашивает возврат камеры в общий вид (10.8.8). */
  requestCameraReset(): void;
  /** Подключает (или отключает) действие шапки: «CSV», «Ссылка», «Методика». */
  registerAction(name: HeaderActionName, action: (() => void) | null): void;
  /** Загружает журнал ошибок источников (п. 8.2). */
  loadErrorLog(): Promise<void>;
}

/** Хранилище приложения (тип zustand). */
export type AppStore = StoreApi<AppState>;

/** Зависимости хранилища: подменяются в тестах. */
export interface AppStoreDeps {
  /** REST-клиент; по умолчанию `/api` через глобальный fetch. */
  api?: ApiClient;
  /** Бэкенд расчёта; по умолчанию Worker или основной поток. */
  backend?: ComputeBackend;
  /** Интервал опроса статуса [мс]; по умолчанию 1000. */
  pollIntervalMs?: number;
  /** Пауза между опросами (в тестах — без задержки). */
  sleep?: (ms: number) => Promise<void>;
}

/** Пауза по умолчанию. */
function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/** Копия настроек: вложенный объект штрафов не разделяется с умолчаниями. */
function cloneSettings(settings: ModelSettings): ModelSettings {
  return { ...settings, penalties: { ...settings.penalties } };
}

/** Копия фильтров: диапазоны и список классов не разделяются с умолчаниями. */
function cloneFilters(filters: FilterState): FilterState {
  return {
    ...filters,
    spectralClasses: [...filters.spectralClasses],
    radius: { ...filters.radius },
    T_s: { ...filters.T_s },
    e: { ...filters.e },
  };
}

/** Начальное состояние до первого действия. */
function initialState(): Omit<
  AppState,
  | 'start'
  | 'setMode'
  | 'setHzBounds'
  | 'setPenalty'
  | 'setQMin'
  | 'setFilters'
  | 'resetSettings'
  | 'resetFilters'
  | 'setSort'
  | 'selectPlanet'
  | 'refresh'
  | 'setShowExtraData'
  | 'setPlanetCardOpen'
  | 'requestCameraReset'
  | 'registerAction'
  | 'loadErrorLog'
> {
  return {
    phase: 'boot',
    sources: [],
    snapshotId: null,
    builtAt: null,
    settings: cloneSettings(DEFAULT_SETTINGS),
    filters: cloneFilters(DEFAULT_FILTERS),
    sort: { ...DEFAULT_SORT_SPEC },
    rows: [],
    counters: null,
    selectedPlanetId: null,
    refreshing: false,
    showExtraData: readShowExtraData(),
    planetCardOpen: false,
    cameraResetSeq: 0,
    catalogIndex: {},
    actions: { exportCsv: null, copyLink: null, openMethodology: null },
    errorLog: [],
    errorLogLoading: false,
  };
}

/**
 * Создаёт хранилище приложения.
 *
 * Фабрика нужна тестам: каждый тест получает изолированное состояние
 * с подменёнными API и бэкендом.
 */
export function createAppStore(deps: AppStoreDeps = {}): AppStore {
  const api = deps.api ?? createDefaultApiClient();
  const backend = deps.backend ?? createDefaultBackend();
  const pollIntervalMs = deps.pollIntervalMs ?? 1000;
  const sleep = deps.sleep ?? defaultSleep;

  return createStore<AppState>()((set, get) => {
    /** Номер последнего запроса пересчёта: результаты старых отбрасываются. */
    let computeSequence = 0;
    /** Промис первой загрузки (идемпотентность при двойном монтировании). */
    let starting: Promise<void> | null = null;
    /** Промис текущего обновления (single-flight). */
    let refreshing: Promise<void> | null = null;

    /** Применяет статусы источников из ответа `/api/status`. */
    function applyStatus(status: StatusResponse, trackRefreshing: boolean): void {
      set(
        trackRefreshing
          ? { sources: status.sources, refreshing: status.refreshing }
          : { sources: status.sources },
      );
    }

    /**
     * Пересчитывает Топ-50 в бэкенде.
     *
     * Возвращает false, если расчёт не применён: запрос перекрыт более новым
     * или бэкенд ответил ошибкой. Ответ с устаревшей последовательностью
     * отбрасывается — на экране всегда результат последних настроек.
     */
    async function recompute(): Promise<boolean> {
      const sequence = ++computeSequence;
      const { settings, filters, sort } = get();

      try {
        const result = await backend.compute(settings, filters, sort);

        if (sequence !== computeSequence) return false;

        set({ rows: result.rows, counters: result.counters });
        return true;
      } catch (error: unknown) {
        if (error instanceof StaleComputeError) return false;
        if (sequence !== computeSequence) return false;

        console.warn('[store] пересчёт Топ-50 не удался:', error);
        return false;
      }
    }

    /**
     * Загружает каталог и передаёт его в воркер (один раз за снимок).
     *
     * При 304 (снимок не изменился) пересчёт не выполняется — данные
     * остаются прежними (10.10.5).
     */
    async function loadCatalog(): Promise<boolean> {
      const result = await api.getCatalog(get().snapshotId);

      if (result.notModified) {
        set({ phase: 'ready', refreshing: false });
        return true;
      }

      const catalog = result.catalog;

      // Пока каталог передаётся в воркер, старый пересчёт уже неактуален.
      computeSequence += 1;
      await backend.init(catalog.planets);

      // Индекс каталога нужен шапке: имя выбранной планеты остаётся,
      // даже если планета выпала из Топ-50 (10.3.5).
      const catalogIndex: Record<string, CatalogEntry> = {};

      for (const planet of catalog.planets) {
        catalogIndex[planet.id] = { name: planet.name, hostname: planet.hostname };
      }

      set({
        sources: catalog.sources,
        snapshotId: catalog.snapshot.id,
        builtAt: catalog.snapshot.builtAt,
        catalogIndex,
      });

      const computed = await recompute();

      if (!computed) return false;

      set({ phase: 'ready', refreshing: false });
      return true;
    }

    /** Первая загрузка: опрос статуса, каталог, расчёт. */
    async function runStart(): Promise<void> {
      set({ phase: 'loading' });

      try {
        let status = await api.getStatus();
        applyStatus(status, true);

        while (status.phase !== 'ready' && status.phase !== 'error') {
          await sleep(pollIntervalMs);
          status = await api.getStatus();
          applyStatus(status, true);
        }

        if (status.phase === 'error') {
          set({ phase: 'error' });
          return;
        }

        const loaded = await loadCatalog();

        if (!loaded) set({ phase: 'error', refreshing: false });
      } catch (error: unknown) {
        console.warn('[store] загрузка каталога не удалась:', error);
        set({ phase: 'error', refreshing: false });
      }
    }

    /** Повторное обновление: POST, ожидание сервера, каталог (10.10). */
    async function runRefresh(): Promise<void> {
      const hadSnapshot = get().snapshotId !== null;

      set(hadSnapshot ? { refreshing: true } : { phase: 'loading', refreshing: true });

      try {
        // 409 не ошибка: сборка уже идёт, дождёмся её через статус.
        await api.refresh();

        let status = await api.getStatus();
        applyStatus(status, false);

        while (status.refreshing || status.phase === 'loading') {
          await sleep(pollIntervalMs);
          status = await api.getStatus();
          applyStatus(status, false);
        }

        if (status.phase === 'error') {
          set({ phase: hadSnapshot ? 'ready' : 'error', refreshing: false });
          return;
        }

        const loaded = await loadCatalog();

        if (!loaded) {
          set({ phase: hadSnapshot ? 'ready' : 'error', refreshing: false });
        }
      } catch (error: unknown) {
        console.warn('[store] обновление каталога не удалось:', error);
        // Пока есть снимок, экран данных не заменяется экраном ошибки.
        set({ phase: hadSnapshot ? 'ready' : 'error', refreshing: false });
      }
    }

    return {
      ...initialState(),

      start() {
        if (starting === null) starting = runStart();

        return starting;
      },

      setMode(mode: CalcMode) {
        set({ settings: { ...get().settings, mode } });
        void recompute();
      },

      setHzBounds(hzBounds: HzBounds) {
        set({ settings: { ...get().settings, hzBounds } });
        void recompute();
      },

      setPenalty(key: keyof ModelSettings['penalties'], value: boolean) {
        const settings = get().settings;
        set({
          settings: {
            ...settings,
            penalties: { ...settings.penalties, [key]: value },
          },
        });
        void recompute();
      },

      setQMin(value: number) {
        const qMin = Math.min(Q_SLIDER_MAX, Math.max(Q_SLIDER_MIN, value));
        set({ settings: { ...get().settings, qMin } });
        void recompute();
      },

      setFilters(patch: Partial<FilterState>) {
        set({ filters: { ...get().filters, ...patch } });
        void recompute();
      },

      resetSettings() {
        set({ settings: cloneSettings(DEFAULT_SETTINGS) });
        void recompute();
      },

      resetFilters() {
        set({ filters: cloneFilters(DEFAULT_FILTERS) });
        void recompute();
      },

      setSort(column: SortColumn, dir?: SortSpec['dir']) {
        const current = get().sort;
        const nextDirection =
          dir ?? (current.column === column && current.dir === 'asc' ? 'desc' : 'asc');

        set({ sort: { column, dir: nextDirection } });
        void recompute();
      },

      selectPlanet(planetId: string | null) {
        // Единственное место, где меняется выбор (10.3.4, 10.8.7).
        set({ selectedPlanetId: planetId });
      },

      refresh() {
        if (refreshing === null) {
          refreshing = runRefresh().finally(() => {
            refreshing = null;
          });
        }

        return refreshing;
      },

      setShowExtraData(value: boolean) {
        writeShowExtraData(value);
        set({ showExtraData: value });
      },

      setPlanetCardOpen(open: boolean) {
        set({ planetCardOpen: open });
      },

      requestCameraReset() {
        set({ cameraResetSeq: get().cameraResetSeq + 1 });
      },

      registerAction(name: HeaderActionName, action: (() => void) | null) {
        set({ actions: { ...get().actions, [name]: action } });
      },

      async loadErrorLog() {
        set({ errorLogLoading: true });

        try {
          const entries = await api.getErrors(ERROR_LOG_LIMIT);
          set({ errorLog: entries, errorLogLoading: false });
        } catch (error: unknown) {
          console.warn('[store] журнал ошибок не загружен:', error);
          set({ errorLogLoading: false });
        }
      },
    };
  });
}

/** Синглтон приложения: одно состояние на страницу. */
export const appStore = createAppStore();

/** React-хук для чтения части состояния. */
export function useAppStore<T>(selector: (state: AppState) => T): T {
  return useStore(appStore, selector);
}
