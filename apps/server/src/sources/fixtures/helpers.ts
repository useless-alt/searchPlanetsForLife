/**
 * Помощники тестов адаптеров каталогов (задача 8).
 *
 * В тестах сети нет: все запросы выполняет мок `fetchImpl`
 * (требование приёмки: в `apps/server` нет сетевых вызовов в тестах).
 */

import type { FetchLike, TapResponse } from '../tap';

/** Описание мок-ответа TAP. */
export interface MockResponseInit {
  /** HTTP-статус; по умолчанию 200. */
  status?: number;
  /** Тело ответа. */
  body?: string;
  /** Заголовки ответа. */
  headers?: Record<string, string>;
}

/** Разобранное тело формы TAP-запроса. */
export interface RecordedCall {
  /** Адрес эндпоинта. */
  url: string;
  /** Тело запроса (urlencoded). */
  body: string;
  /** Значение поля `QUERY`. */
  query: string;
  /** Значение поля `FORMAT`. */
  format: string;
  /** Значение поля `MAXREC`. */
  maxrec: string;
  /** Значение поля `REQUEST`. */
  request: string;
  /** Значение поля `LANG`. */
  lang: string;
}

/** Собирает мок-ответ TAP. */
export function mockResponse(init: MockResponseInit = {}): TapResponse {
  const status = init.status ?? 200;
  const headers = new Map<string, string>();
  for (const [key, value] of Object.entries(init.headers ?? {})) {
    headers.set(key.toLowerCase(), value);
  }
  return {
    status,
    headers: { get: (name: string) => headers.get(name.toLowerCase()) ?? null },
    text: async () => init.body ?? '',
  };
}

/** Разбирает urlencoded-тело TAP-запроса. */
export function parseTapForm(body: string): Record<string, string> {
  const params = new URLSearchParams(body);
  const result: Record<string, string> = {};
  params.forEach((value, key) => {
    result[key] = value;
  });
  return result;
}

/** Ответ со схемой TAP (`column_name`, `unit`) в форме A. */
export function schemaResponse(
  columns: ReadonlyArray<{ name: string; unit?: string | null }>,
): MockResponseInit {
  return {
    status: 200,
    body: JSON.stringify(
      columns.map((column) => ({ column_name: column.name, unit: column.unit ?? null })),
    ),
  };
}

/** Мок последовательности ответов (или сетевых ошибок). */
export function createSequenceFetch(responses: ReadonlyArray<MockResponseInit | Error>): {
  fetchImpl: FetchLike;
  calls: RecordedCall[];
} {
  const calls: RecordedCall[] = [];
  let index = 0;

  const fetchImpl: FetchLike = async (url, init) => {
    const body = init?.body ?? '';
    const form = parseTapForm(body);
    calls.push({
      url,
      body,
      query: form.QUERY ?? '',
      format: form.FORMAT ?? '',
      maxrec: form.MAXREC ?? '',
      request: form.REQUEST ?? '',
      lang: form.LANG ?? '',
    });

    const next = responses[Math.min(index, responses.length - 1)];
    index += 1;
    if (next === undefined) throw new Error('Мок: ответов не осталось');
    if (next instanceof Error) throw next;
    return mockResponse(next);
  };

  return { fetchImpl, calls };
}

/** Настройки мока для адаптера: схема и строки данных. */
export interface AdapterFetchOptions {
  /** Ответ на запрос схемы TAP (или ошибка сети). */
  schema?: MockResponseInit | Error;
  /** Строки ответа на основной запрос (форма A). */
  rows?: ReadonlyArray<Record<string, unknown>>;
  /** Ответ на основной запрос (или ошибка сети) — важнее `rows`. */
  data?: MockResponseInit | Error;
}

/**
 * Мок запросов с раздельным ответом на запрос схемы TAP.
 *
 * Запрос `TAP_SCHEMA.columns` получает один общий ответ, остальные
 * запросы (партии данных) — ответы по очереди.
 */
