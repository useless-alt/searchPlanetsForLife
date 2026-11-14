/**
 * Клиентский доступ к каталогам в Supabase через серверный маршрут `/api/catalog`.
 *
 * Секретный ключ в браузер не попадает: запросы идут через серверную функцию,
 * которая использует service-role ключ из окружения сервера.
 */

import type { SourceId } from '@/types';

/**
 * Строка выгрузки каталога (сырой объект из источника).
 * Тип вынесен сюда: модуль парсера источников удалён вместе с черновиком.
 */
type Row = Record<string, unknown>;

const ENDPOINT = '/api/catalog';

export interface CatalogSnapshot {
  meta: {
    source: string;
    fetchedAt: string;
    recordCount: number;
    endpoint: string | null;
    schemaVersion: number;
    missingColumns: string[];
    origin: string;
    sha256: string | null;
  };
  rows: Row[];
}

export interface CatalogHealth {
  ok: boolean;
  configured: boolean;
  latencyMs?: number;
  error?: string;
}

interface CatalogResponse {
  ok: boolean;
  error?: string;
  latencyMs?: number;
  snapshots?: Record<string, CatalogSnapshot>;
}

async function request(path: string, init?: RequestInit): Promise<CatalogResponse> {
  const response = await fetch(`${ENDPOINT}${path}`, init);
  let body: CatalogResponse = { ok: false };
  try {
    body = (await response.json()) as CatalogResponse;
  } catch {
    body = { ok: false, error: `HTTP ${response.status}` };
  }
  if (!response.ok && !body.error) body.error = `HTTP ${response.status}`;
  return body;
}

/** Проверка связи с Supabase. */
export async function fetchCatalogHealth(): Promise<CatalogHealth> {
  try {
    const body = await request('?health=1');
    if (!body.ok) {
      return { ok: false, configured: true, error: body.error ?? 'неизвестная ошибка' };
    }
    return { ok: true, configured: true, latencyMs: body.latencyMs };
  } catch (err) {
    return { ok: false, configured: false, error: (err as Error).message };
  }
}

/**
 * Забирает последние выгрузки указанных источников из Postgres.
 * Возвращает только те источники, для которых в базе есть запись.
 */
export async function fetchCatalogSnapshots(
  sources: SourceId[],
): Promise<Record<string, CatalogSnapshot>> {
  const query = sources.join(',');
  const body = await request(`?sources=${encodeURIComponent(query)}`);
  if (!body.ok) throw new Error(body.error ?? 'Supabase недоступен');
  return body.snapshots ?? {};
}

/** Загружает выгрузку источника в Postgres (нужен ключ записи). */
export async function uploadCatalogSnapshot(params: {
  source: SourceId;
  rows: Row[];
  endpoint?: string | null;
  fetchedAt?: string;
  origin?: string;
  schemaMissing?: string[];
  sha256?: string | null;
  writeKey?: string | null;
}): Promise<{ ok: boolean; error?: string; recordCount?: number }> {
  try {
    const body = await request('', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(params.writeKey ? { 'x-catalog-key': params.writeKey } : {}),
      },
      body: JSON.stringify({
        source: params.source,
        rows: params.rows,
        endpoint: params.endpoint ?? null,
        fetchedAt: params.fetchedAt ?? new Date().toISOString(),
        origin: params.origin ?? 'live',
        schemaMissing: params.schemaMissing ?? [],
        sha256: params.sha256 ?? null,
      }),
    });
    if (!body.ok) return { ok: false, error: body.error ?? 'запись не выполнена' };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
