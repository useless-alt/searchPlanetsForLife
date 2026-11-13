/** Транспорт: direct fetch, Edge-прокси, retries, таймауты. */

import { DYNAMIC_LIMITS, TIMEOUTS } from '@/config';
import type { SourceId } from '@/types';

export type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface TransportRequest {
  url: string;
  method?: 'GET' | 'POST';
  body?: string;
  headers?: Record<string, string>;
}

export interface TransportDeps {
  fetchImpl?: FetchLike;
  pageProtocol?: string;
  proxyUrl?: string;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  /** В Node (скрипт снимков) прокси недоступен — только прямые запросы. */
  allowProxy?: boolean;
}

export interface TransportResult {
  response: Response;
  usedProxy: boolean;
  attempts: number;
}

const RETRYABLE = new Set([429, 502, 503, 504]);

export function buildProxyUrl(url: string): string {
  return `/api/proxy?u=${encodeURIComponent(url)}`;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRetryAfter(response: Response): number | null {
  const raw = response.headers.get('retry-after');
  if (!raw) return null;
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const date = Date.parse(raw);
  if (Number.isFinite(date)) return Math.max(0, date - Date.now());
  return null;
}

function backoff(attempt: number, random: () => number): number {
  const base = DYNAMIC_LIMITS.retryBaseMs * Math.pow(2, attempt);
  const jitter = 1 + (random() * 2 - 1) * 0.2;
  return Math.round(base * jitter);
}

/**
 * Политика загрузки:
 * 1) HTTP-URL при HTTPS-странице — сразу proxy;
 * 2) TypeError (CORS/сеть) — один повтор через proxy;
 * 3) 429/502/503/504 — до 3 попыток с Retry-After/бэкоффом;
 * 4) таймаут на источник.
 */
export async function fetchWithPolicy(
  source: SourceId,
  request: TransportRequest,
  deps: TransportDeps = {},
): Promise<TransportResult> {
  const fetchImpl = deps.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const pageProtocol =
    deps.pageProtocol ?? (typeof location !== 'undefined' ? location.protocol : 'http:');
  const allowProxy = deps.allowProxy ?? typeof location !== 'undefined';
  const sleep = deps.sleep ?? defaultSleep;
  const random = deps.random ?? Math.random;

  let useProxy = allowProxy && pageProtocol === 'https:' && request.url.startsWith('http://');
  let proxyTried = useProxy;
  let failures = 0;
  let attempts = 0;

  const timeout = TIMEOUTS[source] ?? 45_000;

  for (;;) {
    attempts += 1;
    const target = useProxy ? buildProxyUrl(request.url) : request.url;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    let response: Response;
    try {
      response = await fetchImpl(target, {
        method: request.method ?? 'GET',
        headers: request.headers,
        body: request.body,
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timer);
      const isTypeError = err instanceof TypeError;
      if (isTypeError && allowProxy && !proxyTried) {
        useProxy = true;
        proxyTried = true;
        continue;
      }
      if (failures < DYNAMIC_LIMITS.retries - 1) {
        const wait = backoff(failures, random);
        failures += 1;
        await sleep(wait);
        continue;
      }
      throw err;
    }
    clearTimeout(timer);

    if (RETRYABLE.has(response.status) && failures < DYNAMIC_LIMITS.retries - 1) {
      const wait = parseRetryAfter(response) ?? backoff(failures, random);
      failures += 1;
      await sleep(wait);
      continue;
    }

    return { response, usedProxy: useProxy, attempts };
  }
}

/** Прочитать текст ответа, разобрать JSON/CSV; ошибки — с понятным текстом. */
export async function readTapBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${text.slice(0, 200)}`);
  }
  const trimmed = text.trimStart();
  if (trimmed.startsWith('<')) {
    throw new Error(`Non-JSON response: ${text.slice(0, 200)}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    // CSV-fallback обрабатывается вызывающим кодом через parseCsv
    throw new Error(`Invalid JSON: ${text.slice(0, 200)}`);
  }
}
