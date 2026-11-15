import type { FilterState, ModelSettings, PlanetRecord, ResolvedPlanet } from '@exo/shared';

import { createRankingEngine } from './rankingWorker';
import type {
  ComputeResult,
  PlanetDetail,
  PlanetPosition,
  SortSpec,
  WorkerRequest,
  WorkerResponse,
} from './protocol';

/**
 * Запасной/основной бэкенд расчёта (задача 12, п. 3).
 *
 * Реализации:
 * - `createWorkerBackend` — Web Worker через Vite (`new Worker(new URL(...))`);
 * - `createInlineBackend` — тот же движок в основном потоке (тесты и браузеры
 *   без `Worker`).
 *
 * Обе реализации используют один клиент `createComputeBackend`, который:
 * - помечает запросы `requestId` и отбрасывает ответы с устаревшим id;
 * - объединяет пересчёты: пока один идёт, выполняется только последний
 *   запрос (перемещение ползунка не создаёт очередь).
 */

/** Ошибка «запрос перекрыт более новым»: результат такого запроса не нужен. */
export class StaleComputeError extends Error {
  /** Машиночитаемый признак для обработчиков. */
  readonly code = 'stale_compute';

  constructor() {
    super('Пересчёт отменён: поступил более новый запрос');
    this.name = 'StaleComputeError';
  }
}

/** Транспорт сообщений: Worker или движок в основном потоке. */
export interface BackendChannel {
  /** Отправляет запрос движку. */
  send(message: WorkerRequest): void;
  /** Подписывается на ответы; возврата подписки не требуется. */
  subscribe(handler: (message: WorkerResponse) => void): void;
  /** Закрывает транспорт. */
  close(): void;
}

/** Бэкенд расчёта, используемый store. */
export interface ComputeBackend {
  /**
   * Передаёт каталог снимка в воркер и выполняет `solveCatalog` один раз.
   * Возвращает число разрешённых планет (ответ `ready`).
   */
  init(planets: readonly PlanetRecord[]): Promise<number>;
  /** Пересчитывает Топ-50; устаревшие запросы отклоняются `StaleComputeError`. */
  compute(settings: ModelSettings, filters: FilterState, sort: SortSpec): Promise<ComputeResult>;
  /** Возвращает разрешённые планеты по идентификаторам (карточка, 3D). */
  getResolved(ids: readonly string[]): Promise<ResolvedPlanet[]>;
  /** Возвращает координаты всех планет (3D-карта, задача 21). */
  getPositions(): Promise<PlanetPosition[]>;
  /** Возвращает полные данные планеты для карточки (задача 19). */
  getPlanetDetail(id: string): Promise<PlanetDetail>;
  /** Освобождает транспорт; незавершённые запросы отклоняются. */
  dispose(): void;
}

/** Подписка на сообщения Web Worker. */
export function createWorkerChannel(worker: Worker): BackendChannel {
  const handlers = new Set<(message: WorkerResponse) => void>();

  worker.addEventListener('message', (event: MessageEvent<WorkerResponse>) => {
    for (const handler of handlers) handler(event.data);
  });

  return {
    send(message) {
      worker.postMessage(message);
    },
    subscribe(handler) {
      handlers.add(handler);
    },
    close() {
      handlers.clear();
      worker.terminate();
    },
  };
}

/** Асинхронный транспорт поверх движка в основном потоке. */
export function createInlineChannel(): BackendChannel {
  const engine = createRankingEngine();
  const handlers = new Set<(message: WorkerResponse) => void>();

  return {
    send(message) {
      // Микрозадача сохраняет асинхронность Worker: ответ приходит после
      // текущего обработчика, а не внутри вызова `send`.
      queueMicrotask(() => {
        let response: WorkerResponse;

        try {
          response = engine.handle(message);
        } catch (error: unknown) {
          response = {
            type: 'error',
            requestId: message.requestId,
            message: error instanceof Error ? error.message : String(error),
          };
        }

        for (const handler of handlers) handler(response);
      });
    },
    subscribe(handler) {
      handlers.add(handler);
    },
    close() {
      handlers.clear();
    },
  };
}

/** Запрос пересчёта, ожидающий завершения текущего. */
interface QueuedCompute {
  settings: ModelSettings;
  filters: FilterState;
  sort: SortSpec;
  resolve: (value: ComputeResult) => void;
  reject: (reason: unknown) => void;
}

/** Активный запрос пересчёта. */
interface ActiveCompute {
  requestId: number;
  resolve: (value: ComputeResult) => void;
  reject: (reason: unknown) => void;
}

/** Ожидающий ответ на не-вычислительный запрос. */
interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
}

/**
 * Создаёт клиент бэкенда поверх произвольного транспорта.
 *
 * Гарантии:
 * - не более одного активного пересчёта и одного ожидающего;
 * - ожидающий пересчёт вытесняется новым (старый отклоняется
 *   `StaleComputeError`);
 * - ответ с `requestId`, не совпадающим с активным, игнорируется.
 */
