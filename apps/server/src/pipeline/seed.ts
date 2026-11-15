/**
 * Стартовый снимок каталога без обращения к сети (п. 8.1, 10.10).
 *
 * Зачем: конвейер загружает источники минутами, а при недоступности всех
 * API не может поднять сайт вообще. Поэтому сервер до `listen` пробует
 * прочитать готовый снимок с диска:
 *
 * 1. `BACKUP_DIR/merged/latest.json` — результат `npm run refresh`;
 * 2. `EXO_SNAPSHOT` — явно указанный файл (JSON или `.json.gz`);
 * 3. `data/demo/catalog.json.gz` — демонстрационный снимок из репозитория.
 *
 * Найденный снимок кладётся в кэш как готовый: страница рисуется сразу,
 * а обновление выполняется отдельно (`POST /api/refresh`, `npm run refresh`
 * или `EXO_AUTO_REFRESH=1`).
 */

import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';

import {
  BACKUP_SCHEMA_VERSION,
  type MergeStats,
  type PlanetRecord,
  type SourceId,
  type SourceStatus,
} from '@exo/shared';

import { computeSnapshotId, type Snapshot } from './snapshot';

/** Снимок, прочитанный с диска, и путь к нему. */
export interface SeedSnapshot {
  /** Готовый снимок для кэша конвейера. */
  snapshot: Snapshot;
  /** Файл, из которого прочитан снимок. */
  filePath: string;
}

/** Пустая статистика слияния: снимок пригоден, но цифры неизвестны. */
function emptyStats(planetCount: number): MergeStats {
  return {
    recordsBySource: {
      gaia: 0,
      exomast: 0,
      nasa: 0,
      exoplanet_eu: 0,
      simbad: 0,
      exomercat: 0,
    },
    uniquePlanets: planetCount,
    mergedClusters: 0,
    rejectedUnions: 0,
    sameSourceDuplicates: 0,
    ruleCounts: { R1: 0, R2: 0, R3: 0, R4: 0 },
    vetoed: 0,
  };
}

/** Проверка, что значение — непустой объект (не массив). */
function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Минимальная проверка записи планеты: без `id` и `name` каталог бесполезен. */
function isPlanetRecord(value: unknown): value is PlanetRecord {
  if (!isObject(value)) return false;
  return typeof value.id === 'string' && value.id.length > 0 && typeof value.name === 'string';
}

/** Проверка статуса источника из снимка. */
function isSourceStatus(value: unknown): value is SourceStatus {
  if (!isObject(value)) return false;
  return (
    typeof value.source === 'string' &&
    typeof value.state === 'string' &&
    (value.backupAt === null || typeof value.backupAt === 'string') &&
    (value.message === null || typeof value.message === 'string')
  );
}

/** Статистика слияния из снимка; неполную заменяем пустой. */
function normalizeStats(value: unknown, planetCount: number): MergeStats {
  if (!isObject(value)) return emptyStats(planetCount);
  const stats = value as Partial<MergeStats>;
  if (typeof stats.uniquePlanets !== 'number' || !isObject(stats.recordsBySource)) {
    return emptyStats(planetCount);
  }
  return {
    ...emptyStats(planetCount),
    ...stats,
    recordsBySource: stats.recordsBySource as Record<SourceId, number>,
    ruleCounts: (stats.ruleCounts ??
      emptyStats(planetCount).ruleCounts) as MergeStats['ruleCounts'],
  };
}

/**
 * Достаёт payload из файла: `merged/latest.json` хранит конверт `{ meta, payload }`,
 * демонстрационный снимок — сразу `CatalogResponse`.
 */
function extractPayload(value: unknown): unknown {
  if (isObject(value) && value.payload !== undefined) return value.payload;
  return value;
}

/**
 * Строит снимок из ответа `GET /api/catalog` (`CatalogResponse`).
 *
 * @returns снимок либо `null`, если структура не похожа на каталог.
 */
export function snapshotFromCatalogPayload(value: unknown): Snapshot | null {
  const payload = extractPayload(value);
  if (!isObject(payload)) return null;

  const planetsRaw = payload.planets;
  if (!Array.isArray(planetsRaw)) return null;

  const planets = planetsRaw.filter(isPlanetRecord);
  if (planets.length === 0) return null;

  const header = isObject(payload.snapshot) ? payload.snapshot : null;
  const builtAt = typeof header?.builtAt === 'string' ? header.builtAt : new Date().toISOString();
  const schemaVersion =
    typeof header?.schemaVersion === 'number' ? header.schemaVersion : BACKUP_SCHEMA_VERSION;
  const id =
    typeof header?.id === 'string' && header.id.length > 0 ? header.id : computeSnapshotId(planets);

  const sources = Array.isArray(payload.sources) ? payload.sources.filter(isSourceStatus) : [];

  return {
    id,
    builtAt,
    planetCount: planets.length,
    schemaVersion,
    planets,
    stats: normalizeStats(payload.stats, planets.length),
    sources,
  };
}

/**
 * Читает снимок из файла. Поддерживаются обычный JSON и `.json.gz`.
 *
 * Ошибки чтения и разбора не бросаются: отсутствие или порча стартового
 * снимка — не повод не поднимать сервер.
 */
export async function readSeedSnapshot(filePath: string): Promise<SeedSnapshot | null> {
  let raw: Buffer;
  try {
    raw = await readFile(filePath);
  } catch {
    return null;
  }

  let text: string;
  try {
    text = filePath.toLowerCase().endsWith('.gz')
      ? gunzipSync(raw).toString('utf8')
      : raw.toString('utf8');
  } catch {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }

  const snapshot = snapshotFromCatalogPayload(parsed);
  return snapshot === null ? null : { snapshot, filePath };
}

/**
 * Перебирает кандидатов по порядку и возвращает первый пригодный снимок.
 *
 * @param candidates пути к файлам; `null`/`undefined` пропускаются.
 */
export async function loadSeedSnapshot(
  candidates: ReadonlyArray<string | null | undefined>,
): Promise<SeedSnapshot | null> {
  for (const candidate of candidates) {
    if (typeof candidate !== 'string' || candidate.trim() === '') continue;
    const seed = await readSeedSnapshot(candidate);
    if (seed !== null) return seed;
  }
  return null;
}
