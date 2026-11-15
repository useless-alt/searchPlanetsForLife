/**
 * Поддельные источники данных для тестового режима (задача 31, п. 1).
 *
 * В режиме `EXO_TEST_MODE=1` сервер не обращается к внешним API: адаптеры
 * NASA / Exoplanet.eu / Exo-MerCat заменяются реализациями этого модуля,
 * Gaia и SIMBAD отвечают детерминированно, а Exo.MAST — по сценарию
 * `EXO_FAKE_EXOMAST`.
 *
 * Каждый поддельный адаптер соблюдает настоящий контракт `CatalogAdapter`:
 * `fetchRaw` возвращает строки, `normalize` превращает их в `SourceRecord`.
 * Поэтому резервные копии, слияние, расчёт и REST-маршруты проверяются на
 * том же коде, что и в продакшене, — подменён только транспорт.
 */

import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import type { SourceId, SourceRecord, StarRecord } from '@exo/shared';

import { createBackupStore, type BackupStore } from '../backup/store';
import { createErrorLog } from '../pipeline/errorLog';
import { createPipelineState, type PipelineState } from '../pipeline/state';
import type {
  CatalogAdapter,
  FetchRawResult,
  NormalizeContext,
  NormalizeResult,
} from '../sources/adapter';
import { SourceFetchError } from '../sources/errors';
import type { GaiaFetchOptions, GaiaStarsResult } from '../sources/gaia';
import type { SimbadFetchOptions, SimbadStarsResult } from '../sources/simbad';
import type { FetchLike, TapResponse } from '../sources/tap';
import {
  buildDatasetRows,
  buildFakeGaiaStars,
  buildFakeSimbadStars,
  type DatasetSourceId,
} from './dataset';
import {
  buildExoMastProperties,
  delay,
  failureFor,
  parseExoMastMode,
  parseFailureSpec,
  parsePreseedBackups,
  preseedBackups,
  type ExoMastMode,
  type FailureMap,
} from './failureInjection';

/** Базовый адрес поддельного TAP-эндпоинта. */
export const FAKE_ENDPOINT_PREFIX = 'fake://';

/** Обязательные поля поддельных строк: без имени планеты запись бесполезна. */
export const FAKE_REQUIRED_FIELDS: readonly string[] = ['planetName'];

/** Время получения данных поддельных источников. */
export const FAKE_FETCHED_AT = '2026-11-14T08:00:00.000Z';

/** Проверяет, что значение — обычный объект. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Приводит строку источника к `SourceRecord`. */
function toSourceRecord(
  value: unknown,
  source: SourceId,
  ctx: NormalizeContext,
): SourceRecord | null {
  if (!isRecord(value)) return null;

  const planetName = typeof value['planetName'] === 'string' ? value['planetName'].trim() : '';

  if (planetName === '') return null;

  const params = isRecord(value['params']) ? value['params'] : {};
  const numeric: SourceRecord['params'] = {};

  for (const [key, raw] of Object.entries(params)) {
    if (typeof raw === 'number' && Number.isFinite(raw)) {
      numeric[key as keyof SourceRecord['params']] = raw;
    }
  }

  const extra = isRecord(value['extra']) ? value['extra'] : {};
  const aliases = Array.isArray(value['aliases'])
    ? value['aliases'].filter((item): item is string => typeof item === 'string')
    : [];
  const hostAliases = Array.isArray(value['hostAliases'])
    ? value['hostAliases'].filter((item): item is string => typeof item === 'string')
    : [];

  return {
    source,
    fetchedAt: ctx.fetchedAt,
    fromBackup: ctx.fromBackup,
    planetName,
    aliases,
    hostname: typeof value['hostname'] === 'string' ? value['hostname'] : null,
    letter: typeof value['letter'] === 'string' ? value['letter'] : null,
    hostAliases,
    ra: typeof value['ra'] === 'number' && Number.isFinite(value['ra']) ? value['ra'] : null,
    dec: typeof value['dec'] === 'number' && Number.isFinite(value['dec']) ? value['dec'] : null,
    params: numeric,
    extra: {
      ...(typeof extra['gaiaDr3Id'] === 'string' ? { gaiaDr3Id: extra['gaiaDr3Id'] } : {}),
      ...(typeof extra['gaiaDr2Id'] === 'string' ? { gaiaDr2Id: extra['gaiaDr2Id'] } : {}),
      ...(typeof extra['status'] === 'string' ? { status: extra['status'] } : {}),
      ...(typeof extra['mainId'] === 'string' ? { mainId: extra['mainId'] } : {}),
    },
  };
}

