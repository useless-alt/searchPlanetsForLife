/**
 * Адаптер Exo.MAST (STScI) — ленивые свойства планеты (задача 9, п. 5.1).
 *
 * Источник вызывается только по запросу пользователя (приближение к планете,
 * «Обновить данные планеты») и никогда при старте (п. 10.1.4). Кэш —
 * per-planet: резервная копия лежит по ключу `planetId` (U6).
 *
 * Порядок работы:
 * 1. `GET exoplanets/<имя>/properties/` — массив словарей (по каталогу);
 * 2. если ответ 404 или пустой — `GET exoplanets/identifiers/?name=<имя>`,
 *    берётся `canonicalName`, и шаг 1 повторяется один раз;
 * 3. из массива выбирается словарь `nexsci`, иначе `exoplanets.org`,
 *    иначе первый элемент (порядок элементов не гарантирован);
 * 4. при успехе — запись резервной копии; при сетевой ошибке — чтение
 *    копии (`fromBackup = true`), а копии нет — ошибка наружу.
 *
 * Единицы и ключи Exo.MAST не сверены с документацией архива (U26):
 * они взяты из полей `<ключ>_unit` реального ответа (см. фикстуру
 * `fixtures/exomast-wasp-12b.json`).
 */

import type { ExoMastProps, RawParamKey, SourceId } from '@exo/shared';
import { EXOMAST_FIELD_MAP, extractAtmosphere } from '@exo/shared';

import type { BackupStore } from '../backup/store';

import { SourceFetchError } from './errors';
import { toNum } from './numbers';
import type { FetchLike } from './tap';

export { EXOMAST_FIELD_MAP } from '@exo/shared';
export type { ExoMastFieldSpec } from '@exo/shared';

/** Идентификатор источника. */
export const EXOMAST_SOURCE: SourceId = 'exomast';

/** Базовый адрес API Exo.MAST. */
export const EXOMAST_BASE_URL = 'https://exo.mast.stsci.edu/api/v0.1/';

/** Каталоги Exo.MAST в порядке предпочтения. */
export const EXOMAST_CATALOG_ORDER: readonly string[] = ['nexsci', 'exoplanets.org'];

/**
 * Ошибка отмены запроса (AbortSignal).
 *
 * Это не сбой источника: в журнал ошибок она не попадает (п. 8.2).
 */
export class ExoMastAbortError extends Error {
  constructor(message = 'Запрос Exo.MAST отменён') {
    super(message);
    this.name = 'AbortError';
    Object.setPrototypeOf(this, ExoMastAbortError.prototype);
  }
}

/**
 * Проверяет, что ошибка — отмена запроса, а не сбой источника.
 */
export function isAbortError(value: unknown): value is ExoMastAbortError {
  return value instanceof Error && value.name === 'AbortError';
}

/** Параметры запроса свойств Exo.MAST. */
export interface ExoMastOptions {
  /** Сигнал отмены запроса. */
  signal?: AbortSignal;
  /** Функция запроса (в тестах — мок, в проде — глобальный `fetch`). */
  fetchImpl?: FetchLike;
  /** Хранилище резервных копий (per-planet, ключ — `planetId`). */
  backup?: BackupStore;
  /** Таймаут запроса [мс]; по умолчанию — `FETCH_TIMEOUT_MS` или 30 с. */
  timeoutMs?: number;
  /** Время получения данных (ISO 8601); по умолчанию — текущее. */
  fetchedAt?: string;
}

/** Ответ REST-запроса Exo.MAST. */
interface RestResponse {
  /** HTTP-статус. */
  status: number;
  /** Тело ответа. */
  body: string;
}

/**
 * Общий `fetch` в виде {@link FetchLike}.
 */
function defaultFetchImpl(): FetchLike {
  const globalFetch = (globalThis as { fetch?: unknown }).fetch;
  if (typeof globalFetch !== 'function') {
    throw new SourceFetchError('dns_error', 'В среде нет глобальной функции fetch');
  }
  return globalFetch as FetchLike;
}

/**
 * Приводит сетевую ошибку к `SourceFetchError` с машиночитаемой причиной.
 */
function toNetworkError(error: unknown): SourceFetchError {
  if (error instanceof SourceFetchError) return error;

  const code = getNetworkErrorCode(error);
  const message = error instanceof Error ? error.message : String(error);

  if (code === 'ENOTFOUND' || code === 'ECONNREFUSED' || code === 'EAI_AGAIN') {
    return new SourceFetchError('dns_error', `Сеть недоступна (${code})`, { detail: message });
  }
  if (code === 'ETIMEDOUT' || code === 'UNDERR_ERR_CONNECT_TIMEOUT') {
    return new SourceFetchError('timeout', 'Превышено время ожидания ответа Exo.MAST', {
      detail: message,
    });
  }
  if (error instanceof TypeError) {
    return new SourceFetchError('dns_error', 'Сетевая ошибка запроса Exo.MAST', {
      detail: message,
    });
  }
  return new SourceFetchError('dns_error', 'Запрос Exo.MAST не выполнен', { detail: message });
}

