/**
 * @exo/server — HTTP-сервер каталога экзопланет (Node.js + Fastify).
 *
 * TIER 1 (задача 1): поднимает сервер и отдаёт `GET /api/health`.
 * Задача 7: хранилище резервных JSON-копий (п. 8.1–8.2).
 * Задача 8: TAP-клиент и адаптеры каталогов NASA, Exoplanet.eu, Exo-MerCat.
 * Задача 9: адаптеры Gaia, SIMBAD и ленивый Exo.MAST.
 * Задача 10: дедупликация и слияние записей (`merge/`).
 * Задача 11: конвейер загрузки и REST-маршруты (`pipeline/`, `routes/`).
 *
 * Секреты и ключи здесь не нужны: хранилище проекта — JSON-файлы (п. 1.4).
 */

import path from 'node:path';
import { pathToFileURL } from 'node:url';

import compress from '@fastify/compress';
import Fastify, { type FastifyInstance } from 'fastify';

import { BACKUP_MIN_VERSIONS } from '@exo/shared';

import { createBackupStore, type BackupStore } from './backup/store';
import { createErrorLog } from './pipeline/errorLog';
import { createPipelineState, type PipelineState } from './pipeline/state';
import { registerCatalogRoutes } from './routes/catalog';
import { registerErrorsRoutes } from './routes/errors';
import { registerExoMastRoutes } from './routes/exomast';
import { registerRefreshRoutes } from './routes/refresh';
import { registerStatusRoutes } from './routes/status';

export const DEFAULT_PORT = 8787;

/** Каталог резервных копий по умолчанию (то же значение, что в `.env.example`). */
export const DEFAULT_BACKUP_DIR = 'data/backups';

/** Число хранимых версий по умолчанию (минимум п. 8.2). */
export const DEFAULT_BACKUP_KEEP_VERSIONS = BACKUP_MIN_VERSIONS;

/** Настройки хранилища резервных копий, прочитанные из окружения. */
export interface BackupEnvConfig {
  /** Абсолютный путь к каталогу хранилища. */
  dir: string;
  /** Сколько версий хранить на источник. */
  keepVersions: number;
}

/**
 * Читает настройки хранилища из переменных окружения
 * (`BACKUP_DIR`, `BACKUP_KEEP_VERSIONS` — см. `.env.example`).
 *
 * Относительный `BACKUP_DIR` разрешается от текущего рабочего каталога.
 */
export function readBackupEnv(env: NodeJS.ProcessEnv = process.env): BackupEnvConfig {
  const rawDir = env.BACKUP_DIR?.trim();
  const dir = rawDir && rawDir.length > 0 ? rawDir : DEFAULT_BACKUP_DIR;
  const rawKeep = Number.parseInt(env.BACKUP_KEEP_VERSIONS ?? '', 10);
  const keepVersions =
    Number.isFinite(rawKeep) && rawKeep > 0 ? rawKeep : DEFAULT_BACKUP_KEEP_VERSIONS;
  return { dir: path.resolve(process.cwd(), dir), keepVersions };
}

/** Создаёт хранилище резервных копий по настройкам окружения. */
export function createBackupStoreFromEnv(env: NodeJS.ProcessEnv = process.env): BackupStore {
  const { dir, keepVersions } = readBackupEnv(env);
  return createBackupStore({ dir, keepVersions });
}

export {
  createBackupStore,
  type BackupReadResult,
  type BackupStore,
  type BackupStoreOptions,
  type BackupWriteOptions,
} from './backup/store';
export { BackupValidationError, type BackupErrorReason } from './backup/errors';
export { computeChecksum } from './backup/checksum';

export { SourceFetchError, isSourceFetchError } from './sources/errors';
export { toNum, isFiniteNumber } from './sources/numbers';
export { parseCsv, parseCsvRows } from './sources/csv';
export {
  tapQuery,
  buildTapBody,
  parseTapJson,
  toTapRows,
  getFetchTimeoutMs,
  resolveRetryDelay,
  DEFAULT_FETCH_TIMEOUT_MS,
  DEFAULT_MAXREC,
  DEFAULT_RETRY_DELAYS_MS,
  MAX_RETRY_ATTEMPTS,
  type FetchLike,
  type TapFormat,
  type TapQueryOptions,
  type TapQueryResult,
  type TapResponse,
} from './sources/tap';
export {
  resolveColumns,
  assertRequiredColumns,
  canonicalUnit,
  unitsMatch,
  clearColumnSchemaCache,
  type ColumnCandidateMap,
  type ResolveColumnsOptions,
  type ResolveColumnsResult,
  type ResolvedColumn,
} from './sources/columnResolver';
export {
  buildParams,
  extractNumericId,
  parseAliasList,
  pickColumnName,
  readCell,
  readNumber,
  readRaw,
  readText,
  uniqueNames,
  type AdapterFetchContext,
  type AdapterSourceConfig,
  type CatalogAdapter,
  type FetchRawResult,
  type NormalizeContext,
  type NormalizeResult,
} from './sources/adapter';
export {
  nasaAdapter,
  normalizeNasaRows,
  NASA_CANDIDATES,
  NASA_ENDPOINT,
  NASA_EXPECTED_UNITS,
  NASA_REQUIRED_FIELDS,
  NASA_SOURCE,
  NASA_TABLE,
} from './sources/nasa';
export {
  exoplanetEuAdapter,
  normalizeExoplanetEuRows,
  detectLetter,
  EXOPLANET_EU_CANDIDATES,
  EXOPLANET_EU_ENDPOINT,
  EXOPLANET_EU_EXPECTED_UNITS,
  EXOPLANET_EU_REQUIRED_FIELDS,
  EXOPLANET_EU_SOURCE,
  EXOPLANET_EU_TABLE,
} from './sources/exoplanet_eu';
export {
  exomercatAdapter,
  normalizeExomercatRows,
  EXOMERCAT_CANDIDATES,
  EXOMERCAT_ENDPOINT,
  EXOMERCAT_EXPECTED_UNITS,
  EXOMERCAT_REQUIRED_FIELDS,
  EXOMERCAT_SOURCE,
  EXOMERCAT_TABLE,
} from './sources/exomercat';
export {
  mergeCatalog,
  type MergeCatalogInput,
  type MergeCatalogResult,
} from './merge/mergeCatalog';
export { normalizeName, normalizeLetter, nameKeys, hostKeys } from './merge/normalize';
export { angularSeparationArcsec, findSpatialPairs, relativeDifference } from './merge/spatial';
export { mergeFields } from './merge/fields';
export { slug, uniquePlanetId } from './merge/ids';
export { clusterRecords, type ClusterRecord, type RecordCluster } from './merge/cluster';