/** Поддельный адаптер каталога. */
export function createFakeAdapter(source: DatasetSourceId, failures: FailureMap): CatalogAdapter {
  return {
    id: source,
    requiredFields: [...FAKE_REQUIRED_FIELDS],

    async fetchRaw(): Promise<FetchRawResult> {
      const failure = failureFor(failures, source);

      if (failure !== null) {
        // `http_500` и `http_404` — настоящие ошибки транспорта; остальные
        // причины тоже бросаются, чтобы сработал путь «резерв или пропуск».
        throw new SourceFetchError(failure.reason, `Поддельный сбой ${source}: ${failure.token}`, {
          status: failure.status,
        });
      }

      const rows: Record<string, unknown>[] = buildDatasetRows(source).map(
        (record) => record as unknown as Record<string, unknown>,
      );

      return {
        rows,
        endpoint: `${FAKE_ENDPOINT_PREFIX}${source}`,
        query: `SELECT * FROM fake.${source}`,
        warnings: [],
      };
    },

    normalize(rows: Record<string, unknown>[], ctx: NormalizeContext): NormalizeResult {
      const records: SourceRecord[] = [];
      let skippedRows = 0;

      for (const row of rows) {
        const record = toSourceRecord(row, source, ctx);

        if (record === null) skippedRows += 1;
        else records.push(record);
      }

      return { records, skippedRows };
    },
  };
}

/** Все три поддельных адаптера каталога. */
export function createFakeAdapters(failures: FailureMap): Record<DatasetSourceId, CatalogAdapter> {
  return {
    nasa: createFakeAdapter('nasa', failures),
    exoplanet_eu: createFakeAdapter('exoplanet_eu', failures),
    exomercat: createFakeAdapter('exomercat', failures),
  };
}

/** Поддельный Gaia: одна звезда на каждый запрошенный идентификатор. */
export async function fetchFakeGaia(
  ids: readonly string[],
  options: GaiaFetchOptions,
  failures: FailureMap,
): Promise<GaiaStarsResult> {
  const failure = failureFor(failures, 'gaia');

  if (failure !== null) {
    throw new SourceFetchError(failure.reason, `Поддельный сбой gaia: ${failure.token}`, {
      status: failure.status,
    });
  }

  const stars = buildFakeGaiaStars(ids, options.fetchedAt ?? FAKE_FETCHED_AT);
  const found = new Set(stars.map((star) => star.key.gaiaDr3Id ?? ''));
  const unresolved = ids.filter((id) => !found.has(id));

  return { stars, unresolved };
}

/** Поддельный SIMBAD: успешный пустой ответ. */
export async function fetchFakeSimbad(
  names: readonly string[],
  _options: SimbadFetchOptions,
  failures: FailureMap,
): Promise<SimbadStarsResult> {
  const failure = failureFor(failures, 'simbad');

  if (failure !== null) {
    throw new SourceFetchError(failure.reason, `Поддельный сбой simbad: ${failure.token}`, {
      status: failure.status,
    });
  }

  return { stars: buildFakeSimbadStars(), unresolved: [...names] };
}

/** Поддельный `fetch` для Exo.MAST со счётчиком запросов. */
export interface FakeExoMastFetch extends FetchLike {
  /** Сколько HTTP-запросов сделано (нужно для проверки «при старте — 0»). */
  requests(): number;
}

/** Имя планеты из URL Exo.MAST. */
function planetNameFromUrl(url: string): string {
  const match = /\/exoplanets\/([^/]+)\//.exec(url);

  if (match === null) return 'Объект';

  try {
    return decodeURIComponent(match[1] as string);
  } catch {
    return match[1] as string;
  }
}

/**
 * Создаёт поддельный транспорт Exo.MAST.
 *
 * `ok` — валидный ответ, `fail` — сетевая ошибка (маршрут отдаёт 502),
 * `backup` — ошибка при наличии заранее положенной копии, `slow:<мс>` —
 * задержка перед успешным ответом.
 */