/**
 * Извлекает код сетевой ошибки (`error.code` или `error.cause.code`).
 */
function getNetworkErrorCode(error: unknown): string | null {
  if (error === null || typeof error !== 'object') return null;
  const direct = (error as { code?: unknown }).code;
  if (typeof direct === 'string') return direct;
  const cause = (error as { cause?: unknown }).cause;
  if (cause !== null && typeof cause === 'object') {
    const nested = (cause as { code?: unknown }).code;
    if (typeof nested === 'string') return nested;
  }
  return null;
}

/**
 * Выполняет GET-запрос к Exo.MAST.
 *
 * @throws {ExoMastAbortError} запрос отменён пользователем.
 * @throws {SourceFetchError} сетевая ошибка или превышен таймаут.
 */
async function httpGet(
  url: string,
  options: ExoMastOptions,
  fetchImpl: FetchLike,
): Promise<RestResponse> {
  const timeoutMs = options.timeoutMs ?? 30_000;
  const controller = new AbortController();
  let abortedByUser = false;
  let timedOut = false;

  const onAbort = (): void => {
    abortedByUser = true;
    controller.abort();
  };

  if (options.signal) {
    if (options.signal.aborted) throw new ExoMastAbortError();
    options.signal.addEventListener('abort', onAbort, { once: true });
  }

  const timer =
    timeoutMs > 0
      ? setTimeout(() => {
          timedOut = true;
          controller.abort();
        }, timeoutMs)
      : null;

  try {
    const response = await fetchImpl(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    return { status: response.status, body: await response.text() };
  } catch (error: unknown) {
    if (abortedByUser) throw new ExoMastAbortError();
    if (timedOut) {
      throw new SourceFetchError('timeout', 'Превышено время ожидания ответа Exo.MAST');
    }
    if (isAbortError(error)) throw new ExoMastAbortError();
    throw toNetworkError(error);
  } finally {
    if (timer !== null) clearTimeout(timer);
    options.signal?.removeEventListener('abort', onAbort);
  }
}

/**
 * Разбирает тело ответа Exo.MAST как массив словарей.
 *
 * @throws {SourceFetchError} `invalid_json` — тело не является JSON-массивом.
 */
export function parseExoMastDicts(body: string): Record<string, unknown>[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new SourceFetchError('invalid_json', 'Тело ответа Exo.MAST не является JSON', { detail });
  }
  if (!Array.isArray(parsed)) {
    throw new SourceFetchError('invalid_json', 'Ответ Exo.MAST — не массив словарей');
  }
  const dicts: Record<string, unknown>[] = [];
  for (const item of parsed) {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) {
      throw new SourceFetchError('invalid_json', 'Ответ Exo.MAST содержит не-объект');
    }
    dicts.push(item as Record<string, unknown>);
  }
  return dicts;
}

/**
 * Читает имя каталога словаря Exo.MAST.
 */
