/**
 * TAP-клиент для каталогов экзопланет (задача 8, п. 5, 8).
 *
 * Транспорт:
 * - HTTP POST, тело `application/x-www-form-urlencoded`;
 * - поля формы: `REQUEST=doQuery`, `LANG=ADQL`, `FORMAT`, `MAXREC`, `QUERY`;
 * - таймаут через `AbortController` (`FETCH_TIMEOUT_MS`, по умолчанию 30 с);
 * - повтор при HTTP 429 и 503 (до 3 попыток, паузы 1 с, 2 с, 4 с либо
 *   `Retry-After`, если он меньше 30 с); для остальных кодов повторов нет;
 * - при HTTP 400 на `FORMAT=json` — один повтор с `FORMAT=application/json`.
 *
 * Разбор ответа: JSON в форме A (массив объектов) и форме B
 * (`{metadata: [{name}], data: [[...]]}`); иначе — ошибка `invalid_json`.
 * Ключи приводятся к нижнему регистру.
 */

import type { SourceId } from '@exo/shared';

import { parseCsvRows } from './csv';
import { SourceFetchError } from './errors';

/** Формат ответа TAP, запрошенный адаптером. */
export type TapFormat = 'json' | 'csv';

/** Инициализатор запроса — подмножество стандартного `RequestInit`. */
export interface TapRequestInit {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  signal?: AbortSignal;
}

/** Ответ TAP — подмножество стандартного `Response`. */
export interface TapResponse {
  status: number;
  headers?: { get(name: string): string | null } | null;
  text(): Promise<string>;
}

/** Функция запроса — подмножество стандартного `fetch`. */
export type FetchLike = (url: string, init?: TapRequestInit) => Promise<TapResponse>;

/** Значение `MAXREC` по умолчанию. */
export const DEFAULT_MAXREC = 1_000_000;

/** Таймаут запроса по умолчанию [мс]. */
export const DEFAULT_FETCH_TIMEOUT_MS = 30_000;

/** Максимальное число попыток при HTTP 429 и 503. */
export const MAX_RETRY_ATTEMPTS = 3;

/** Паузы между попытками [мс]: 1 с, 2 с, 4 с. */
export const DEFAULT_RETRY_DELAYS_MS: readonly number[] = [1000, 2000, 4000];

/** `Retry-After` дольше 30 с игнорируется — используется стандартная пауза. */
export const MAX_RETRY_AFTER_MS = 30_000;

/** Параметры TAP-запроса. */
export interface TapQueryOptions {
  /** Источник (для сообщений об ошибках). */
  source: SourceId;
  /** Адрес TAP-эндпоинта (`.../tap/sync`). */
  endpoint: string;
  /** Текст ADQL-запроса. */
  query: string;
  /** Формат ответа; по умолчанию `json`. */
  format?: TapFormat;
  /** Таймаут [мс]; по умолчанию берётся из `FETCH_TIMEOUT_MS`. */
  timeoutMs?: number;
  /** `MAXREC`; по умолчанию 1 000 000. */
  maxrec?: number;
  /** Функция запроса (в тестах — мок, в проде — глобальный `fetch`). */
  fetchImpl?: FetchLike;
  /** Паузы между попытками [мс] (в тестах — нули). */
  retryDelaysMs?: readonly number[];
  /** Функция ожидания (в тестах — мгновенная). */
  sleep?: (ms: number) => Promise<void>;
}

/** Результат TAP-запроса. */
export interface TapQueryResult {
  /** Строки ответа; ключи столбцов — в нижнем регистре. */
  rows: Record<string, unknown>[];
  /** Эндпоинт, к которому выполнен запрос. */
  endpoint: string;
  /** Текст выполненного ADQL-запроса. */
  query: string;
  /** Фактически использованный формат ответа. */
  format: string;
  /** Предупреждения о подменах формата и повторах. */
  warnings: string[];
}

/**
 * Читает таймаут из окружения (`FETCH_TIMEOUT_MS`), по умолчанию 30 с.
 */
export function getFetchTimeoutMs(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.FETCH_TIMEOUT_MS?.trim();
  if (!raw) return DEFAULT_FETCH_TIMEOUT_MS;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_FETCH_TIMEOUT_MS;
}

