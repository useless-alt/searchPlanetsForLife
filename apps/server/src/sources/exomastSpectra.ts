/**
 * Загрузка сведений о спектре Exo.MAST (задача 28; п. 7.3, 10.7.5).
 *
 * Маршрут спектра отдаёт только имя файла из ранее полученного списка;
 * здесь файл скачивается, проверяется по размеру и разбирается
 * `parseSpectrum` из `@exo/shared`. Результат кэшируется в памяти процесса:
 * до 100 записей по паре (планета, файл), давно неиспользуемые вытесняются.
 */

import { parseSpectrum, SpectrumParseError, type SpectrumMeta } from '@exo/shared';

import { exoMastFileUrl } from './exomast';
import { SourceFetchError } from './errors';
import type { FetchLike, TapResponse } from './tap';

/** Предельный размер файла спектра (2 МБ). */
export const SPECTRUM_MAX_BYTES = 2 * 1024 * 1024;

/** Предельное число записей кэша. */
export const SPECTRUM_CACHE_LIMIT = 100;

/** Параметры загрузки спектра. */
export interface SpectrumFetchOptions {
  /** Сигнал отмены запроса. */
  signal?: AbortSignal;
  /** Функция запроса; по умолчанию глобальный `fetch`. */
  fetchImpl?: FetchLike;
  /** Таймаут [мс]. */
  timeoutMs?: number;
  /** Текущее время [мс] для вытеснения кэша; по умолчанию `Date.now()`. */
  now?: () => number;
}

/** Запись кэша. */
interface CacheEntry {
  /** Разобранные сведения. */
  meta: SpectrumMeta;
  /** Время последнего обращения [мс]. */
  usedAt: number;
}

/** Кэш сведений о спектрах с вытеснением давно неиспользуемых записей. */
export class SpectrumMetaCache {
  private readonly entries = new Map<string, CacheEntry>();

  /** Ключ записи: планета + файл. */
  private key(planetId: string, file: string): string {
    return `${planetId}\u0000${file}`;
  }

  /** Возвращает сведения и отмечает запись использованной. */
  get(planetId: string, file: string, now = Date.now()): SpectrumMeta | null {
    const key = this.key(planetId, file);
    const entry = this.entries.get(key);

    if (entry === undefined) return null;

    entry.usedAt = now;
    return entry.meta;
  }

  /** Кладёт сведения, вытесняя самую давнюю запись сверх лимита. */
  set(planetId: string, file: string, meta: SpectrumMeta, now = Date.now()): void {
    const key = this.key(planetId, file);

    this.entries.delete(key);
    this.entries.set(key, { meta, usedAt: now });

    while (this.entries.size > SPECTRUM_CACHE_LIMIT) {
      let oldestKey: string | null = null;
      let oldestTime = Number.POSITIVE_INFINITY;

      for (const [candidate, entry] of this.entries) {
        if (entry.usedAt < oldestTime) {
          oldestTime = entry.usedAt;
          oldestKey = candidate;
        }
      }

      if (oldestKey === null) break;
      this.entries.delete(oldestKey);
    }
  }

  /** Текущее число записей. */
  get size(): number {
    return this.entries.size;
  }

  /** Очищает кэш (для тестов). */
  clear(): void {
    this.entries.clear();
  }
}

/** Общий кэш процесса. */
export const spectrumMetaCache = new SpectrumMetaCache();

/** Приводит сетевую ошибку к причине из `FetchErrorReason`. */
function toNetworkError(error: unknown): SourceFetchError {
  if (error instanceof SourceFetchError) return error;

  const code =
    error !== null && typeof error === 'object'
      ? ((error as { code?: unknown }).code ??
        (error as { cause?: { code?: unknown } }).cause?.code)
      : undefined;
  const message = error instanceof Error ? error.message : String(error);

  if (typeof code === 'string' && (code === 'ETIMEDOUT' || code === 'UNDERR_ERR_CONNECT_TIMEOUT')) {
    return new SourceFetchError('timeout', 'Превышено время ожидания ответа Exo.MAST', {
      detail: message,
    });
  }

  return new SourceFetchError('dns_error', 'Запрос файла спектра Exo.MAST не выполнен', {
    detail: message,
  });
}