export function readExoMastCatalog(dict: Record<string, unknown>): string | null {
  const value = dict['catalog_name'];
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/**
 * Читает каноническое имя планеты из выбранного словаря (задача 28).
 *
 * Сначала `canonical_name`, затем `planet_name`: оба поля реального ответа
 * содержат одно и то же имя, но набор полей у каталогов разный.
 */
export function readExoMastCanonicalName(dict: Record<string, unknown>): string | null {
  for (const key of ['canonical_name', 'planet_name']) {
    const value = dict[key];

    if (typeof value === 'string' && value.trim() !== '') return value.trim();
  }

  return null;
}

/**
 * Разбирает список спектральных файлов (задача 28; U59).
 *
 * Форма ответа не зафиксирована: массив строк либо объект, среди значений
 * которого первый массив строк (`{"filenames": [...]}`). Всё остальное —
 * пустой список. Оставляются только имена `.txt` и `.dat`.
 */
export function parseExoMastFileList(body: string): string[] {
  let parsed: unknown;

  try {
    parsed = JSON.parse(body);
  } catch {
    return [];
  }

  const candidates: unknown[][] = [];

  if (Array.isArray(parsed)) {
    candidates.push(parsed);
  } else if (parsed !== null && typeof parsed === 'object') {
    for (const value of Object.values(parsed)) {
      if (Array.isArray(value)) candidates.push(value);
    }
  }

  let names: string[] | null = null;

  for (const candidate of candidates) {
    if (candidate.every((item) => typeof item === 'string')) {
      names = candidate as string[];
      break;
    }
  }

  if (names === null) return [];

  return names.filter((name) => /\.(txt|dat)$/i.test(name));
}

/** Конверт резервной копии Exo.MAST (задача 28). */
export interface ExoMastBackupPayload {
  /** Массив словарей ответа `properties`. */
  properties: Record<string, unknown>[];
  /** Каноническое имя; null — не сохранялось. */
  canonicalName: string | null;
  /** Список спектров; null — не получен. */
  spectraFiles: string[] | null;
}

/**
 * Читает конверт резервной копии.
 *
 * Старый формат — просто массив словарей (задача 9): он читается, а
 * `canonicalName` и `spectraFiles` остаются null.
 *
 * @returns конверт либо null, если массив словарей не найден.
 */
export function readExoMastBackupPayload(payload: unknown): ExoMastBackupPayload | null {
  const isDict = (item: unknown): item is Record<string, unknown> =>
    item !== null && typeof item === 'object' && !Array.isArray(item);

  if (Array.isArray(payload)) {
    const properties = payload.filter(isDict);
    if (properties.length === 0) return null;
    return { properties, canonicalName: null, spectraFiles: null };
  }

  if (payload === null || typeof payload !== 'object') return null;

  const envelope = payload as Partial<Record<keyof ExoMastBackupPayload, unknown>>;
  if (!Array.isArray(envelope.properties)) return null;

  const properties = envelope.properties.filter(isDict);
  if (properties.length === 0) return null;

  return {
    properties,
    canonicalName:
      typeof envelope.canonicalName === 'string' && envelope.canonicalName.trim() !== ''
        ? envelope.canonicalName.trim()
        : null,
    spectraFiles: Array.isArray(envelope.spectraFiles)
      ? envelope.spectraFiles.filter((item): item is string => typeof item === 'string')
      : null,
  };
}

/**
 * Выбирает словарь ответа Exo.MAST.
 *
 * Приоритет: `nexsci` → `exoplanets.org` → первый элемент массива.
 * Порядок элементов в ответе не гарантирован, поэтому по индексу не идём.
 *
 * @returns выбранный словарь либо `null`, если массив пуст.
 */
export function selectExoMastCatalog(
  dicts: readonly Record<string, unknown>[],
): Record<string, unknown> | null {
  for (const catalog of EXOMAST_CATALOG_ORDER) {
    const found = dicts.find((dict) => readExoMastCatalog(dict) === catalog);
    if (found !== undefined) return found;
  }
  return dicts[0] ?? null;
}

/**
 * Приводит единицу к каноническому виду для сравнения.
 *
 * Пустая единица и «dimensionless» означают одно и то же.
 */
export function normalizeExoMastUnit(unit: unknown): string {
  if (typeof unit !== 'string') return '';
  const trimmed = unit.trim().toLowerCase();
  if (trimmed === '' || trimmed === 'dimensionless') return '';
  return trimmed;
}

/**
 * Проверяет, что единица значения совпадает с ожидаемой.
 */
export function exoMastUnitMatches(actual: unknown, expected: string): boolean {
  return normalizeExoMastUnit(actual) === normalizeExoMastUnit(expected);
}

/**
 * Извлекает параметры из выбранного словаря Exo.MAST.
 *
 * Значение извлекается, только если:
 * - оно конечное число;
 * - поле единицы (`<ключ>_unit`) присутствует и совпадает с ожидаемой.
 *
 * @returns параметры в единицах п. 1.4.
 */
export function extractExoMastParams(
  dict: Record<string, unknown>,
): Partial<Record<RawParamKey, number>> {
  const result: Partial<Record<RawParamKey, number>> = {};
  for (const [logical, spec] of Object.entries(EXOMAST_FIELD_MAP)) {
    const value = toNum(dict[spec.key]);
    if (value === null) continue;
    if (!exoMastUnitMatches(dict[spec.unitKey], spec.unit)) continue;
    const scaled = value * spec.multiplier;
    if (!Number.isFinite(scaled)) continue;
    result[logical as RawParamKey] = scaled;
  }
  return result;
}

/**
 * Адрес свойств планеты.
 */
export function exoMastPropertiesUrl(planetName: string): string {
  return `${EXOMAST_BASE_URL}exoplanets/${encodeURIComponent(planetName)}/properties/`;
}

/**
 * Адрес справочника идентификаторов.
 */
export function exoMastIdentifiersUrl(planetName: string): string {
  return `${EXOMAST_BASE_URL}exoplanets/identifiers/?name=${encodeURIComponent(planetName)}`;
}

/** Адрес списка спектральных файлов (задача 28). */
export function exoMastFileListUrl(planetName: string): string {
  return `${EXOMAST_BASE_URL}spectra/${encodeURIComponent(planetName)}/filelist`;
}

/** Адрес файла спектра (задача 28); завершающая `/` — по API архива. */
export function exoMastFileUrl(planetName: string, file: string): string {
  return `${EXOMAST_BASE_URL}spectra/${encodeURIComponent(planetName)}/file/${encodeURIComponent(file)}/`;
}

/** Промисы незавершённых запросов: параллельные вызовы делят один запрос. */
const inFlight = new Map<string, Promise<ExoMastProps>>();

/**
 * Запрашивает свойства планеты из Exo.MAST.
 *
 * Параллельные вызовы для одной планеты делят один сетевой запрос
 * (ленивый кэш, п. 10.1.4).
 *
 * @param planetId - идентификатор планеты (ключ резервной копии).
 * @param planetName - имя планеты (для запроса и поиска canonicalName).
 * @param options - параметры запроса.
 * @throws {ExoMastAbortError} запрос отменён (сбойом источника не считается).
 * @throws {SourceFetchError} сбой запроса и нет резервной копии.
 */
export function fetchExoMastProps(
  planetId: string,
  planetName: string,
  options: ExoMastOptions = {},
): Promise<ExoMastProps> {
  const existing = inFlight.get(planetId);
  if (existing !== undefined) return existing;

  const promise = (async (): Promise<ExoMastProps> => {
    try {
      return await loadExoMastProps(planetId, planetName, options);
    } finally {
      inFlight.delete(planetId);
    }
  })();

  inFlight.set(planetId, promise);
  return promise;
}

/**
 * Загружает свойства Exo.MAST с резервной копией.
 */
async function loadExoMastProps(
  planetId: string,
  planetName: string,
  options: ExoMastOptions,
): Promise<ExoMastProps> {
  const fetchImpl = options.fetchImpl ?? defaultFetchImpl();
  const fetchedAt = options.fetchedAt ?? new Date().toISOString();

  let result: ExoMastDictsResult;
  try {
    result = await fetchExoMastDicts(planetName, options, fetchImpl);
  } catch (error: unknown) {
    // Отмена — не сбой источника: резервы не читаем, ошибку наружу не роняем.
    if (isAbortError(error)) throw error;

    const restored = await restoreExoMastProps(planetId, options.backup);
    if (restored !== null) return restored;
    throw error;
  }

  const selected = selectExoMastCatalog(result.dicts);
  if (selected === null) {
    throw new SourceFetchError('empty', 'Exo.MAST: ответ без данных планеты');
  }

  const canonicalName = result.canonicalName ?? readExoMastCanonicalName(selected);

  // Список спектров не влияет на свойства: сетевая ошибка или 5xx дают null,
  // а свойства остаются успешными (задача 28, п. 7.3).
  const spectraFiles = await fetchExoMastSpectraFiles(
    canonicalName ?? planetName,
    options,
    fetchImpl,
  );

  if (options.backup) {
    try {
      const payload: ExoMastBackupPayload = {
        properties: result.dicts,
        canonicalName,
        spectraFiles,
      };

      await options.backup.write(EXOMAST_SOURCE, payload, {
        endpoint: result.endpoint,
        recordCount: 1,
        key: planetId,
      });
    } catch (error: unknown) {
      console.warn('[exomast] не удалось записать резервную копию:', error);
    }
  }

  return {
    planetId,
    fetchedAt,
    fromBackup: false,
    catalog: readExoMastCatalog(selected),
    raw: selected,
    extracted: extractExoMastParams(selected),
    canonicalName,
    atmosphere: extractAtmosphere(selected),
    spectraFiles,
  };
}

/** Результат запроса словарей свойств. */
interface ExoMastDictsResult {
  /** Массив словарей ответа. */
  dicts: Record<string, unknown>[];
  /** Адрес успешного запроса. */
  endpoint: string;
  /** Каноническое имя из `identifiers`; null — запасной вариант не нужен. */
  canonicalName: string | null;
}

/**
 * Запрашивает список спектральных файлов (задача 28).
 *
 * 404 и 422 — спектров нет (пустой список); сетевая ошибка, таймаут и 5xx —
 * список не получен (null), но свойства планеты считаются успешными.
 * Отмена запроса пробрасывается: это не сбой источника.
 */
async function fetchExoMastSpectraFiles(
  planetName: string,
  options: ExoMastOptions,
  fetchImpl: FetchLike,
): Promise<string[] | null> {
  try {
    const response = await httpGet(exoMastFileListUrl(planetName), options, fetchImpl);

    if (response.status === 404 || response.status === 422) return [];
    if (response.status < 200 || response.status >= 300) {
      console.warn(`[exomast] список спектров: HTTP ${response.status}`);
      return null;
    }

    return parseExoMastFileList(response.body);
  } catch (error: unknown) {
    if (isAbortError(error)) throw error;

    console.warn('[exomast] список спектров не получен:', error);
    return null;
  }
}

/**
 * Запрашивает свойства планеты; при 404 или пустом ответе один раз
 * повторяет запрос с каноническим именем.
 */
async function fetchExoMastDicts(
  planetName: string,
  options: ExoMastOptions,
  fetchImpl: FetchLike,
): Promise<ExoMastDictsResult> {
  const url = exoMastPropertiesUrl(planetName);
  const response = await httpGet(url, options, fetchImpl);

  if (response.status === 404) {
    return fetchExoMastByCanonicalName(planetName, options, fetchImpl);
  }
  if (response.status < 200 || response.status >= 300) {
    const reason = response.status >= 500 ? 'http_5xx' : 'http_4xx';
    throw new SourceFetchError(reason, `Exo.MAST: HTTP ${response.status}`, {
      status: response.status,
    });
  }

  const dicts = parseExoMastDicts(response.body);
  if (dicts.length === 0) {
    return fetchExoMastByCanonicalName(planetName, options, fetchImpl);
  }
  return { dicts, endpoint: url, canonicalName: null };
}

/**
 * Находит каноническое имя планеты и повторяет запрос свойств.
 */
async function fetchExoMastByCanonicalName(
  planetName: string,
  options: ExoMastOptions,
  fetchImpl: FetchLike,
): Promise<ExoMastDictsResult> {
  const identifiersUrl = exoMastIdentifiersUrl(planetName);
  const response = await httpGet(identifiersUrl, options, fetchImpl);

  if (response.status < 200 || response.status >= 300) {
    const reason = response.status >= 500 ? 'http_5xx' : 'http_4xx';
    throw new SourceFetchError(reason, `Exo.MAST identifiers: HTTP ${response.status}`, {
      status: response.status,
    });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(response.body);
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new SourceFetchError('invalid_json', 'Ответ Exo.MAST identifiers не является JSON', {
      detail,
    });
  }

  const canonicalName =
    parsed !== null && typeof parsed === 'object'
      ? (parsed as { canonicalName?: unknown }).canonicalName
      : undefined;
  if (typeof canonicalName !== 'string' || canonicalName.trim() === '') {
    throw new SourceFetchError('invalid_json', 'В ответе Exo.MAST identifiers нет canonicalName');
  }

  const url = exoMastPropertiesUrl(canonicalName.trim());
  const properties = await httpGet(url, options, fetchImpl);
  if (properties.status < 200 || properties.status >= 300) {
    const reason = properties.status >= 500 ? 'http_5xx' : 'http_4xx';
    throw new SourceFetchError(reason, `Exo.MAST: HTTP ${properties.status}`, {
      status: properties.status,
    });
  }

  const dicts = parseExoMastDicts(properties.body);
  if (dicts.length === 0) {
    throw new SourceFetchError('empty', 'Exo.MAST: ответ без данных планеты');
  }
  return { dicts, endpoint: url, canonicalName: canonicalName.trim() };
}

/**
 * Восстанавливает свойства из резервной копии.
 *
 * @returns свойства с `fromBackup = true` либо `null`, если копии нет.
 */
async function restoreExoMastProps(
  planetId: string,
  backup: BackupStore | undefined,
): Promise<ExoMastProps | null> {
  if (backup === undefined) return null;

  const stored = await backup.read(EXOMAST_SOURCE, planetId);
  if (stored === null) return null;

  const envelope = readExoMastBackupPayload(stored.payload);
  if (envelope === null) return null;

  const selected = selectExoMastCatalog(envelope.properties);
  if (selected === null) return null;

  return {
    planetId,
    fetchedAt: stored.meta.fetched_at,
    fromBackup: true,
    catalog: readExoMastCatalog(selected),
    raw: selected,
    extracted: extractExoMastParams(selected),
    canonicalName: envelope.canonicalName ?? readExoMastCanonicalName(selected),
    atmosphere: extractAtmosphere(selected),
    spectraFiles: envelope.spectraFiles,
  };
}