export function createFakeExoMastFetch(mode: ExoMastMode): FakeExoMastFetch {
  let count = 0;

  const fetchImpl = async (url: string): Promise<TapResponse> => {
    count += 1;

    if (mode.kind === 'slow') await delay(mode.delayMs);

    if (mode.kind === 'fail' || mode.kind === 'backup') {
      throw new Error('Поддельный сбой Exo.MAST: сеть недоступна');
    }

    const name = planetNameFromUrl(url);

    if (url.includes('/filelist')) {
      return { status: 200, text: async () => '[]' };
    }

    if (url.includes('/identifiers/')) {
      return {
        status: 200,
        text: async () => JSON.stringify([{ canonical_name: name, nexsci: name }]),
      };
    }

    return {
      status: 200,
      text: async () => JSON.stringify([buildExoMastProperties(name)]),
    };
  };

  return Object.assign(fetchImpl, {
    requests(): number {
      return count;
    },
  });
}

/** Результат создания тестового конвейера. */
export interface TestPipeline {
  /** Готовое состояние конвейера с поддельными источниками. */
  pipeline: PipelineState;
  /** Каталог резервных копий (временный в e2e, задаётся `BACKUP_DIR`). */
  backupDir: string;
  /** Хранилище копий — для предзаписи в тестах. */
  backup: BackupStore;
  /** Поддельный транспорт Exo.MAST со счётчиком запросов. */
  exomast: FakeExoMastFetch;
}

/** Настройки тестового конвейера. */
export interface TestPipelineOptions {
  /** Переменные окружения (`EXO_FAIL`, `EXO_FAKE_EXOMAST`, `BACKUP_DIR`). */
  env?: NodeJS.ProcessEnv;
  /** Явный каталог копий; перекрывает `BACKUP_DIR`. */
  backupDir?: string;
  /** Время сборки; по умолчанию фиксировано для воспроизводимости. */
  now?: () => Date;
}

/** Время по умолчанию для всех сборок тестового режима. */
export const TEST_NOW = new Date('2026-11-14T09:00:00.000Z');

/**
 * Создаёт конвейер с поддельными источниками и, при необходимости,
 * предзаписывает резервные копии.
 *
 * Порядок важен: копии должны лежать на диске до первой сборки, иначе
 * сбой без резерва превратится в `error_no_backup`.
 */
export async function createTestPipeline(options: TestPipelineOptions = {}): Promise<TestPipeline> {
  const env = options.env ?? process.env;
  const backupDir =
    options.backupDir ?? path.resolve(process.cwd(), env.BACKUP_DIR?.trim() || '.tmp/e2e-backups');

  await mkdir(backupDir, { recursive: true });

  const backup = createBackupStore({ dir: backupDir, keepVersions: 5 });
  const preseed = parsePreseedBackups(env.EXO_PRESEED_BACKUPS);

  // При сценарии `backup` копия Exo.MAST обязана существовать: иначе
  // маршрут вернёт 502, а не данные из резерва.
  const exomastMode = parseExoMastMode(env.EXO_FAKE_EXOMAST);

  if (exomastMode.kind === 'backup' && !preseed.includes('exomast')) {
    await preseedBackups(backup, ['exomast']);
  }

  if (preseed.length > 0) await preseedBackups(backup, preseed);

  const errorLog = createErrorLog({ filePath: path.join(backupDir, 'error-log.jsonl') });
  await errorLog.load();

  const failures = parseFailureSpec(env.EXO_FAIL);
  const exomast = createFakeExoMastFetch(exomastMode);
  const now = options.now ?? (() => new Date(TEST_NOW));

  const pipeline = createPipelineState({
    backup,
    errorLog,
    adapters: createFakeAdapters(failures),
    fetchGaia: (ids, fetchOptions) => fetchFakeGaia(ids, fetchOptions, failures),
    fetchSimbad: (names, fetchOptions) => fetchFakeSimbad(names, fetchOptions, failures),
    fetchImpl: exomast,
    timeoutMs: 5000,
    now,
  });

  return { pipeline, backupDir, backup, exomast };
}

/** Признак тестового режима сервера. */
export function isTestMode(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.EXO_TEST_MODE === '1';
}

/** Записи звёздного источника для предзаписи в тестах. */
export interface StarBackupPayload {
  /** Записи звёзд. */
  records: StarRecord[];
  /** Значения, которые источник не разрешил. */
  unresolved: string[];
}
