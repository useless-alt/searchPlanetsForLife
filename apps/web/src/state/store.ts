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
  type ResolvedPlanet,
  type SharedState,
  type SourceStatus,
  type StatusResponse,
} from '@exo/shared';
import { useStore } from 'zustand';
import { createStore, type StoreApi } from 'zustand/vanilla';

import { ERROR_LOG_LIMIT, type ApiClient } from '../api/client';
import { createDefaultApiClient } from '../api/defaultClient';
import { createDefaultExoMastApi, type ExoMastApi } from '../exomast/api';
import { createExoMastSlice, type ExoMastEntry, type ExoMastTrigger } from '../exomast/slice';
import {
  StaleComputeError,
  createDefaultBackend,
  type ComputeBackend,
} from '../workers/computeBackend';
import {
  DEFAULT_SORT_SPEC,
  type PlanetDetail,
  type PlanetPosition,
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
 *
 * Задача 14 добавляет панель «Параметры модели» и поиск (13.2): черновик
 * применяется одним действием `applySettings`, поиск пишется в
 * `filters.search` без пересчёта, а `affectsRanking` решает, нужен ли он
 * после изменения фильтров.
 *
 * Задача 15 добавляет панель фильтров (10.5, 13.3): черновик диапазонов и
 * спектральных классов применяется одним `setFilters`, поэтому на одно
 * нажатие «Применить фильтры» приходится ровно один пересчёт. Переключатель
 * «Земля (эталон)» меняет `filters.earthReference` сразу — `affectsRanking`
 * исключает его из пересчёта, потому что блок только диагностический (U35).
 */

/** Фаза загрузки на клиенте. */
export type AppPhase = 'boot' | 'loading' | 'ready' | 'error';

/** Режим правой панели: карта, перелёт или сцена системы (задача 22; U40). */
export type ViewMode = 'galaxy' | 'flying' | 'system';

/** Масштаб сцены системы (п. 9.4). */
export type SceneScaleMode = 'overview' | 'real';

/** Статус слоя системы для панели управления (задача 22; 11.3, 11.4). */
export interface SystemLayerStatusEntry {
  /** Слой доступен по данным. */
  available: boolean;
  /** Причина недоступности; null — слой доступен. */
  reason: string | null;
}

/** Имя действия шапки, подключаемого задачами 17, 20 и 28. */
export type HeaderActionName = 'exportCsv' | 'copyLink' | 'openMethodology' | 'refreshPlanet';

/** Реестр действий шапки и карточки; `null` — действие ещё не подключено. */
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

/** Цель перелёта 3D-сцены (задача 22; U38). */
export type FlyTarget = 'planet' | 'star';

/** Запрос перелёта камеры к планете или звезде; `seq` различает повторы. */
export interface FlyRequest {
  /** Идентификатор планеты. */
  planetId: string;
  /** Цель перелёта. */
  target: FlyTarget;
  /** Номер запроса: увеличивается при каждом вызове `requestFly`. */
  seq: number;
}

/** Запрос фокуса карты на планете (задача 19; U44). */
export interface MapFocusRequest {
  /** Идентификатор планеты. */
  planetId: string;
  /** Номер запроса: увеличивается при каждом вызове `requestMapFocus`. */
  seq: number;
}

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
  /**
   * Сравнение с упрощённым ESI (10.5.7).
   *
   * Включает колонку Δ независимо от `showExtraData`. Не сохраняется между
   * сеансами: это разовый режим просмотра.
   */
  compareClassic: boolean;
  /** Последний запрос перелёта камеры; обрабатывает задача 22. */
  flyRequest: FlyRequest | null;
  /** Последний запрос фокуса карты; обрабатывает задача 21 (U44). */
  mapFocusRequest: MapFocusRequest | null;
  /** Открыта панель «Параметры модели» (задача 14; п. 4.1, 10.4). */
  modelPanelOpen: boolean;
  /** Открыта панель фильтров (задача 15; п. 13.3). */
  filtersPanelOpen: boolean;
  /** Открыта ли карточка планеты (задача 19). */
  planetCardOpen: boolean;
  /** Счётчик запросов сброса камеры; каждый клик «Обзор» увеличивает его (задачи 21–22). */
  cameraResetSeq: number;
  /** Текущий вид правой панели (задача 22; U40). */
  viewMode: ViewMode;
  /** Планета, для которой построена сцена системы. */
  scenePlanetId: string | null;
  /** Деталь планеты сцены; не зависит от selectedPlanetId и Топ-50 (6.2). */
  sceneDetail: PlanetDetail | null;
  /** Цель камеры системы. */
  sceneTarget: 'planet' | 'star';
  /** Масштаб сцены системы; не сбрасывается при смене планеты (9.4, 11.6). */
  scaleMode: SceneScaleMode;
  /** Показывать орбиту (11.3). */
  showOrbit: boolean;
  /** Показывать зону обитаемости (11.4). */
  showHz: boolean;
  /** Доступность слоёв, опубликованная сценой системы. */
  systemLayerStatus: Record<string, SystemLayerStatusEntry>;
  /** Счётчик сброса камеры системы; не влияет на камеру карты. */
  systemCameraResetSeq: number;
  /** Счётчик запросов фокуса на первой строке таблицы. */
  focusTableSeq: number;
  /** Счётчик запросов выхода из системы. */
  leaveSystemSeq: number;
  /** Индекс каталога: идентификатор планеты → имя и звезда. */
  catalogIndex: Record<string, CatalogEntry>;
  /**
   * Кэш разрешённых планет для подсказок (задача 17; п. 11.1).
   *
   * Значения уже рассчитаны воркером; подсказки не делают запросов к API.
   * Кэш очищается при загрузке нового снимка каталога.
   */
  resolvedCache: Record<string, ResolvedPlanet>;
  /** Реестр действий шапки: «CSV», «Ссылка», «Методика» (задачи 17 и 20). */
  actions: HeaderActions;
  /** Журнал ошибок источников (п. 8.2). */
  errorLog: ErrorLogEntry[];
  /** Идёт загрузка журнала ошибок. */
  errorLogLoading: boolean;
  /** Записи ленивого Exo.MAST по планете (задача 28; п. 10.1.4). */
  exoMast: Record<string, ExoMastEntry>;

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
  /**
   * Применяет черновик панели «Параметры модели» одним действием (13.2, 10.4).
   *
   * Меняет только переданные поля и запускает ровно один пересчёт.
   */
  applySettings(patch: Partial<Pick<ModelSettings, 'hzBounds' | 'penalties' | 'qMin'>>): void;
  /** Обновляет часть фильтров и пересчитывает только при изменении влияющих полей. */
  setFilters(patch: Partial<FilterState>): void;
  /** Пишет поисковый запрос в фильтры, не запуская пересчёт (13.2). */
  setSearch(query: string): void;
  /** Возвращает настройки модели к умолчаниям, сохраняя режим (U10, U34). */
  resetSettings(): void;
  /** Возвращает фильтры к умолчаниям, сохраняя поиск (13.2). */
  resetFilters(): void;
  /** Открывает или закрывает панель «Параметры модели». */
  setModelPanelOpen(open: boolean): void;
  /** Открывает или закрывает панель фильтров (содержимое — задача 15). */
  setFiltersPanelOpen(open: boolean): void;
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
  /** Включает или выключает сравнение с упрощённым ESI (10.5.7). */
  setCompareClassic(value: boolean): void;
  /**
   * Применяет состояние из ссылки до первого пересчёта (задача 20; U45).
   *
   * Меняет только настройки, фильтры и сортировку и не запускает compute:
   * вызов выполняется до `start()`, а единственный пересчёт делает загрузка
   * каталога. Выбранная планета применяется отдельно — после каталога, когда
   * можно проверить, что она в нём есть.
   */
  applyShared(shared: Partial<SharedState>): void;
  /** Записывает запрос перелёта к планете или звезде (U38, задача 22). */
  requestFly(planetId: string, target: FlyTarget): void;
  /** Записывает запрос фокуса карты на планете (задача 19; U44). */
  requestMapFocus(planetId: string): void;
  /** Открывает или закрывает карточку планеты (задача 19). */
  setPlanetCardOpen(open: boolean): void;
  /** Запрашивает возврат камеры: карты или сцены системы (10.8.8, 10.9). */
  requestCameraReset(): void;
  /** Меняет цель камеры системы (U38). */
  setSceneTarget(target: 'planet' | 'star'): void;
  /** Переключает масштаб сцены системы (9.4). */
  setScaleMode(mode: SceneScaleMode): void;
  /** Включает или выключает слой орбиты (11.3). */
  setShowOrbit(value: boolean): void;
  /** Включает или выключает зону обитаемости (11.4). */
  setShowHz(value: boolean): void;
  /** Выходит из сцены системы на карту, не меняя selectedPlanetId. */
  leaveSystem(): void;
  /** Сбрасывает камеру системы к виду по таблице (U47). */
  requestSystemReset(): void;
  /** Загружает деталь планеты сцены по scenePlanetId (6.2). */
  refreshSceneDetail(): Promise<PlanetDetail | null>;
  /** Переводит фокус на первую строку таблицы (10.9.9). */
  focusTable(): void;
  /** Подключает (или отключает) действие шапки: «CSV», «Ссылка», «Методика». */
  registerAction(name: HeaderActionName, action: (() => void) | null): void;
  /** Кладёт разрешённые планеты в кэш подсказок без обращения к воркеру. */
  cacheResolved(planets: readonly ResolvedPlanet[]): void;
  /** Догружает разрешённые планеты по идентификаторам (кэш воркера, задача 17). */
  loadResolved(ids: readonly string[]): Promise<void>;
  /** Полные данные планеты для карточки и сцены (задача 19; п. 10.7). */
  getPlanetDetail(id: string): Promise<PlanetDetail>;
  /** Координаты всех планет снимка для 3D-карты (задача 21; U44). */
  getPositions(): Promise<PlanetPosition[]>;
  /** Загружает журнал ошибок источников (п. 8.2). */
  loadErrorLog(): Promise<void>;
  /** Загружает свойства Exo.MAST планеты (задача 28). */
  loadExoMast(planetId: string, trigger: ExoMastTrigger): Promise<void>;
  /** Отменяет автоматический запрос Exo.MAST без ошибки. */
  cancelExoMast(planetId: string, trigger: 'approach'): void;
  /** Загружает сведения о спектре из списка Exo.MAST. */
  loadSpectrum(planetId: string, file: string): Promise<void>;
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
  /** Клиент Exo.MAST; по умолчанию `/api` через глобальный fetch. */
  exoMastApi?: ExoMastApi;
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

/** Совпадают ли диапазоны фильтра. */
function sameRange(a: FilterState['radius'], b: FilterState['radius']): boolean {
  return Object.is(a.min, b.min) && Object.is(a.max, b.max);
}

/** Совпадают ли наборы спектральных классов (порядок выбора не важен). */
function sameSpectralClasses(
  a: FilterState['spectralClasses'],
  b: FilterState['spectralClasses'],
): boolean {
  return a.length === b.length && a.every((cls) => b.includes(cls));
}

/**
 * Влияет ли изменение фильтров на состав Топ-50 (13.2).
 *
 * Пересчёт нужен только для спектральных классов, диапазонов R / T_s / e и
 * переключателя «Показывать кандидатов». Поиск лишь подсвечивает строки, а
 * «Земля (эталон)» — калибровочная строка вне Топ-50: ни то, ни другое
 * пересчёт не запускает.
 */
export function affectsRanking(prev: FilterState, next: FilterState): boolean {
  return (
    !sameSpectralClasses(prev.spectralClasses, next.spectralClasses) ||
    !sameRange(prev.radius, next.radius) ||
    !sameRange(prev.T_s, next.T_s) ||
    !sameRange(prev.e, next.e) ||
    prev.includeCandidates !== next.includeCandidates
  );
}

/** Начальное состояние до первого действия. */
function initialState(): Omit<
  AppState,
  | 'start'
  | 'setMode'
  | 'setHzBounds'
  | 'setPenalty'
  | 'setQMin'
  | 'applySettings'
  | 'setFilters'
  | 'setSearch'
  | 'resetSettings'
  | 'resetFilters'
  | 'setModelPanelOpen'
  | 'setFiltersPanelOpen'
  | 'setSort'
  | 'selectPlanet'
  | 'refresh'
  | 'setShowExtraData'
  | 'setCompareClassic'
  | 'applyShared'
  | 'requestFly'
  | 'requestMapFocus'
  | 'setPlanetCardOpen'
  | 'requestCameraReset'
  | 'setSceneTarget'
  | 'setScaleMode'
  | 'setShowOrbit'
  | 'setShowHz'
  | 'leaveSystem'
  | 'requestSystemReset'
  | 'refreshSceneDetail'
  | 'focusTable'
  | 'registerAction'
  | 'cacheResolved'
  | 'loadResolved'
  | 'getPlanetDetail'
  | 'getPositions'
  | 'loadErrorLog'
  | 'loadExoMast'
  | 'cancelExoMast'
  | 'loadSpectrum'
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
    compareClassic: false,
    flyRequest: null,
    mapFocusRequest: null,
    modelPanelOpen: false,
    filtersPanelOpen: false,
    planetCardOpen: false,
    cameraResetSeq: 0,
    viewMode: 'galaxy',
    scenePlanetId: null,
    sceneDetail: null,
    sceneTarget: 'planet',
    scaleMode: 'overview',
    showOrbit: true,
    showHz: true,
    systemLayerStatus: {},
    systemCameraResetSeq: 0,
    focusTableSeq: 0,
    leaveSystemSeq: 0,
    catalogIndex: {},
    resolvedCache: {},
    actions: {
      exportCsv: null,
      copyLink: null,
      openMethodology: null,
      refreshPlanet: null,
    },
    errorLog: [],
    errorLogLoading: false,
    exoMast: {},
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
    /** Номер последнего запроса детали сцены: старые ответы не применяются. */
    let sceneDetailSequence = 0;
    /** Промис первой загрузки (идемпотентность при двойном монтировании). */
    let starting: Promise<void> | null = null;
    /** Промис текущего обновления (single-flight). */
    let refreshing: Promise<void> | null = null;

    // Кэш Exo.MAST живёт в этом же хранилище: карточка и 3D-сцена читают
    // одни и те же записи, а вытеснение знает планету текущей сцены.
    const exoMastSlice = createExoMastSlice(
      (patch) => set(patch as Partial<AppState>),
      () => get(),
      {
        api: deps.exoMastApi ?? createDefaultExoMastApi(),
        getScenePlanetId: () => get().scenePlanetId,
      },
    );

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
        // Новый снимок — новые разрешённые значения: старый кэш подсказок
        // больше не соответствует каталогу (задача 17).
        resolvedCache: {},
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

      applySettings(patch) {
        const settings = get().settings;
        const qMin =
          patch.qMin === undefined
            ? settings.qMin
            : Math.min(Q_SLIDER_MAX, Math.max(Q_SLIDER_MIN, patch.qMin));

        set({
          settings: {
            ...settings,
            hzBounds: patch.hzBounds ?? settings.hzBounds,
            penalties:
              patch.penalties === undefined
                ? settings.penalties
                : { ...settings.penalties, ...patch.penalties },
            qMin,
          },
        });
        void recompute();
      },

      setFilters(patch: Partial<FilterState>) {
        const prev = get().filters;
        const next = { ...prev, ...patch };

        set({ filters: next });

        // Поиск и «Земля (эталон)» на состав Топ-50 не влияют (13.2).
        if (affectsRanking(prev, next)) void recompute();
      },

      setSearch(query: string) {
        // Поиск только подсвечивает строки и метки: пересчёт не запускается (13.2).
        set({ filters: { ...get().filters, search: query } });
      },

      resetSettings() {
        // U34: режим — отдельный выбор пользователя, сброс настроек его не меняет.
        const { mode } = get().settings;

        set({ settings: cloneSettings({ ...DEFAULT_SETTINGS, mode }) });
        void recompute();
      },

      resetFilters() {
        const prev = get().filters;
        const search = prev.search;
        const next = cloneFilters(DEFAULT_FILTERS);

        // Поиск не является фильтром и переживает сброс (13.2).
        next.search = search;

        set({ filters: next });

        if (affectsRanking(prev, next)) void recompute();
      },

      setModelPanelOpen(open: boolean) {
        set({ modelPanelOpen: open });
      },

      setFiltersPanelOpen(open: boolean) {
        set({ filtersPanelOpen: open });
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

        // Выключение служебных данных скрывает Q_data: сортировка по скрытой
        // колонке возвращается к рангу (10.5.6, U12).
        const resetSort = !value && get().sort.column === 'Q_data';

        set({
          showExtraData: value,
          ...(resetSort ? { sort: { ...DEFAULT_SORT_SPEC } } : {}),
        });

        if (resetSort) void recompute();
      },

      setCompareClassic(value: boolean) {
        set({ compareClassic: value });
      },

      applyShared(shared) {
        const current = get();
        const patch: Partial<AppState> = {};

        if (shared.settings !== undefined) {
          patch.settings = cloneSettings(shared.settings);
        }

        if (shared.filters !== undefined) {
          // Поиск не переносится ссылкой, поэтому сохраняется текущий (13.1).
          patch.filters = cloneFilters({ ...shared.filters, search: current.filters.search });
        }

        if (shared.sort !== undefined) {
          patch.sort = { ...shared.sort };
        }

        // selectedPlanetId и planetCardOpen сюда не входят: до загрузки
        // каталога нельзя проверить, что планета существует (U45).
        set(patch);
      },

      requestFly(planetId: string, target: FlyTarget) {
        // `seq` увеличивается и при повторном перелёте к той же цели.
        set({ flyRequest: { planetId, target, seq: (get().flyRequest?.seq ?? 0) + 1 } });
      },

      requestMapFocus(planetId: string) {
        // Повторный клик по той же планете — новый запрос (U44).
        set({
          mapFocusRequest: { planetId, seq: (get().mapFocusRequest?.seq ?? 0) + 1 },
        });
      },

      setPlanetCardOpen(open: boolean) {
        set({ planetCardOpen: open });
      },

      requestCameraReset() {
        if (get().viewMode === 'system') {
          set({ systemCameraResetSeq: get().systemCameraResetSeq + 1 });
        } else {
          set({ cameraResetSeq: get().cameraResetSeq + 1 });
        }
      },

      setSceneTarget(target) {
        set({ sceneTarget: target });
      },

      setScaleMode(mode) {
        set({ scaleMode: mode });
      },

      setShowOrbit(value) {
        set({ showOrbit: value });
      },

      setShowHz(value) {
        set({ showHz: value });
      },

      leaveSystem() {
        set({
          viewMode: 'galaxy',
          leaveSystemSeq: get().leaveSystemSeq + 1,
        });
      },

      requestSystemReset() {
        set({ systemCameraResetSeq: get().systemCameraResetSeq + 1 });
      },

      async refreshSceneDetail() {
        const planetId = get().scenePlanetId;

        if (planetId === null) {
          set({ sceneDetail: null });
          return null;
        }

        const sequence = ++sceneDetailSequence;

        try {
          const detail = await get().getPlanetDetail(planetId);

          if (sequence !== sceneDetailSequence) {
            const current = get().sceneDetail;
            return current !== null && current.id === planetId ? current : null;
          }

          if (detail !== null && detail !== undefined) {
            set({ sceneDetail: detail });
            return detail;
          }

          const current = get().sceneDetail;
          return current !== null && current.id === planetId ? current : null;
        } catch (error: unknown) {
          console.warn('[store] деталь сцены не загружена:', error);

          const current = get().sceneDetail;
          return current !== null && current.id === planetId ? current : null;
        }
      },

      focusTable() {
        set({ focusTableSeq: get().focusTableSeq + 1 });
      },

      registerAction(name: HeaderActionName, action: (() => void) | null) {
        set({ actions: { ...get().actions, [name]: action } });
      },

      cacheResolved(planets: readonly ResolvedPlanet[]) {
        if (planets.length === 0) return;

        const next = { ...get().resolvedCache };

        for (const planet of planets) next[planet.id] = planet;

        set({ resolvedCache: next });
      },

      async loadResolved(ids: readonly string[]) {
        const cache = get().resolvedCache;
        const missing = [...new Set(ids)].filter((id) => cache[id] === undefined);

        if (missing.length === 0) return;

        try {
          const items = await backend.getResolved(missing);

          if (items.length === 0) return;

          const next = { ...get().resolvedCache };

          for (const planet of items) next[planet.id] = planet;

          set({ resolvedCache: next });
        } catch (error: unknown) {
          // Подсказка покажет статический текст словаря (п. 11.1).
          console.warn('[store] разрешённые планеты не загружены:', error);
        }
      },

      getPlanetDetail(id: string) {
        // Деталь не кэшируется: настройки и снимок меняются, ответ быстро
        // устаревает. Устаревшие ответы отбрасывает `planetDetail`.
        return backend.getPlanetDetail(id);
      },

      getPositions() {
        // Координаты считаются в воркере один раз за снимок; карта кэширует
        // результат по `snapshotId` и не пересчитывает его при смене фильтров.
        return backend.getPositions();
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

      ...exoMastSlice.actions,
    };
  });
}

/** Синглтон приложения: одно состояние на страницу. */
export const appStore = createAppStore();

/** React-хук для чтения части состояния. */
export function useAppStore<T>(selector: (state: AppState) => T): T {
  return useStore(appStore, selector);
}