/**
 * Собирает тело формы TAP-запроса.
 *
 * @param format - значение поля `FORMAT`.
 * @param maxrec - значение поля `MAXREC`.
 * @param query - текст ADQL-запроса.
 */
export function buildTapBody(format: string, maxrec: number, query: string): string {
  const params = new URLSearchParams();
  params.set('REQUEST', 'doQuery');
  params.set('LANG', 'ADQL');
  params.set('FORMAT', format);
  params.set('MAXREC', String(maxrec));
  params.set('QUERY', query);
  return params.toString();
}

/**
 * Приводит ключи объекта к нижнему регистру (значения не меняются).
 */
function lowerKeys(row: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    result[key.toLowerCase()] = value;
  }
  return result;
}

/**
 * Собирает строки из разобранного JSON-ответа TAP.
 *
 * Поддерживаются две формы:
 * - форма A — массив объектов;
 * - форма B — `{metadata: [{name}], data: [[...]]}`, объекты собираются
 *   по порядку `metadata`.
 *
 * @throws {SourceFetchError} `invalid_json` — иная форма ответа.
 */
export function toTapRows(parsed: unknown): Record<string, unknown>[] {
  if (Array.isArray(parsed)) {
    return parsed.map((item) => {
      if (item === null || typeof item !== 'object' || Array.isArray(item)) {
        throw new SourceFetchError('invalid_json', 'Массив ответа содержит не-объект');
      }
      return lowerKeys(item as Record<string, unknown>);
    });
  }

  if (parsed !== null && typeof parsed === 'object') {
    const body = parsed as Record<string, unknown>;
    const metadata = body.metadata;
    const data = body.data;
    if (Array.isArray(metadata) && Array.isArray(data)) {
      const names = metadata.map((item) => {
        if (item === null || typeof item !== 'object') return null;
        const name = (item as Record<string, unknown>).name;
        return typeof name === 'string' ? name : null;
      });
      if (names.some((name) => name === null)) {
        throw new SourceFetchError('invalid_json', 'В metadata ответа нет имени колонки');
      }
      return data.map((entry) => {
        if (!Array.isArray(entry)) {
          throw new SourceFetchError('invalid_json', 'В data ответа строка не является массивом');
        }
        const row: Record<string, unknown> = {};
        names.forEach((name, index) => {
          row[(name as string).toLowerCase()] = entry[index] ?? null;
        });
        return row;
      });
    }
  }

  throw new SourceFetchError('invalid_json', 'Неизвестный формат ответа TAP');
}

/**
 * Разбирает тело JSON-ответа TAP в строки.
 *
 * @throws {SourceFetchError} `invalid_json` — тело не является JSON
 *   либо имеет неизвестную форму.
 */
export function parseTapJson(text: string): Record<string, unknown>[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new SourceFetchError('invalid_json', 'Тело ответа не является JSON', { detail });
  }
  return toTapRows(parsed);
}

/** Извлекает код сетевой ошибки (`error.code` или `error.cause.code`). */
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
 * Преобразует сетевую ошибку в `SourceFetchError` с машиночитаемой причиной.
 */
function toNetworkError(error: unknown, timedOut: boolean): SourceFetchError {
  if (error instanceof SourceFetchError) return error;

  const code = getNetworkErrorCode(error);
  const message = error instanceof Error ? error.message : String(error);

  if (timedOut) {
    return new SourceFetchError('timeout', 'Превышено время ожидания ответа TAP', {
      detail: message,
    });
  }
  if (code === 'ENOTFOUND' || code === 'ECONNREFUSED' || code === 'EAI_AGAIN') {
    return new SourceFetchError('dns_error', `Сеть недоступна (${code})`, { detail: message });
  }
  if (code === 'ETIMEDOUT' || code === 'UND_ERR_CONNECT_TIMEOUT') {
    return new SourceFetchError('timeout', 'Превышено время ожидания ответа TAP', {
      detail: message,
    });
  }
  if (error instanceof Error && error.name === 'AbortError') {
    return new SourceFetchError('timeout', 'Запрос прерван по таймауту', { detail: message });
  }
  if (error instanceof TypeError) {
    return new SourceFetchError('dns_error', 'Сетевая ошибка запроса TAP', { detail: message });
  }
  return new SourceFetchError('dns_error', 'Запрос TAP не выполнен', { detail: message });
}

