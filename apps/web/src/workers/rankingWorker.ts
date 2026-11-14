import {
  Q_BADGE_THRESHOLDS,
  computeRanking,
  solveCatalog,
  spectralClass,
  type PlanetRecord,
  type ResolvedPlanet,
} from '@exo/shared';

import {
  toSortState,
  type QBadge,
  type RankedRowView,
  type WorkerRequest,
  type WorkerResponse,
} from './protocol';

/**
 * Воркер расчёта Топ-50 (задача 12, п. 3, 10.1).
 *
 * Воркер выполняет `solveCatalog` один раз за снимок каталога и держит
 * `ResolvedPlanet[]` в памяти. Пересчёт при смене режима, настроек и фильтров
 * идёт здесь же, поэтому основной поток не блокируется.
 *
 * Движок (`createRankingEngine`) — чистая синхронная функция «запрос → ответ»:
 * он же используется запасной реализацией в основном потоке (`computeBackend`).
 */

/** Данные планеты, которых нет в `ResolvedPlanet`, но они нужны таблице. */
interface PlanetDisplay {
  /** Отображаемое имя планеты. */
  name: string;
  /** Имя родительской звезды. */
  hostname: string;
  /** Число источников записи. */
  sourcesCount: number;
}

/** Движок воркера: обрабатывает сообщения синхронно. */
export interface RankingEngine {
  /** Обрабатывает запрос и возвращает ответ с тем же `requestId`. */
  handle(request: WorkerRequest): WorkerResponse;
  /** Число разрешённых планет; 0 — каталог ещё не инициализирован. */
  readonly count: number;
}

/** Бейдж достоверности Q_data по порогам U8. */
function qBadge(q: number): QBadge {
  if (q >= Q_BADGE_THRESHOLDS.high) return 'high';
  if (q >= Q_BADGE_THRESHOLDS.medium) return 'medium';

  return 'low';
}

/** Сообщение об ошибке в виде строки. */
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Создаёт движок воркера.
 *
 * Состояние замыкания: разрешённые планеты, индекс метаданных и признак
 * инициализации. `init` заменяет состояние целиком — это происходит один раз
 * на снимок каталога (10.10.5).
 */
export function createRankingEngine(): RankingEngine {
  let resolved: ResolvedPlanet[] = [];
  let byId = new Map<string, ResolvedPlanet>();
  let display = new Map<string, PlanetDisplay>();
  let initialized = false;

  /** Переводит строку ранжирования в строку таблицы. */
  function toRow(row: ReturnType<typeof computeRanking>['rows'][number]): RankedRowView {
    const planet = row.planet;
    const meta = display.get(row.planetId);

    return {
      rank: row.rank,
      rankClassic: row.rankClassic,
      delta: row.delta,
      planetId: row.planetId,
      score: row.score,
      name: meta?.name ?? row.planetId,
      hostname: meta?.hostname ?? '',
      R: planet.R.value,
      M: planet.M.value,
      T_s: row.score.T_s,
      e: planet.e.value,
      spectralClass: spectralClass(planet.st_teff.value),
      dist_pc: planet.dist_pc.value,
      sourcesCount: meta?.sourcesCount ?? 0,
      qBadge: qBadge(row.score.Q_data),
      levelB_mass: planet.flags.levelB_mass,
      levelB_radius: planet.flags.levelB_radius,
      e_assumed_zero: planet.flags.e_assumed_zero,
    };
  }

  function requireInitialized(): void {
    if (!initialized) throw new Error('Каталог ещё не передан в воркер: сначала init');
  }

  return {
    get count() {
      return resolved.length;
    },

    handle(request: WorkerRequest): WorkerResponse {
      switch (request.type) {
        case 'init': {
          const records: PlanetRecord[] = request.planets;
          resolved = solveCatalog(records);
          byId = new Map(resolved.map((planet) => [planet.id, planet]));
          display = new Map(
            records.map((record) => [
              record.id,
              {
                name: record.name,
                hostname: record.hostname,
                sourcesCount: record.sources.length,
              },
            ]),
          );
          initialized = true;

          return { type: 'ready', requestId: request.requestId, count: resolved.length };
        }

        case 'compute': {
          requireInitialized();

          const ranking = computeRanking(
            resolved,
            request.settings,
            request.filters,
            toSortState(request.sort),
          );

          return {
            type: 'result',
            requestId: request.requestId,
            rows: ranking.rows.map(toRow),
            counters: ranking.counters,
          };
        }

        case 'getResolved': {
          requireInitialized();

          const items = request.ids
            .map((id) => byId.get(id))
            .filter((planet): planet is ResolvedPlanet => planet !== undefined);

          return { type: 'resolved', requestId: request.requestId, items };
        }

        case 'getPositions': {
          requireInitialized();

          return {
            type: 'positions',
            requestId: request.requestId,
            items: resolved.map((planet) => ({
              id: planet.id,
              ra: planet.ra.value,
              dec: planet.dec.value,
              dist_pc: planet.dist_pc.value,
            })),
          };
        }

        default: {
          // Исчерпывающая проверка: неизвестный тип запроса — ошибка протокола.
          const unknown = request as { requestId?: number };
          return {
            type: 'error',
            requestId: unknown.requestId ?? 0,
            message: `Неизвестный тип запроса: ${String((request as { type?: string }).type)}`,
          };
        }
      }
    },
  };
}

/** Проверяет, что код исполняется в контексте выделенного воркера. */
function isWorkerScope(): boolean {
  // В DOM и jsdom есть `document`; в Node нет ни `document`, ни `postMessage`.
  const scope = globalThis as { document?: unknown; postMessage?: unknown };

  return scope.document === undefined && typeof scope.postMessage === 'function';
}

/**
 * Подключение к `postMessage` из контекста воркера.
 *
 * В основном потоке (jsdom, Node, тесты) этот блок не выполняется:
 * движок используется напрямую запасной реализацией.
 */
if (isWorkerScope()) {
  const scope = globalThis as unknown as {
    addEventListener(type: 'message', listener: (event: MessageEvent<WorkerRequest>) => void): void;
    postMessage(message: WorkerResponse): void;
  };

  const engine = createRankingEngine();

  scope.addEventListener('message', (event) => {
    const request = event.data;

    try {
      scope.postMessage(engine.handle(request));
    } catch (error: unknown) {
      scope.postMessage({
        type: 'error',
        requestId: request.requestId,
        message: errorMessage(error),
      });
    }
  });
}
