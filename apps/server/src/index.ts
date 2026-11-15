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

import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import compress from '@fastify/compress';
import Fastify, { type FastifyInstance } from 'fastify';

import { BACKUP_MIN_VERSIONS } from '@exo/shared';

import { createBackupStore, type BackupStore } from './backup/store';
import { loadEnvFiles } from './env';
import { createErrorLog } from './pipeline/errorLog';
import { loadSeedSnapshot } from './pipeline/seed';
import { createPipelineState, type PipelineState } from './pipeline/state';
import { createTestPipeline, isTestMode } from './testing/fakeSources';
import { registerCatalogRoutes } from './routes/catalog';
import { registerErrorsRoutes } from './routes/errors';
import { registerExoMastRoutes } from './routes/exomast';
import { registerRefreshRoutes } from './routes/refresh';
import { registerSpectraRoutes } from './routes/spectra';
import { registerStatusRoutes } from './routes/status';
import { registerWebApp } from './static';

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
export {
  registerSpectraRoutes,
  type SpectrumResponse,
  type SpectrumUnavailableResponse,
} from './routes/spectra';
export {
  fetchSpectrumMeta,
  SpectrumMetaCache,
  spectrumMetaCache,
  SPECTRUM_CACHE_LIMIT,
  SPECTRUM_MAX_BYTES,
  type SpectrumFetchOptions,
} from './sources/exomastSpectra';
export {
  parseExoMastFileList,
  readExoMastBackupPayload,
  readExoMastCanonicalName,
  type ExoMastBackupPayload,
} from './sources/exomast';

export interface HealthResponse {
  status: 'ok';
}

/** Настройки сборки приложения (в тестах передаётся готовый конвейер). */
export interface BuildServerOptions {
  /** Готовое состояние конвейера; по умолчанию создаётся из окружения. */
  pipeline?: PipelineState;
  /**
   * Каталог собранного веб-приложения; `null` — не раздавать статику.
   * По умолчанию — `apps/web/dist` (или `WEB_DIST`).
   */
  webRoot?: string | null;
}

/**
 * Каталог сборки веб-приложения.
 *
 * `apps/web/dist` лежит рядом с `apps/server`, поэтому путь одинаков для
 * исходников (`src/index.ts`) и для собранного сервера (`dist/index.js`).
 * Переопределяется переменной `WEB_DIST`.
 *
 * @returns абсолютный путь либо `null`, если сборки нет.
 */
export function resolveWebRoot(env: NodeJS.ProcessEnv = process.env): string | null {
  const explicit = env.WEB_DIST?.trim();
  const root =
    explicit && explicit.length > 0
      ? path.resolve(process.cwd(), explicit)
      : fileURLToPath(new URL('../../web/dist/', import.meta.url));
  return existsSync(path.join(root, 'index.html')) ? root : null;
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
    registerSpectraRoutes(instance, pipeline);
  });

  const webRoot = options.webRoot === undefined ? resolveWebRoot() : options.webRoot;
  if (webRoot !== null) {
    registerWebApp(app, { root: webRoot });
  }

  return app;
}

/** Настройки запуска сервера. */
export interface StartOptions {
  /** Читать стартовый снимок с диска (по умолчанию — да). */
  seed?: boolean;
  /**
   * Запускать обновление сразу после `listen`.
   *
   * По умолчанию — только если стартового снимка нет: при наличии данных
   * сеть не нужна, а обновление запускается кнопкой, `npm run refresh`
   * или `EXO_AUTO_REFRESH=1`.
   */
  autoRefresh?: boolean;
}

/**
 * Файлы, из которых сервер пытается поднять каталог без сети, в порядке
 * приоритета: явный `EXO_SNAPSHOT`, слитый снимок `npm run refresh`,
 * демонстрационный снимок из репозитория.
 */
export function seedCandidates(env: NodeJS.ProcessEnv = process.env): string[] {
  const { dir } = readBackupEnv(env);
  const explicit = env.EXO_SNAPSHOT?.trim();
  const demo = fileURLToPath(new URL('../../../data/demo/catalog.json.gz', import.meta.url));
  const candidates: Array<string | null> = [
    explicit && explicit.length > 0 ? path.resolve(process.cwd(), explicit) : null,
    path.join(dir, 'merged', 'latest.json'),
    demo,
  ];
  return candidates.filter((candidate): candidate is string => candidate !== null);
}

/** Нужно ли автоматическое обновление после старта (`EXO_AUTO_REFRESH`). */
function readAutoRefresh(hasSeed: boolean, env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = env.EXO_AUTO_REFRESH?.trim().toLowerCase();
  if (raw === '1' || raw === 'true' || raw === 'yes') return true;
  if (raw === '0' || raw === 'false' || raw === 'no') return false;
  return !hasSeed;
}

/** Поднимает сервер на порту из PORT (по умолчанию 8787). */
export async function start(port?: number, options: StartOptions = {}): Promise<FastifyInstance> {
  // `.env` / `.env.local` (п. 1.3): переменные процесса имеют приоритет.
  // Читаем до readPort(): PORT из .env тоже должен работать.
  loadEnvFiles();
  const listenPort = port ?? readPort();

  // Журнал ошибок читается до старта сборки: панель диагностики сразу
  // показывает последние записи (U31).
  const errorLog = createErrorLog();
  await errorLog.load();

  // --- 31 ---
  // Тестовый режим: транспорт источников заменён подделками, стартовый
  // снимок не читается, а резервные копии при необходимости кладутся до
  // первой сборки. Внешняя сеть не используется.
  if (isTestMode()) {
    const test = await createTestPipeline({ env: process.env });
    const testApp = buildServer({ pipeline: test.pipeline });
    await testApp.listen({ port: listenPort, host: '0.0.0.0' });

    console.log(
      `[start] тестовый режим: поддельные источники, копии в ${path.relative(
        process.cwd(),
        test.backupDir,
      )}`,
    );
    test.pipeline.startRefresh();

    return testApp;
  }
  // --- /31 ---

  const seed = options.seed === false ? null : await loadSeedSnapshot(seedCandidates(process.env));
  if (seed !== null) {
    console.log(
      `[start] стартовый снимок: ${path.relative(process.cwd(), seed.filePath)} ` +
        `(планет ${seed.snapshot.planetCount}, собран ${seed.snapshot.builtAt})`,
    );
  }

  const pipeline = createPipelineState({
    backup: createBackupStoreFromEnv(),
    errorLog,
    initialSnapshot: seed?.snapshot,
  });

  const app = buildServer({ pipeline });
  await app.listen({ port: listenPort, host: '0.0.0.0' });

  // Сборка стартует асинхронно после listen: первые запросы не ждут
  // загрузку источников (п. 10.10).
  if (options.autoRefresh ?? readAutoRefresh(seed !== null)) {
    pipeline.startRefresh();
  } else {
    console.log('[start] автообновление выключено: данные уже есть (EXO_AUTO_REFRESH=1 включит)');
  }

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
