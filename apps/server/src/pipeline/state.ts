/**
 * Состояние загрузки каталога в памяти процесса (задача 11, п. 10.10).
 *
 * Инварианты:
 * - одновременно выполняется только одна сборка (single-flight);
 * - во время повторного обновления читатели получают прежний снимок;
 * - замена снимка выполняется одной операцией после успешной сборки;
 * - если новая сборка дала 0 планет, прежний снимок сохраняется;
 * - если 0 планет и снимка нет — фаза `error`.
 */

import type {
  CatalogResponse,
  ErrorLogEntry,
  ExoMastProps,
  PlanetRecord,
  SourceId,
  SourceStatus,
  StatusResponse,
} from '@exo/shared';

import type { BackupStore } from '../backup/store';
import type { FetchLike } from '../sources/tap';
import type { ErrorLog } from './errorLog';
import { createSnapshotCache, buildSnapshot, toCatalogResponse, type Snapshot } from './snapshot';
import { createInitialStatuses, runStages, type StagesDeps, type StagesResult } from './stages';

/** Настройки состояния конвейера. */
export interface PipelineStateOptions extends StagesDeps {
  /** Хранилище резервных копий. */
  backup: BackupStore;
  /** Журнал ошибок. */
  errorLog: ErrorLog;
  /**
   * Стартовый снимок с диска (см. `pipeline/seed.ts`). Если он есть, каталог
   * доступен сразу после `listen`, а сеть не нужна до первого обновления.
   */
  initialSnapshot?: Snapshot;
  /** Текущее время (в тестах — фиксированное). */
  now?: () => Date;
}

/** Изменяемая часть статуса источника. */
export type SourceStatusPatch = Partial<Pick<SourceStatus, 'state' | 'backupAt' | 'message'>>;

/** Публичный интерфейс состояния конвейера. */
export interface PipelineState {
  /** Ответ `GET /api/status`. */
  getStatus(): StatusResponse;
  /** Ответ `GET /api/catalog`; null — снимка ещё нет. */
  getCatalog(): CatalogResponse | null;
  /** Текущий снимок либо null. */
  getSnapshot(): Snapshot | null;
  /** Находит планету в текущем снимке по стабильному ID (U17). */
  getPlanet(id: string): PlanetRecord | null;
  /**
   * Запускает сборку. Возвращает false, если сборка уже идёт
   * (single-flight, п. 10.10).
   */
  startRefresh(): boolean;
  /** Ждёт завершения текущей сборки (для тестов и корректного shutdown). */
  waitForIdle(): Promise<void>;
  /** Обновляет статус источника (используется ленивым Exo.MAST). */
  updateSourceStatus(source: SourceId, patch: SourceStatusPatch): void;
  /** Добавляет запись в журнал ошибок. */
  recordError(entry: ErrorLogEntry): Promise<void>;
  /** Хранилище резервных копий (для маршрута Exo.MAST). */
  getBackup(): BackupStore;
  /** Журнал ошибок. */
  getErrorLog(): ErrorLog;
  /** Функция HTTP-запроса из настроек (для тестов). */
  getFetchImpl(): FetchLike | undefined;
  /** Таймаут запроса из настроек [мс]. */
  getTimeoutMs(): number | undefined;
  /**
   * Последние свойства Exo.MAST планеты (задача 28): нужны маршруту
   * спектров, чтобы принимать только имена из полученного списка.
   */
  getExoMastProps(planetId: string): ExoMastProps | null;
  /** Запоминает свойства Exo.MAST после успешного ленивого запроса. */
  setExoMastProps(props: ExoMastProps): void;
}

/**
 * Создаёт состояние конвейера.
 *
 * Сборка не стартует автоматически: `start()` вызывает
 * {@link PipelineState.startRefresh} после `listen`, чтобы первые запросы
 * не блокировались (п. 10.10).
 */