export {
  createErrorLog,
  isErrorLogEntry,
  DEFAULT_ERROR_LOG_PATH,
  ERROR_LOG_LOAD_LIMIT,
  ERROR_LOG_MAX_LIMIT,
  ERROR_LOG_MEMORY_LIMIT,
  type ErrorLog,
  type ErrorLogOptions,
} from './pipeline/errorLog';
export {
  buildSnapshot,
  computeSnapshotId,
  createSnapshotCache,
  snapshotHeader,
  toCatalogResponse,
  type BuildSnapshotInput,
  type Snapshot,
  type SnapshotCache,
} from './pipeline/snapshot';
export {
  extractBackupRows,
  loadCatalogSource,
  loadGaiaSource,
  loadSimbadSource,
  toFetchErrorReason,
  type CatalogSourceId,
  type ErrorLogger,
  type GaiaFetcher,
  type LoadedSourceId,
  type LoadedSourceResult,
  type LoadSourceDeps,
  type SimbadFetcher,
  type StarSourceId,
} from './pipeline/loadSource';
export {
  createInitialStatuses,
  runStages,
  type StagesDeps,
  type StagesResult,
} from './pipeline/stages';
export {
  createPipelineState,
  type PipelineState,
  type PipelineStateOptions,
  type SourceStatusPatch,
} from './pipeline/state';
export { registerStatusRoutes } from './routes/status';
export { registerCatalogRoutes } from './routes/catalog';
export { registerRefreshRoutes } from './routes/refresh';
export { registerErrorsRoutes, parseErrorsLimit } from './routes/errors';
export {
  registerExoMastRoutes,
  type ExoMastResponse,
  type ExoMastUnavailableResponse,
} from './routes/exomast';

export interface HealthResponse {
  status: 'ok';
}

/** Настройки сборки приложения (в тестах передаётся готовый конвейер). */
export interface BuildServerOptions {
  /** Готовое состояние конвейера; по умолчанию создаётся из окружения. */
  pipeline?: PipelineState;
}

/**
 * Собирает приложение Fastify без вызова listen — чтобы тесты могли
 * использовать `app.inject()` вместо реального сокета.
 *
 * Сборка каталога здесь не запускается: {@link start} делает это
 * асинхронно после `listen`, чтобы первые запросы не блокировались (10.10).
 */
export function buildServer(options: BuildServerOptions = {}): FastifyInstance {
  const app = Fastify({ logger: false });
  app.register(compress, { threshold: 1024 });

  const pipeline =
    options.pipeline ??
    createPipelineState({
      backup: createBackupStoreFromEnv(),
      errorLog: createErrorLog(),
    });

  // Маршруты регистрируются отдельным плагином после `@fastify/compress`:
  // плагин навешивает `onRoute`-хук, который должен успеть выполниться
  // до объявления маршрутов (иначе ответы не сжимаются).
  app.register(async (instance) => {
    instance.get('/api/health', async (): Promise<HealthResponse> => ({ status: 'ok' }));
    registerStatusRoutes(instance, pipeline);
    registerCatalogRoutes(instance, pipeline);
    registerRefreshRoutes(instance, pipeline);
    registerErrorsRoutes(instance, pipeline);
    registerExoMastRoutes(instance, pipeline);
  });

  return app;
}

/** Поднимает сервер на порту из PORT (по умолчанию 8787). */
export async function start(port: number = readPort()): Promise<FastifyInstance> {
  // Журнал ошибок читается до старта сборки: панель диагностики сразу
  // показывает последние записи (U31).
  const errorLog = createErrorLog();
  await errorLog.load();
  const pipeline = createPipelineState({
    backup: createBackupStoreFromEnv(),
    errorLog,
  });

  const app = buildServer({ pipeline });
  await app.listen({ port, host: '0.0.0.0' });

  // Сборка стартует асинхронно после listen: первые запросы не ждут
  // загрузку источников (п. 10.10).
  pipeline.startRefresh();
  return app;
}

function readPort(): number {
  const raw = process.env.PORT;
  if (!raw) return DEFAULT_PORT;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_PORT;
}

// Автозапуск только при прямом вызове файла (`npm run dev`, `npm start`).
// Импорт модуля из тестов listen не вызывает.
const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(entry).href) {
  start().catch((error: unknown) => {
    console.error('Не удалось запустить сервер:', error);
    process.exitCode = 1;
  });
}
