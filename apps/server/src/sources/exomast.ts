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
import { MJUP_IN_MEARTH, RJUP_IN_REARTH } from '@exo/shared';

import type { BackupStore } from '../backup/store';

import { SourceFetchError } from './errors';
import { toNum } from './numbers';
import type { FetchLike } from './tap';

/** Идентификатор источника. */
export const EXOMAST_SOURCE: SourceId = 'exomast';

/** Базовый адрес API Exo.MAST. */
export const EXOMAST_BASE_URL = 'https://exo.mast.stsci.edu/api/v0.1/';

/** Каталоги Exo.MAST в порядке предпочтения. */
export const EXOMAST_CATALOG_ORDER: readonly string[] = ['nexsci', 'exoplanets.org'];

/** Описание одного извлекаемого поля Exo.MAST. */
export interface ExoMastFieldSpec {
  /** Ключ значения в ответе Exo.MAST. */
  key: string;
  /** Ключ единицы измерения в ответе (`<key>_unit`). */
  unitKey: string;
  /** Ожидаемая единица измерения (как она записана в ответе). */
  unit: string;
  /** Множитель перевода в единицы проекта (п. 1.4). */
  multiplier: number;
  /** Источник единицы: поле `<key>_unit` того же ответа. */
  unitSource: string;
}

/**
 * Таблица соответствия «логическое поле → ключ + единица + множитель».
 *
 * Источник данных — реальный ответ Exo.MAST
 * (`GET exoplanets/wasp-12b/properties/`, снят 14.11.2026,
 * фикстура `fixtures/exomast-wasp-12b.json`). Единица каждого значения
 * берётся из одноимённого поля `<ключ>_unit` того же ответа; если поля
 * единицы нет или его значение не совпадает с ожидаемым, значение
 * **не извлекается** (жёсткое правило 4).
 *
 * Перечень (ключ → единица → источник единицы → множитель):
 * - `Teff` → `K` → `Teff_unit` → 1 (`st_teff`, К);
 * - `Rs` → `R_sun` → `Rs_unit` → 1 (`st_rad`, R☉);
 * - `Ms` → `M_sun` → `Ms_unit` → 1 (`st_mass`, M☉);
 * - `distance` → `pc` → `distance_unit` → 1 (`sy_dist`, пк);
 * - `Rp` → `R_Jupiter` → `Rp_unit` → 11.209 (`pl_rade`, R⊕);
 * - `Mp` → `M_Jupiter` → `Mp_unit` → 317.83 (`pl_bmasse`, M⊕);
 * - `Tp` → `K` → `Tp_unit` → 1 (`pl_eqt`, К);
 * - `orbital_period` → `d` → `orbital_period_unit` → 1 (`pl_orbper`, сутки);
 * - `orbital_distance` → `AU` → `orbital_distance_unit` → 1 (`pl_orbsmax`, а.е.);
 * - `eccentricity` → безразмерная → `eccentricity_unit` (пусто или null) → 1
 *   (`pl_orbeccen`).
 *
 * Оговорка U26: единицы архива не сверены с его документацией — они
 * прочитаны из ответа. Замена на сверенные значения делается здесь.
 */
export const EXOMAST_FIELD_MAP: Readonly<Record<string, ExoMastFieldSpec>> = {
  st_teff: {
    key: 'Teff',
    unitKey: 'Teff_unit',
    unit: 'K',
    multiplier: 1,
    unitSource: 'Teff_unit',
  },
  st_rad: {
    key: 'Rs',
    unitKey: 'Rs_unit',
    unit: 'R_sun',
    multiplier: 1,
    unitSource: 'Rs_unit',
  },
  st_mass: {
    key: 'Ms',
    unitKey: 'Ms_unit',
    unit: 'M_sun',
    multiplier: 1,
    unitSource: 'Ms_unit',
  },
  sy_dist: {
    key: 'distance',
    unitKey: 'distance_unit',
    unit: 'pc',
    multiplier: 1,
    unitSource: 'distance_unit',
  },
  pl_rade: {
    key: 'Rp',
    unitKey: 'Rp_unit',
    unit: 'R_Jupiter',
    multiplier: RJUP_IN_REARTH,
    unitSource: 'Rp_unit',
  },
  pl_bmasse: {
    key: 'Mp',
    unitKey: 'Mp_unit',
    unit: 'M_Jupiter',
    multiplier: MJUP_IN_MEARTH,
    unitSource: 'Mp_unit',
  },
  pl_eqt: {
    key: 'Tp',
    unitKey: 'Tp_unit',
    unit: 'K',
    multiplier: 1,
    unitSource: 'Tp_unit',
  },
  pl_orbper: {
    key: 'orbital_period',
    unitKey: 'orbital_period_unit',
    unit: 'd',
    multiplier: 1,
    unitSource: 'orbital_period_unit',
  },
  pl_orbsmax: {
    key: 'orbital_distance',
    unitKey: 'orbital_distance_unit',
    unit: 'AU',
    multiplier: 1,
    unitSource: 'orbital_distance_unit',
  },
  pl_orbeccen: {
    key: 'eccentricity',
    unitKey: 'eccentricity_unit',
    unit: '',
    multiplier: 1,
    unitSource: 'eccentricity_unit',
  },
};

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

  let dicts: Record<string, unknown>[];
  let endpoint: string;
  try {
    const result = await fetchExoMastDicts(planetName, options, fetchImpl);
    dicts = result.dicts;
    endpoint = result.endpoint;
  } catch (error: unknown) {
    // Отмена — не сбой источника: резервы не читаем, ошибку наружу не роняем.
    if (isAbortError(error)) throw error;

    const restored = await restoreExoMastProps(planetId, options.backup);
    if (restored !== null) return restored;
    throw error;
  }

  const selected = selectExoMastCatalog(dicts);
  if (selected === null) {
    throw new SourceFetchError('empty', 'Exo.MAST: ответ без данных планеты');
  }

  if (options.backup) {
    try {
      await options.backup.write(EXOMAST_SOURCE, dicts, {
        endpoint,
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
  };
}

/**
 * Запрашивает свойства планеты; при 404 или пустом ответе один раз
 * повторяет запрос с каноническим именем.
 */
async function fetchExoMastDicts(
  planetName: string,
  options: ExoMastOptions,
  fetchImpl: FetchLike,
): Promise<{ dicts: Record<string, unknown>[]; endpoint: string }> {
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
  return { dicts, endpoint: url };
}

/**
 * Находит каноническое имя планеты и повторяет запрос свойств.
 */
async function fetchExoMastByCanonicalName(
  planetName: string,
  options: ExoMastOptions,
  fetchImpl: FetchLike,
): Promise<{ dicts: Record<string, unknown>[]; endpoint: string }> {
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
  return { dicts, endpoint: url };
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

  const payload = stored.payload;
  if (!Array.isArray(payload)) return null;

  const dicts = payload.filter(
    (item): item is Record<string, unknown> =>
      item !== null && typeof item === 'object' && !Array.isArray(item),
  );
  const selected = selectExoMastCatalog(dicts);
  if (selected === null) return null;

  return {
    planetId,
    fetchedAt: stored.meta.fetched_at,
    fromBackup: true,
    catalog: readExoMastCatalog(selected),
    raw: selected,
    extracted: extractExoMastParams(selected),
  };
}
