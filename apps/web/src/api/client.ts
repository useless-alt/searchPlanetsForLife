import type { CatalogResponse, ErrorLogEntry, StatusResponse } from '@exo/shared';

/**
 * REST-клиент сервера каталога (задача 12, п. 10.1, 10.10).
 *
 * При старте страница опрашивает `/api/status`, затем один раз получает
 * `/api/catalog`. Повторные запросы каталога идут с `If-None-Match`, чтобы
 * неизменившийся снимок не скачивался и не пересчитывался (10.10.5).
 */

/** Число записей журнала ошибок по умолчанию (п. 8.2). */
export const ERROR_LOG_LIMIT = 200;

/** Ошибка HTTP-запроса с кодом ответа. */
export class ApiError extends Error {
  /** HTTP-статус ответа. */
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/** Результат загрузки каталога: новый снимок или 304 Not Modified. */
export type CatalogResult =
  { notModified: true } | { notModified: false; catalog: CatalogResponse };

/** Клиент REST API каталога. */
export interface ApiClient {
  /** `GET /api/status` — фаза загрузки и статусы источников. */
  getStatus(): Promise<StatusResponse>;
  /**
   * `GET /api/catalog` — снимок каталога.
   *
   * @param snapshotId ETag предыдущего снимка; при совпадении сервер отвечает 304.
   */
  getCatalog(snapshotId?: string | null): Promise<CatalogResult>;
  /**
   * `POST /api/refresh` — запуск полного обновления.
   *
   * `in_progress` — сервер уже собирает каталог (409), это не ошибка.
   */
  refresh(): Promise<'started' | 'in_progress'>;
  /**
   * `GET /api/errors?limit=N` — журнал ошибок источников (п. 8.2).
   *
   * @param limit Число последних записей; по умолчанию 200.
   */
  getErrors(limit?: number): Promise<ErrorLogEntry[]>;
}

/** Параметры клиента (в тестах — подменённый fetch и адрес). */
export interface ApiClientOptions {
  /** База API; по умолчанию `/api` (dev-прокси Vite). */
  baseUrl?: string;
  /** Реализация fetch; по умолчанию глобальная. */
  fetchImpl?: typeof fetch;
}

/** Собирает текст ошибки из ответа сервера. */
async function toApiError(response: Response): Promise<ApiError> {
  let detail = '';

  try {
    const body: unknown = await response.json();
    if (typeof body === 'object' && body !== null && 'error' in body) {
      detail = String((body as { error: unknown }).error);
    }
  } catch {
    // Тело не JSON — оставляем только статус.
  }

  return new ApiError(
    response.status,
    `Запрос к API завершился ошибкой ${response.status}${detail === '' ? '' : `: ${detail}`}`,
  );
}

/** Создаёт клиент REST API. */
export function createApiClient(options: ApiClientOptions = {}): ApiClient {
  const baseUrl = (options.baseUrl ?? '/api').replace(/\/+$/, '');
  const fetchImpl = options.fetchImpl;

  /** Отправляет запрос к API. */
  async function request(path: string, init?: RequestInit): Promise<Response> {
    const send = fetchImpl ?? globalThis.fetch;

    if (typeof send !== 'function') {
      throw new Error('fetch недоступен: клиент API не может отправлять запросы');
    }

    return send(`${baseUrl}${path}`, {
      ...init,
      headers: {
        Accept: 'application/json',
        ...init?.headers,
      },
    });
  }

  return {
    async getStatus(): Promise<StatusResponse> {
      const response = await request('/status');

      if (!response.ok) throw await toApiError(response);

      return (await response.json()) as StatusResponse;
    },

    async getCatalog(snapshotId?: string | null): Promise<CatalogResult> {
      const headers: Record<string, string> = {};

      if (typeof snapshotId === 'string' && snapshotId !== '') {
        headers['If-None-Match'] = snapshotId;
      }

      const response = await request('/catalog', { headers });

      // 304 — снимок не изменился: тело не читаем и не пересчитываем (10.10.5).
      if (response.status === 304) return { notModified: true };
      if (!response.ok) throw await toApiError(response);

      return { notModified: false, catalog: (await response.json()) as CatalogResponse };
    },

    async refresh(): Promise<'started' | 'in_progress'> {
      const response = await request('/refresh', { method: 'POST' });

      // 409 — сборка уже идёт (single-flight); это штатная ситуация.
      if (response.status === 409) return 'in_progress';
      if (!response.ok) throw await toApiError(response);

      return 'started';
    },

    async getErrors(limit: number = ERROR_LOG_LIMIT): Promise<ErrorLogEntry[]> {
      const response = await request(`/errors?limit=${String(limit)}`);

      if (!response.ok) throw await toApiError(response);

      return (await response.json()) as ErrorLogEntry[];
    },
  };
}