/** Стандартная пауза между попытками. */
function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/** Глобальный `fetch` в виде {@link FetchLike}. */
function defaultFetchImpl(): FetchLike {
  const globalFetch = (globalThis as { fetch?: unknown }).fetch;
  if (typeof globalFetch !== 'function') {
    throw new SourceFetchError('dns_error', 'В среде нет глобальной функции fetch');
  }
  return globalFetch as FetchLike;
}

/**
 * Выполняет один HTTP-запрос с таймаутом.
 */
async function request(
  fetchImpl: FetchLike,
  endpoint: string,
  body: string,
  timeoutMs: number,
): Promise<TapResponse> {
  const controller = new AbortController();
  let timedOut = false;
  const timer =
    timeoutMs > 0
      ? setTimeout(() => {
          timedOut = true;
          controller.abort();
        }, timeoutMs)
      : null;

  try {
    return await fetchImpl(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: controller.signal,
    });
  } catch (error: unknown) {
    throw toNetworkError(error, timedOut);
  } finally {
    if (timer !== null) clearTimeout(timer);
  }
}

/**
 * Определяет паузу перед следующей попыткой.
 *
 * `Retry-After` (в секундах) используется, только если он меньше 30 с;
 * иначе берётся стандартная пауза (1 с, 2 с, 4 с).
 */
export function resolveRetryDelay(
  response: TapResponse,
  attempt: number,
  delays: readonly number[],
): number {
  const header = response.headers?.get?.('retry-after');
  if (header) {
    const seconds = Number.parseInt(header.trim(), 10);
    if (Number.isFinite(seconds) && seconds >= 0) {
      const ms = seconds * 1000;
      if (ms < MAX_RETRY_AFTER_MS) return ms;
    }
  }
  if (delays.length === 0) return 0;
  return delays[Math.min(attempt, delays.length - 1)] as number;
}

/**
 * Выполняет TAP-запрос и возвращает разобранные строки.
 *
 * Повторы: HTTP 429 и 503 — до {@link MAX_RETRY_ATTEMPTS} попыток;
 * HTTP 400 при `FORMAT=json` — один повтор с `FORMAT=application/json`.
 *
 * @throws {SourceFetchError} `timeout`, `dns_error`, `http_4xx`, `http_5xx`,
 *   `invalid_json`, `empty`.
 */
export async function tapQuery(options: TapQueryOptions): Promise<TapQueryResult> {
  const { source, endpoint, query } = options;
  const requestedFormat = options.format ?? 'json';
  const maxrec = options.maxrec ?? DEFAULT_MAXREC;
  const timeoutMs = options.timeoutMs ?? getFetchTimeoutMs();
  const delays = options.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS;
  const sleep = options.sleep ?? defaultSleep;
  const warnings: string[] = [];

  const fetchImpl = options.fetchImpl ?? defaultFetchImpl();

  let format: string = requestedFormat;
  let formatFallbackUsed = false;
  let attempt = 0;

  for (;;) {
    const body = buildTapBody(format, maxrec, query);
    const response = await request(fetchImpl, endpoint, body, timeoutMs);
    const status = response.status;

    if (status === 400 && !formatFallbackUsed && requestedFormat !== 'csv') {
      formatFallbackUsed = true;
      format = 'application/json';
      warnings.push(
        `FORMAT=${requestedFormat} отклонён сервером (HTTP 400) — повтор с FORMAT=application/json`,
      );
      attempt = 0;
      continue;
    }

    if ((status === 429 || status === 503) && attempt + 1 < MAX_RETRY_ATTEMPTS) {
      const delay = resolveRetryDelay(response, attempt, delays);
      attempt += 1;
      await sleep(delay);
      continue;
    }

    if (status < 200 || status >= 300) {
      const reason = status >= 500 ? 'http_5xx' : 'http_4xx';
      throw new SourceFetchError(reason, `TAP ${source}: HTTP ${status}`, { status });
    }

    const text = await response.text();
    const rows = format === 'csv' ? parseCsvRows(text) : parseTapJson(text);
    if (rows.length === 0) {
      throw new SourceFetchError('empty', `TAP ${source}: ответ без строк`);
    }

    return { rows, endpoint, query, format, warnings };
  }
}
