/** Выполнение TAP-запросов с JSON -> CSV fallback. */

import { SOURCE_CONFIG, type SourceConfig } from '@/config';
import type { SourceId } from '@/types';
import { parseCsv, parseTapResponse, UnknownFormatError } from './parser';
import { fetchWithPolicy } from './transport';

export type Row = Record<string, unknown>;

export interface TapOptions {
  format?: 'json' | 'csv';
  endpoint?: string;
}

function buildRequest(config: SourceConfig, query: string, format: 'json' | 'csv', endpoint?: string) {
  if (config.method === 'GET') {
    const url = `${endpoint ?? config.endpoint}?query=${encodeURIComponent(query)}&format=${format}`;
    return { url, method: 'GET' as const, body: undefined, headers: undefined };
  }
  const body = new URLSearchParams({
    query,
    format,
    lang: 'ADQL',
    request: 'doQuery',
  }).toString();
  return {
    url: endpoint ?? config.endpoint,
    method: 'POST' as const,
    body,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  };
}

export async function runTapQuery(
  source: Exclude<SourceId, 'exomast'>,
  query: string,
  options: TapOptions = {},
): Promise<Row[]> {
  const config = SOURCE_CONFIG[source];
  const format = options.format ?? 'json';
  const request = buildRequest(config, query, format, options.endpoint);
  const { response } = await fetchWithPolicy(source, request);

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`HTTP ${response.status} ${config.short}: ${text.slice(0, 200)}`);
  }

  const text = await response.text();
  if (text.trimStart().startsWith('<')) {
    throw new Error(`${config.short}: non-JSON response: ${text.slice(0, 200)}`);
  }

  if (format === 'csv') {
    return parseCsv(text);
  }

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new UnknownFormatError(`${config.short}: invalid JSON`);
  }
  return parseTapResponse(json);
}

/** Запрос с автоматическим CSV-fallback при нераспознанном формате. */
export async function runTapQueryWithFallback(
  source: Exclude<SourceId, 'exomast'>,
  query: string,
): Promise<Row[]> {
  try {
    return await runTapQuery(source, query);
  } catch (err) {
    if (err instanceof UnknownFormatError) {
      return runTapQuery(source, query, { format: 'csv' });
    }
    throw err;
  }
}