export function createComputeBackend(channel: BackendChannel): ComputeBackend {
  let nextRequestId = 1;
  let active: ActiveCompute | null = null;
  let queued: QueuedCompute | null = null;
  let disposed = false;

  const pending = new Map<number, PendingRequest>();

  /** Отправляет пересчёт в транспорт и делает его активным. */
  function dispatchCompute(call: QueuedCompute): void {
    const requestId = nextRequestId++;
    active = {
      requestId,
      resolve: call.resolve,
      reject: call.reject,
    };
    channel.send({
      type: 'compute',
      requestId,
      settings: call.settings,
      filters: call.filters,
      sort: call.sort,
    });
  }

  /** Запускает ожидающий пересчёт, если он есть. */
  function runQueuedCompute(): void {
    if (queued === null) return;

    const next = queued;
    queued = null;
    dispatchCompute(next);
  }

  /** Завершает активный пересчёт и запускает следующий. */
  function settleActive(error: unknown, result?: ComputeResult): void {
    if (active === null) return;

    const { resolve, reject } = active;
    active = null;

    if (error !== null) reject(error);
    else if (result !== undefined) resolve(result);

    runQueuedCompute();
  }

  channel.subscribe((message) => {
    switch (message.type) {
      case 'result': {
        // Устаревший ответ отбрасывается (запрос уже перекрыт новым).
        if (active === null || message.requestId !== active.requestId) return;

        settleActive(null, { rows: message.rows, counters: message.counters });
        return;
      }

      case 'error': {
        if (active !== null && message.requestId === active.requestId) {
          settleActive(new Error(message.message));
          return;
        }

        const entry = pending.get(message.requestId);
        if (entry === undefined) return;

        pending.delete(message.requestId);
        entry.reject(new Error(message.message));
        return;
      }

      case 'ready':
      case 'resolved':
      case 'positions':
      case 'detail': {
        const entry = pending.get(message.requestId);
        if (entry === undefined) return;

        pending.delete(message.requestId);

        if (message.type === 'ready') entry.resolve(message.count);
        else if (message.type === 'detail') entry.resolve(message.detail);
        else entry.resolve(message.items);
        return;
      }
    }
  });

  /** Обычный запрос «один запрос — один ответ». */
  function request<T>(build: (requestId: number) => WorkerRequest): Promise<T> {
    if (disposed) return Promise.reject(new Error('Бэкенд расчёта закрыт'));

    const requestId = nextRequestId++;

    return new Promise<T>((resolve, reject) => {
      pending.set(requestId, {
        resolve: resolve as (value: unknown) => void,
        reject,
      });
      channel.send(build(requestId));
    });
  }

  return {
    init(planets) {
      return request((requestId) => ({
        type: 'init',
        requestId,
        planets: [...planets],
      }));
    },

    compute(settings, filters, sort) {
      if (disposed) return Promise.reject(new Error('Бэкенд расчёта закрыт'));

      return new Promise<ComputeResult>((resolve, reject) => {
        const call: QueuedCompute = { settings, filters, sort, resolve, reject };

        if (active !== null) {
          // «Выполняется только последний»: прежний ожидающий отменяется.
          if (queued !== null) queued.reject(new StaleComputeError());
          queued = call;
          return;
        }

        dispatchCompute(call);
      });
    },

    getResolved(ids) {
      return request((requestId) => ({ type: 'getResolved', requestId, ids: [...ids] }));
    },

    getPositions() {
      return request((requestId) => ({ type: 'getPositions', requestId }));
    },

    getPlanetDetail(id) {
      return request((requestId) => ({ type: 'getPlanetDetail', requestId, id }));
    },

    dispose() {
      if (disposed) return;

      disposed = true;
      channel.close();

      const stopError = new Error('Бэкенд расчёта закрыт');

      if (queued !== null) {
        queued.reject(stopError);
        queued = null;
      }

      if (active !== null) {
        active.reject(stopError);
        active = null;
      }

      for (const entry of pending.values()) entry.reject(stopError);
      pending.clear();
    },
  };
}

/** Создаёт Worker средствами Vite (модульный воркер). */
function createDefaultWorker(): Worker {
  return new Worker(new URL('./rankingWorker.ts', import.meta.url), { type: 'module' });
}

/** Бэкенд в Web Worker. */
export function createWorkerBackend(
  createWorker: () => Worker = createDefaultWorker,
): ComputeBackend {
  return createComputeBackend(createWorkerChannel(createWorker()));
}

/** Запасной бэкенд в основном потоке (тесты, браузер без `Worker`). */
export function createInlineBackend(): ComputeBackend {
  return createComputeBackend(createInlineChannel());
}

/**
 * Бэкенд по умолчанию: Worker, если он доступен, иначе основной поток.
 *
 * В тестах jsdom `Worker` отсутствует, поэтому используется запасная
 * реализация — те же расчёты, тот же протокол.
 */
export function createDefaultBackend(): ComputeBackend {
  if (typeof Worker === 'undefined') return createInlineBackend();

  try {
    return createWorkerBackend();
  } catch {
    return createInlineBackend();
  }
}