/** Создаёт `AbortController`, связанный с внешним сигналом. */
function linkedController(signal: AbortSignal | undefined): {
  controller: AbortController;
  detach: () => void;
} {
  const controller = new AbortController();
  const onAbort = (): void => controller.abort();

  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', onAbort, { once: true });
  }

  return {
    controller,
    detach: () => signal?.removeEventListener('abort', onAbort),
  };
}

/**
 * Скачивает текстовый файл с ограничением размера.
 *
 * @throws {SourceFetchError} `http_4xx` при превышении 2 МБ, `timeout`,
 *   `dns_error` при сетевой ошибке.
 */
async function downloadSpectrum(
  url: string,
  options: SpectrumFetchOptions,
  fetchImpl: FetchLike,
): Promise<string> {
  const timeoutMs = options.timeoutMs ?? 30_000;
  const { controller, detach } = linkedController(options.signal);
  let timedOut = false;
  const timer =
    timeoutMs > 0
      ? setTimeout(() => {
          timedOut = true;
          controller.abort();
        }, timeoutMs)
      : null;

  try {
    const response: TapResponse = await fetchImpl(url, {
      method: 'GET',
      headers: { Accept: 'text/plain' },
      signal: controller.signal,
    });

    if (response.status < 200 || response.status >= 300) {
      const reason = response.status >= 500 ? 'http_5xx' : 'http_4xx';
      throw new SourceFetchError(reason, `Exo.MAST spectra: HTTP ${response.status}`, {
        status: response.status,
      });
    }

    const declared = Number(response.headers?.get?.('content-length') ?? Number.NaN);

    if (Number.isFinite(declared) && declared > SPECTRUM_MAX_BYTES) {
      controller.abort();
      throw new SourceFetchError('http_4xx', 'Файл спектра больше 2 МБ', {
        status: 413,
        detail: `Content-Length: ${String(declared)}`,
      });
    }

    const text = await response.text();
    const bytes = new TextEncoder().encode(text).byteLength;

    if (bytes > SPECTRUM_MAX_BYTES) {
      controller.abort();
      throw new SourceFetchError('http_4xx', 'Файл спектра больше 2 МБ', {
        status: 413,
        detail: `Принято байт: ${String(bytes)}`,
      });
    }

    return text;
  } catch (error: unknown) {
    if (error instanceof SourceFetchError) throw error;
    if (options.signal?.aborted) {
      const abort = new Error('Запрос спектра отменён');
      abort.name = 'AbortError';
      throw abort;
    }
    if (timedOut) {
      throw new SourceFetchError('timeout', 'Превышено время ожидания файла спектра');
    }

    throw toNetworkError(error);
  } finally {
    if (timer !== null) clearTimeout(timer);
    detach();
  }
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
 * Загружает и разбирает спектр.
 *
 * При 404 на адресе с завершающей `/` выполняется один повтор без неё.
 * Успешный результат кэшируется по паре (планета, файл).
 *
 * @param planetId Идентификатор планеты (ключ кэша).
 * @param planetName Каноническое имя планеты для адреса Exo.MAST.
 * @param file Имя файла из ранее полученного списка.
 * @param options Параметры запроса.
 */
export async function fetchSpectrumMeta(
  planetId: string,
  planetName: string,
  file: string,
  options: SpectrumFetchOptions = {},
): Promise<SpectrumMeta> {
  const now = options.now ?? (() => Date.now());
  const cached = spectrumMetaCache.get(planetId, file, now());

  if (cached !== null) return cached;

  const fetchImpl = options.fetchImpl ?? defaultFetchImpl();
  let text: string;

  try {
    text = await downloadSpectrum(exoMastFileUrl(planetName, file), options, fetchImpl);
  } catch (error: unknown) {
    const status = error instanceof SourceFetchError ? error.status : null;

    if (status === 404) {
      const retryUrl = exoMastFileUrl(planetName, file).replace(/\/$/, '');
      text = await downloadSpectrum(retryUrl, options, fetchImpl);
    } else {
      throw error;
    }
  }

  let meta: SpectrumMeta;

  try {
    meta = parseSpectrum(text, file);
  } catch (error: unknown) {
    if (error instanceof SpectrumParseError) {
      throw new SourceFetchError('invalid_json', error.message);
    }

    throw error;
  }

  spectrumMetaCache.set(planetId, file, meta, now());
  return meta;
}
