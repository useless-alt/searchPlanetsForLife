import {
  DEFAULT_SETTINGS,
  Q_BADGE_THRESHOLDS,
  classifyWorld,
  computeHz,
  computeRanking,
  renderGaps,
  scorePlanet,
  searchKey,
  solveCatalog,
  spectralClass,
  type ModelSettings,
  type PlanetRecord,
  type ResolvedPlanet,
  type ScoreBreakdown,
} from '@exo/shared';

import {
  toSortState,
  type PlanetDetail,
  type QLevel,
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
  /** Буква планеты у звезды; null — не определена. */
  letter: string | null;
  /** Синонимы имени планеты. */
  aliases: string[];
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

/** Уровень достоверности Q_data по порогам U8. */
function qLevel(q: number): QLevel {
  if (q >= Q_BADGE_THRESHOLDS.high) return 'high';
  if (q >= Q_BADGE_THRESHOLDS.medium) return 'medium';

  return 'estimated';
}

/** Сообщение об ошибке в виде строки. */
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Канонический ключ имени звезды для 3D-карты (задача 21; п. 7.2, U44).
 *
 * Используется та же нормализация, что у поиска: для латинских имён она
 * совпадает с `normalizeName` слияния, но не теряет кириллицу. Пустой
 * результат означает отсутствие имени — система определяется по id планеты.
 */
function normalizeName(value: string): string | null {
  return searchKey(value) || null;
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

  /** Настройки последнего пересчёта: карточка считает по ним же. */
  let lastSettings: ModelSettings = DEFAULT_SETTINGS;
  /** Оценки последнего Топ-50 по идентификатору планеты. */
  let lastScores = new Map<string, ScoreBreakdown>();
  /** Базовые ранги упрощённого ESI из последнего пересчёта (весь набор). */
  let lastClassicRanks = new Map<string, number>();

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
      Q_data: row.score.Q_data,
      qLevel: qLevel(row.score.Q_data),
      provenance: {
        R: planet.R.provenance,
        M: planet.M.provenance,
        e: planet.e.provenance,
      },
      lowReliability: planet.flags.levelB_mass || planet.flags.levelB_radius,
      insufficient: planet.flags.insufficient_data,
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
                letter: record.letter,
                aliases: [...record.aliases],
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

          // Карточка считает по тем же настройкам и тем же рангам (задача 19).
          lastSettings = request.settings;
          lastScores = new Map(ranking.rows.map((row) => [row.planetId, row.score]));
          lastClassicRanks = ranking.classicRanks;

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
            items: resolved.map((planet) => {
              const hostname = display.get(planet.id)?.hostname ?? '';
              const hostKey = normalizeName(hostname);

              return {
                id: planet.id,
                hostKey,
                ra: planet.ra.value,
                dec: planet.dec.value,
                dist_pc: planet.dist_pc.value,
                st_teff: planet.st_teff.value,
              };
            }),
          };
        }

        case 'getPlanetDetail': {
          requireInitialized();

          const planet = byId.get(request.id);

          if (planet === undefined) throw new Error(`Планета не найдена: ${request.id}`);

          const meta = display.get(planet.id);
          const hzResult = computeHz({
            st_teff: planet.st_teff.value,
            L: planet.L.value,
            d: planet.d.value,
            e: planet.e.value,
            bounds: lastSettings.hzBounds,
          });

          // Границы показываются, только когда посчитаны все пять величин:
          // карточка и 3D-сцена берут их из одной функции (11.4).
          const hz =
            hzResult.d_in !== null &&
            hzResult.d_out !== null &&
            hzResult.d_eff !== null &&
            hzResult.HZD !== null &&
            hzResult.F_HZ !== null
              ? {
                  d_in: hzResult.d_in,
                  d_out: hzResult.d_out,
                  d_eff: hzResult.d_eff,
                  HZD: hzResult.HZD,
                  F_HZ: hzResult.F_HZ,
                }
              : null;

          const score = lastScores.get(planet.id) ?? scorePlanet(planet, lastSettings);

          const detail: PlanetDetail = {
            id: planet.id,
            name: meta?.name ?? planet.id,
            hostname: meta?.hostname ?? null,
            letter: meta?.letter ?? null,
            aliases: meta?.aliases ?? [],
            sourcesCount: meta?.sourcesCount ?? 0,
            resolved: planet,
            score,
            classicRank: lastClassicRanks.get(planet.id) ?? null,
            hz,
            world: classifyWorld(planet),
            gaps: renderGaps(planet),
            inTop: lastScores.has(planet.id),
          };

          return { type: 'detail', requestId: request.requestId, detail };
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
