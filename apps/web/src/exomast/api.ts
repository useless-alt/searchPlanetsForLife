import type { ExoMastProps, FetchErrorReason, SpectrumMeta } from '@exo/shared';

/**
 * Клиент ленивого Exo.MAST (задача 28; п. 7.3, 10.1.4).
 *
 * Отдельный модуль, а не часть `ApiClient`: запросы к Exo.MAST уходят
 * только по приближению к планете и по кнопке «Обновить данные планеты».
 * Ни запуск приложения, ни обновление каталога их не вызывают (U6).
 */

/** Причина ошибки клиента Exo.MAST. */
export type ExoMastErrorReason = FetchErrorReason | 'planet_not_found' | 'spectrum_not_listed';

/** Успешный ответ свойств. */
export interface ExoMastSuccess {
  /** Свойства планеты. */
  props: ExoMastProps;
  /** Источник данных: свежий запрос или резервная копия. */
  status: 'updated' | 'backup';
}

/** Ошибка запроса Exo.MAST с машиночитаемой причиной. */
export class ExoMastApiError extends Error {
  /** Причина ошибки. */
  readonly reason: ExoMastErrorReason;

  /** HTTP-статус; 0 — сеть недоступна. */
  readonly status: number;

  constructor(reason: ExoMastErrorReason, status: number, message?: string) {
    super(message ?? `Запрос Exo.MAST завершился ошибкой: ${reason}`);
    this.name = 'ExoMastApiError';
    this.reason = reason;
    this.status = status;
  }
}

/** Клиент Exo.MAST. */
export interface ExoMastApi {
  /** `GET /api/planets/:id/exomast` — свойства планеты. */
  getExoMast(planetId: string, signal?: AbortSignal): Promise<ExoMastSuccess>;
  /** `GET /api/planets/:id/exomast/spectra?file=…` — сведения о спектре. */
  getSpectrum(planetId: string, file: string, signal?: AbortSignal): Promise<SpectrumMeta>;
}

/** Настройки клиента. */
export interface ExoMastApiOptions {
  /** База API; по умолчанию `/api`. */
  baseUrl?: string;
  /** Реализация fetch; по умолчанию глобальная. */
  fetchImpl?: typeof fetch;
}

/** Это отмена запроса? */
function isAbort(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

/** Тело ответа как объект. */
async function readJson(response: Response): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await response.json();

    if (body !== null && typeof body === 'object') return body as Record<string, unknown>;
  } catch {
    // Тело не JSON — причина остаётся по статусу.
  }

  return {};
}

/** Причина по HTTP-статусу. */
function statusReason(status: number): FetchErrorReason {
  return status >= 500 ? 'http_5xx' : 'http_4xx';
}

/** Создаёт клиент Exo.MAST. */
export function createExoMastApi(options: ExoMastApiOptions = {}): ExoMastApi {
  const baseUrl = (options.baseUrl ?? '/api').replace(/\/+$/, '');

  /** Отправляет GET и возвращает ответ. */
  async function request(path: string, signal?: AbortSignal): Promise<Response> {
    const send = options.fetchImpl ?? globalThis.fetch;

    if (typeof send !== 'function') {
      throw new ExoMastApiError('dns_error', 0, 'fetch недоступен');
    }

    return send(`${baseUrl}${path}`, { headers: { Accept: 'application/json' }, signal });
  }

  return {
    async getExoMast(planetId, signal) {
      let response: Response;

      try {
        response = await request(`/planets/${encodeURIComponent(planetId)}/exomast`, signal);
      } catch (error: unknown) {
        if (isAbort(error)) throw error;
        throw new ExoMastApiError('dns_error', 0);
      }

      const body = await readJson(response);

      if (response.status === 200 && body['props'] !== undefined) {
        const props = body['props'] as ExoMastProps;

        return {
          // Совместимость с сервером прежней версии (задача 9): поля
          // задачи 28 приходят только от обновлённого сервера.
          props: {
            ...props,
            canonicalName: props.canonicalName ?? null,
            atmosphere: props.atmosphere ?? { molecules: [], keys: [] },
            spectraFiles: props.spectraFiles ?? null,
          },
          status: body['status'] === 'backup' ? 'backup' : 'updated',
        };
      }

      if (response.status === 404) {
        throw new ExoMastApiError('planet_not_found', 404);
      }

      if (response.status === 502) {
        const reason = body['reason'];
        throw new ExoMastApiError(
          typeof reason === 'string' ? (reason as FetchErrorReason) : 'http_5xx',
          502,
        );
      }

      throw new ExoMastApiError(statusReason(response.status), response.status);
    },

    async getSpectrum(planetId, file, signal) {
      const query = `?file=${encodeURIComponent(file)}`;
      let response: Response;

      try {
        response = await request(
          `/planets/${encodeURIComponent(planetId)}/exomast/spectra${query}`,
          signal,
        );
      } catch (error: unknown) {
        if (isAbort(error)) throw error;
        throw new ExoMastApiError('dns_error', 0);
      }

      const body = await readJson(response);

      if (response.status === 200 && body['meta'] !== undefined) {
        return body['meta'] as SpectrumMeta;
      }

      if (response.status === 404) {
        throw new ExoMastApiError(
          body['error'] === 'planet_not_found' ? 'planet_not_found' : 'spectrum_not_listed',
          404,
        );
      }

      if (response.status === 502) {
        const reason = body['reason'];
        throw new ExoMastApiError(
          typeof reason === 'string' ? (reason as FetchErrorReason) : 'http_5xx',
          502,
        );
      }

      throw new ExoMastApiError(statusReason(response.status), response.status);
    },
  };
}

/** Клиент по умолчанию. */
export function createDefaultExoMastApi(): ExoMastApi {
  return createExoMastApi();
}
