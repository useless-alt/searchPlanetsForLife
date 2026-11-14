/**
 * Снимок каталога (задача 11, п. 10.10).
 *
 * Снимок неизменяем: новая сборка создаёт новый объект, а замена
 * указателя в {@link SnapshotCache} выполняется атомарно после успешного
 * завершения сборки. `id` — SHA-256 от JSON.stringify списка планет;
 * он же служит ETag ответа `GET /api/catalog`.
 */

import { createHash } from 'node:crypto';

import {
  BACKUP_SCHEMA_VERSION,
  type CatalogResponse,
  type CatalogSnapshotHeader,
  type MergeStats,
  type PlanetRecord,
  type SourceStatus,
} from '@exo/shared';

/** Полный снимок каталога в памяти процесса. */
export interface Snapshot extends CatalogSnapshotHeader {
  /** Планеты после дедупликации и слияния. */
  planets: PlanetRecord[];
  /** Статистика слияния. */
  stats: MergeStats;
  /** Статусы источников на момент сборки. */
  sources: SourceStatus[];
}

/** Входные данные для сборки снимка. */
export interface BuildSnapshotInput {
  /** Планеты после слияния. */
  planets: PlanetRecord[];
  /** Статистика слияния. */
  stats: MergeStats;
  /** Статусы источников. */
  sources: SourceStatus[];
  /** Время сборки; по умолчанию — текущее. */
  builtAt?: string;
}

/**
 * Вычисляет идентификатор снимка: SHA-256 (hex) от JSON списка планет.
 *
 * Порядок планет входит в хеш: снимок детерминирован для одного и того же
 * результата слияния.
 */
export function computeSnapshotId(planets: readonly PlanetRecord[]): string {
  return createHash('sha256').update(JSON.stringify(planets)).digest('hex');
}

/**
 * Собирает снимок каталога.
 *
 * `schemaVersion` берётся из {@link BACKUP_SCHEMA_VERSION} (п. 8.1):
 * формат снимка и резервных копий версионируется одинаково.
 */
export function buildSnapshot(input: BuildSnapshotInput): Snapshot {
  return {
    id: computeSnapshotId(input.planets),
    builtAt: input.builtAt ?? new Date().toISOString(),
    planetCount: input.planets.length,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    planets: input.planets,
    stats: input.stats,
    sources: input.sources,
  };
}

/**
 * Заголовок снимка для ответа `GET /api/catalog`.
 */
export function snapshotHeader(snapshot: Snapshot): CatalogSnapshotHeader {
  return {
    id: snapshot.id,
    builtAt: snapshot.builtAt,
    planetCount: snapshot.planetCount,
    schemaVersion: snapshot.schemaVersion,
  };
}

/**
 * Формирует тело ответа `GET /api/catalog` из снимка.
 *
 * @param snapshot - текущий снимок.
 * @param sources - актуальные статусы источников (могут отличаться от
 *   статусов на момент сборки, например после вызова Exo.MAST).
 */
export function toCatalogResponse(snapshot: Snapshot, sources: SourceStatus[]): CatalogResponse {
  return {
    snapshot: snapshotHeader(snapshot),
    planets: snapshot.planets,
    sources,
    stats: snapshot.stats,
  };
}

/** Кэш текущего снимка в памяти процесса. */
export interface SnapshotCache {
  /** Текущий снимок либо null, если снимка ещё нет. */
  get(): Snapshot | null;
  /** Атомарно заменяет текущий снимок. */
  set(snapshot: Snapshot): void;
  /** Очищает кэш (используется в тестах). */
  clear(): void;
}

/**
 * Создаёт кэш снимка. Ссылка на снимок меняется одной операцией,
 * поэтому читатели видят либо старый, либо новый снимок целиком (10.10.5).
 */
export function createSnapshotCache(): SnapshotCache {
  let current: Snapshot | null = null;
  return {
    get: () => current,
    set: (snapshot: Snapshot) => {
      current = snapshot;
    },
    clear: () => {
      current = null;
    },
  };
}
