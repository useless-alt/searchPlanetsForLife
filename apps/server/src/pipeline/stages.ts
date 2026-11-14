/**
 * Порядок этапов загрузки каталога (задача 11, п. 10.1, 10.1.4).
 *
 * Этап 1 — параллельно NASA, Exoplanet.eu, Exo-MerCat.
 * Этап 2 — параллельно Gaia и SIMBAD, после этапа 1:
 *   - Gaia получает уникальные `extra.gaiaDr3Id` записей этапа 1;
 *   - SIMBAD — уникальные `hostname`.
 * Exo.MAST на старте не вызывается: он загружается лениво по запросу
 * пользователя (U6).
 *
 * Затем записи планет и звёзд сливаются {@link mergeCatalog} (задача 10).
 */

import {
  SOURCES,
  type MergeStats,
  type PlanetRecord,
  type SourceId,
  type SourceStatus,
} from '@exo/shared';

import { mergeCatalog } from '../merge/mergeCatalog';
import type { CatalogAdapter } from '../sources/adapter';
import { exomercatAdapter } from '../sources/exomercat';
import { exoplanetEuAdapter } from '../sources/exoplanet_eu';
import { nasaAdapter } from '../sources/nasa';
import {
  loadCatalogSource,
  loadGaiaSource,
  loadSimbadSource,
  type CatalogSourceId,
  type GaiaFetcher,
  type LoadSourceDeps,
  type LoadedSourceResult,
  type SimbadFetcher,
} from './loadSource';

/** Зависимости конвейера этапов. */
export interface StagesDeps extends LoadSourceDeps {
  /** Подмена адаптеров каталогов (NASA, Exoplanet.eu, Exo-MerCat). */
  adapters?: Partial<Record<CatalogSourceId, CatalogAdapter>>;
  /** Подмена загрузчика Gaia. */
  fetchGaia?: GaiaFetcher;
  /** Подмена загрузчика SIMBAD. */
  fetchSimbad?: SimbadFetcher;
}

/** Результат полного прохода этапов. */
export interface StagesResult {
  /** Планеты после слияния. */
  planets: PlanetRecord[];
  /** Статистика дедупликации. */
  stats: MergeStats;
  /** Статусы всех шести источников в порядке рангов. */
  statuses: SourceStatus[];
  /** Результаты загрузки источников (для диагностики и тестов). */
  loaded: LoadedSourceResult[];
}

/**
 * Начальные статусы источников: все шесть записей в порядке рангов,
 * состояние `pending` (Exo.MAST остаётся `pending` до первого запроса).
 */
export function createInitialStatuses(): SourceStatus[] {
  return SOURCES.map(({ id }) => ({
    source: id,
    state: 'pending',
    backupAt: null,
    message: null,
  }));
}

/** Убирает пустые значения и повторы, сохраняя порядок. */
function uniqueStrings(values: Iterable<string | null | undefined>): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (trimmed === '' || seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
}

/** Собирает статусы в порядке реестра источников (`SOURCES`). */
function orderStatuses(
  results: readonly LoadedSourceResult[],
  initial: readonly SourceStatus[],
): SourceStatus[] {
  const bySource = new Map<SourceId, SourceStatus>();
  for (const status of initial) bySource.set(status.source, status);
  for (const result of results) bySource.set(result.status.source, result.status);

  return SOURCES.map(({ id }) => {
    const status = bySource.get(id) ?? {
      source: id,
      state: 'pending' as const,
      backupAt: null,
      message: null,
    };
    return { ...status };
  });
}

/**
 * Выполняет полный проход загрузки: этапы 1–2, слияние.
 *
 * Ни один сбой источника не останавливает остальные: функции загрузки
 * возвращают статус, а не бросают исключение (10.1.3).
 */
export async function runStages(deps: StagesDeps): Promise<StagesResult> {
  const adapters: Record<CatalogSourceId, CatalogAdapter> = {
    nasa: deps.adapters?.nasa ?? nasaAdapter,
    exoplanet_eu: deps.adapters?.exoplanet_eu ?? exoplanetEuAdapter,
    exomercat: deps.adapters?.exomercat ?? exomercatAdapter,
  };

  // Этап 1: три каталога параллельно.
  const [nasa, exoplanetEu, exomercat] = await Promise.all([
    loadCatalogSource(adapters.nasa, deps),
    loadCatalogSource(adapters.exoplanet_eu, deps),
    loadCatalogSource(adapters.exomercat, deps),
  ]);

  const stage1 = [nasa, exoplanetEu, exomercat];
  const stage1Records = stage1.flatMap((result) => result.records);

  // Этап 2: идентификаторы Gaia и имена звёзд — из записей этапа 1.
  const gaiaIds = uniqueStrings(stage1Records.map((record) => record.extra.gaiaDr3Id));
  const hostNames = uniqueStrings(stage1Records.map((record) => record.hostname));

  const [gaia, simbad] = await Promise.all([
    loadGaiaSource(gaiaIds, deps),
    loadSimbadSource(hostNames, deps),
  ]);

  const loaded = [...stage1, gaia, simbad];
  const planets = [...stage1Records];
  const stars = [...gaia.stars, ...simbad.stars];
  const merged = mergeCatalog({ planets, stars });

  return {
    planets: merged.planets,
    stats: merged.stats,
    statuses: orderStatuses(loaded, createInitialStatuses()),
    loaded,
  };
}