export function createPipelineState(options: PipelineStateOptions): PipelineState {
  const cache = createSnapshotCache();
  const now = options.now ?? (() => new Date());

  // Стартовый снимок с диска: страница работает без ожидания сети (п. 8.1).
  const initial = options.initialSnapshot ?? null;
  if (initial !== null) cache.set(initial);

  let statuses: SourceStatus[] =
    initial !== null && initial.sources.length > 0
      ? initial.sources.map((status) => ({ ...status }))
      : createInitialStatuses();
  let phase: StatusResponse['phase'] = initial !== null ? 'ready' : 'idle';
  let startedAt: string | null = null;
  let finishedAt: string | null = null;
  let inFlight: Promise<void> | null = null;

  /** Последние свойства Exo.MAST по планетам (ленивый источник, U6). */
  const exomastProps = new Map<string, ExoMastProps>();

  const deps: StagesDeps = {
    ...options,
    logError: options.logError ?? ((entry: ErrorLogEntry) => options.errorLog.append(entry)),
  };

  function timestamp(): string {
    return now().toISOString();
  }

  function hasSnapshot(): boolean {
    return cache.get() !== null;
  }

  function finishBuild(): void {
    finishedAt = timestamp();
    inFlight = null;
  }

  async function executeBuild(): Promise<void> {
    try {
      const result: StagesResult = await runStages(deps);
      // Exo.MAST не участвует в статической сборке (U6): его последнее
      // состояние, полученное ленивым запросом, переживает обновление.
      const exomast = statuses.find((status) => status.source === 'exomast');
      statuses = result.statuses.map((status) =>
        status.source === 'exomast' && exomast !== undefined ? { ...exomast } : status,
      );

      if (result.planets.length > 0) {
        const snapshot = buildSnapshot({
          planets: result.planets,
          stats: result.stats,
          sources: result.statuses,
          builtAt: timestamp(),
        });
        // Замена указателя — одна операция: читатели видят старый или новый
        // снимок целиком (10.10.5).
        cache.set(snapshot);
        phase = 'ready';
      } else if (hasSnapshot()) {
        // Новая сборка пуста — прежний снимок остаётся (10.10.5).
        phase = 'ready';
      } else {
        phase = 'error';
      }
    } catch (error: unknown) {
      console.warn('[pipeline] сборка каталога завершилась ошибкой:', error);
      phase = hasSnapshot() ? 'ready' : 'error';
    } finally {
      finishBuild();
    }
  }

  function startRefresh(): boolean {
    if (inFlight !== null) return false;

    startedAt = timestamp();
    finishedAt = null;
    if (!hasSnapshot()) phase = 'loading';

    const run = executeBuild();
    inFlight = run;
    return true;
  }

  function getStatus(): StatusResponse {
    const snapshotExists = hasSnapshot();
    return {
      phase: snapshotExists ? 'ready' : phase,
      refreshing: inFlight !== null && snapshotExists,
      startedAt,
      finishedAt,
      sources: statuses.map((status) => ({ ...status })),
      hasSnapshot: snapshotExists,
    };
  }

  function getCatalog(): CatalogResponse | null {
    const snapshot = cache.get();
    if (snapshot === null) return null;
    return toCatalogResponse(
      snapshot,
      statuses.map((status) => ({ ...status })),
    );
  }

  function getPlanet(id: string): PlanetRecord | null {
    const snapshot = cache.get();
    if (snapshot === null) return null;
    return snapshot.planets.find((planet) => planet.id === id) ?? null;
  }

  function updateSourceStatus(source: SourceId, patch: SourceStatusPatch): void {
    statuses = statuses.map((status) =>
      status.source === source ? { ...status, ...patch } : status,
    );
  }

  async function waitForIdle(): Promise<void> {
    const running = inFlight;
    if (running !== null) await running;
  }

  return {
    getStatus,
    getCatalog,
    getSnapshot: () => cache.get(),
    getPlanet,
    startRefresh,
    waitForIdle,
    updateSourceStatus,
    recordError: (entry: ErrorLogEntry) => options.errorLog.append(entry),
    getBackup: () => options.backup,
    getErrorLog: () => options.errorLog,
    getFetchImpl: () => options.fetchImpl,
    getTimeoutMs: () => options.timeoutMs,
    getExoMastProps: (planetId: string) => exomastProps.get(planetId) ?? null,
    setExoMastProps: (props: ExoMastProps) => {
      exomastProps.set(props.planetId, props);
    },
  };
}