export function createSchemaAwareFetch(options: {
  /** Ответ на запрос схемы TAP (или ошибка сети). */
  schema?: MockResponseInit | Error;
  /** Ответы на запросы данных по очереди. */
  data: ReadonlyArray<MockResponseInit | Error>;
}): {
  fetchImpl: FetchLike;
  calls: RecordedCall[];
} {
  const schema = options.schema ?? schemaResponse([]);
  const calls: RecordedCall[] = [];
  let index = 0;

  const fetchImpl: FetchLike = async (url, init) => {
    const body = init?.body ?? '';
    const form = parseTapForm(body);
    const query = form.QUERY ?? '';
    calls.push({
      url,
      body,
      query,
      format: form.FORMAT ?? '',
      maxrec: form.MAXREC ?? '',
      request: form.REQUEST ?? '',
      lang: form.LANG ?? '',
    });

    if (query.includes('TAP_SCHEMA.columns')) {
      if (schema instanceof Error) throw schema;
      return mockResponse(schema);
    }

    const next = options.data[Math.min(index, options.data.length - 1)];
    index += 1;
    if (next === undefined) throw new Error('Мок: ответов не осталось');
    if (next instanceof Error) throw next;
    return mockResponse(next);
  };

  return { fetchImpl, calls };
}

/**
 * Ответы на запросы данных (без запросов схемы).
 */
export function dataCalls(calls: readonly RecordedCall[]): RecordedCall[] {
  return calls.filter((call) => !call.query.includes('TAP_SCHEMA.columns'));
}

/**
 * Мок запросов адаптера: на запрос схемы отвечает списком колонок,
 * на основной запрос — строками каталога.
 */
export function createAdapterFetch(options: AdapterFetchOptions = {}): {
  fetchImpl: FetchLike;
  calls: RecordedCall[];
} {
  const schema = options.schema ?? schemaResponse([]);
  const data = options.data ?? { status: 200, body: JSON.stringify(options.rows ?? []) };
  const calls: RecordedCall[] = [];

  const fetchImpl: FetchLike = async (url, init) => {
    const body = init?.body ?? '';
    const form = parseTapForm(body);
    const query = form.QUERY ?? '';
    calls.push({
      url,
      body,
      query,
      format: form.FORMAT ?? '',
      maxrec: form.MAXREC ?? '',
      request: form.REQUEST ?? '',
      lang: form.LANG ?? '',
    });

    const response = query.includes('TAP_SCHEMA.columns') ? schema : data;
    if (response instanceof Error) throw response;
    return mockResponse(response);
  };

  return { fetchImpl, calls };
}

/** Мок, который всегда отклоняется сетевой ошибкой с заданным кодом. */
export function createFailingFetch(code: string): FetchLike {
  return async () => {
    const error = new Error(`Сетевая ошибка ${code}`) as Error & { code?: string };
    error.code = code;
    throw error;
  };
}

/** Мок, который висит до отмены по таймауту. */
export function createHangingFetch(): FetchLike {
  return (_url, init) =>
    new Promise<TapResponse>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        const error = new Error('Операция прервана по таймауту');
        error.name = 'AbortError';
        reject(error);
      });
    });
}

/** Функция ожидания без задержки (для тестов повторов). */
export async function instantSleep(): Promise<void> {
  return Promise.resolve();
}

/**
 * Собирает описание схемы TAP по списку кандидатов колонок.
 *
 * @param candidates - кандидаты столбцов адаптера.
 * @param units - единицы измерения по именам колонок.
 */
export function schemaFrom(
  candidates: Readonly<Record<string, readonly string[]>>,
  units: Readonly<Record<string, string | null>> = {},
): Array<{ name: string; unit: string | null }> {
  const seen = new Set<string>();
  const result: Array<{ name: string; unit: string | null }> = [];
  for (const names of Object.values(candidates)) {
    for (const name of names) {
      if (seen.has(name)) continue;
      seen.add(name);
      result.push({ name, unit: units[name] ?? null });
    }
  }
  return result;
}
