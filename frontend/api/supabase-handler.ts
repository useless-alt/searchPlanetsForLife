/**
 * Доступ к каталогам в Supabase Postgres.
 *
 * Секретный ключ (service role) используется только на сервере: в Edge-функции
 * Vercel — из переменных окружения, в dev-сервере — из `frontend/.env.local`.
 * Во фронтенд ключ не попадает никогда.
 *
 * Таблицы (см. `supabase/schema.sql`):
 *   catalog_snapshots — метаданные выгрузки источника;
 *   catalog_rows      — строки выгрузки, `ord` задаёт порядок.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const CATALOG_SOURCES = [
  'nasa',
  'exomercat',
  'exoplanet_eu',
  'gaia',
  'simbad',
  'exomast',
] as const;

export type CatalogSource = (typeof CATALOG_SOURCES)[number];

export interface CatalogConfig {
  url: string;
  serviceRoleKey: string;
  writeKey?: string;
}

/**
 * Ключ может быть двух видов:
 *   sb_secret_… / eyJ… (JWT service_role) — ключ проекта, работает сразу;
 *   sbp_…                          — Personal Access Token к management API,
 *                                    из него сервер сам достаёт ключ проекта.
 */
const resolvedKeys = new Map<string, { key: string; expiresAt: number }>();

async function resolveServiceKey(config: CatalogConfig): Promise<string> {
  const token = config.serviceRoleKey;
  if (!token.startsWith('sbp_')) return token;

  const cached = resolvedKeys.get(config.url);
  if (cached && cached.expiresAt > Date.now()) return cached.key;

  const ref = new URL(config.url).hostname.split('.')[0];
  const response = await fetch(`https://api.supabase.com/v1/projects/${ref}/api-keys`, {
    headers: { apikey: token, Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new Error(`Personal Access Token не принят management API: ${response.status}`);
  }
  const keys = (await response.json()) as { name?: string; type?: string; api_key?: string }[];
  // Новый secret-ключ management API отдаёт замаскированным, поэтому берём
  // legacy service_role JWT — он приходит целиком и работает с REST API.
  const legacy = keys.find((k) => k.type === 'legacy' && k.name === 'service_role')?.api_key;
  const secret = keys.find(
    (k) => k.type === 'secret' && k.api_key && !/[\u2022\u2023\u00b7*]/.test(k.api_key),
  )?.api_key;
  const key = legacy ?? secret;
  if (!key) throw new Error('в проекте не найден ключ доступа к API');
  resolvedKeys.set(config.url, { key, expiresAt: Date.now() + 10 * 60_000 });
  return key;
}

export interface CatalogMeta {
  source: string;
  fetchedAt: string;
  recordCount: number;
  endpoint: string | null;
  schemaVersion: number;
  missingColumns: string[];
  origin: string;
  sha256: string | null;
}

export interface CatalogSnapshot {
  meta: CatalogMeta;
  rows: Record<string, unknown>[];
}

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Accept, x-catalog-key',
};

const ROW_PAGE = 1000;
const ROW_CHUNK = 500;
const REQUEST_TIMEOUT_MS = 15_000;

/** Гарантированный ответ пользователю, даже если сеть зависла на резолве хоста. */
async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label}: таймаут ${ms} мс`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

/** Читает конфигурацию из окружения. Пусто или неполное окружение — не настроено. */
export function readConfig(
  env: Record<string, string | undefined> | undefined,
): CatalogConfig | null {
  const url = env?.SUPABASE_URL?.trim();
  const serviceRoleKey = env?.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceRoleKey) return null;
  const writeKey = env?.SUPABASE_CATALOG_WRITE_KEY?.trim();
  return { url, serviceRoleKey, writeKey: writeKey ? writeKey : undefined };
}

async function client(config: CatalogConfig): Promise<SupabaseClient> {
  const key = await resolveServiceKey(config);
  return createClient(config.url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      // Ограничиваем время запроса, чтобы недоступная база не блокировала интерфейс.
      fetch: (input: RequestInfo | URL, init?: RequestInit) =>
        fetch(input, { ...init, signal: init?.signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS) }),
    },
  });
}

function isCatalogSource(value: string): value is CatalogSource {
  return (CATALOG_SOURCES as readonly string[]).includes(value);
}

function parseSources(raw: string | null): CatalogSource[] {
  if (!raw) return [...CATALOG_SOURCES];
  const list = raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s): s is CatalogSource => isCatalogSource(s));
  return list.length > 0 ? list : [...CATALOG_SOURCES];
}

interface SnapshotRow {
  id: number;
  source: string;
  fetched_at: string;
  record_count: number;
  endpoint: string | null;
  schema_version: number;
  missing_columns: string[] | null;
  origin: string | null;
  sha256: string | null;
}

function toMeta(row: SnapshotRow): CatalogMeta {
  return {
    source: row.source,
    fetchedAt: row.fetched_at,
    recordCount: row.record_count,
    endpoint: row.endpoint,
    schemaVersion: row.schema_version ?? 1,
    missingColumns: row.missing_columns ?? [],
    origin: row.origin ?? 'live',
    sha256: row.sha256,
  };
}

async function readRows(
  supabase: SupabaseClient,
  snapshotId: number,
): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await supabase
      .from('catalog_rows')
      .select('data')
      .eq('snapshot_id', snapshotId)
      .order('ord', { ascending: true })
      .range(offset, offset + ROW_PAGE - 1);
    if (error) throw new Error(error.message);
    const chunk = (data ?? []) as { data: Record<string, unknown> }[];
    if (chunk.length === 0) break;
    for (const item of chunk) rows.push(item.data);
    if (chunk.length < ROW_PAGE) break;
    offset += ROW_PAGE;
  }
  return rows;
}

async function readSnapshot(
  supabase: SupabaseClient,
  source: CatalogSource,
): Promise<CatalogSnapshot | null> {
  const { data, error } = await supabase
    .from('catalog_snapshots')
    .select('*')
    .eq('source', source)
    .order('fetched_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    if (error.code === 'PGRST116') return null;
    throw new Error(error.message);
  }
  if (!data) return null;
  const row = data as unknown as SnapshotRow;
  const rows = await readRows(supabase, row.id);
  return { meta: toMeta(row), rows };
}

interface WriteBody {
  source?: unknown;
  rows?: unknown;
  endpoint?: unknown;
  fetchedAt?: unknown;
  origin?: unknown;
  schemaMissing?: unknown;
  sha256?: unknown;
}

async function writeSnapshot(
  supabase: SupabaseClient,
  body: WriteBody,
): Promise<{ snapshotId: number; recordCount: number }> {
  const source = typeof body.source === 'string' ? body.source : '';
  if (!isCatalogSource(source)) throw new Error(`неизвестный источник: ${source}`);
  const rows = Array.isArray(body.rows) ? (body.rows as Record<string, unknown>[]) : null;
  if (!rows) throw new Error('поле rows обязательно');

  const fetchedAt =
    typeof body.fetchedAt === 'string' && body.fetchedAt.length > 0
      ? body.fetchedAt
      : new Date().toISOString();
  const missingColumns = Array.isArray(body.schemaMissing)
    ? (body.schemaMissing as unknown[]).map(String)
    : [];

  const { data: inserted, error } = await supabase
    .from('catalog_snapshots')
    .insert({
      source,
      fetched_at: fetchedAt,
      record_count: rows.length,
      endpoint: typeof body.endpoint === 'string' ? body.endpoint : null,
      schema_version: 1,
      missing_columns: missingColumns,
      origin: typeof body.origin === 'string' ? body.origin : 'live',
      sha256: typeof body.sha256 === 'string' ? body.sha256 : null,
    })
    .select('id')
    .single();
  if (error) throw new Error(error.message);

  const snapshotId = (inserted as unknown as { id: number }).id;

  for (let i = 0; i < rows.length; i += ROW_CHUNK) {
    const batch = rows.slice(i, i + ROW_CHUNK).map((data, j) => ({
      snapshot_id: snapshotId,
      ord: i + j,
      data,
    }));
    const { error: rowError } = await supabase.from('catalog_rows').insert(batch);
    if (rowError) throw new Error(rowError.message);
  }

  // Храним только последние версии выгрузки, чтобы таблица не разрасталась.
  const { data: stale } = await supabase
    .from('catalog_snapshots')
    .select('id')
    .eq('source', source)
    .order('fetched_at', { ascending: false })
    .range(3, 100);
  const staleIds = ((stale ?? []) as { id: number }[]).map((r) => r.id);
  if (staleIds.length > 0) {
    await supabase.from('catalog_snapshots').delete().in('id', staleIds);
  }

  return { snapshotId, recordCount: rows.length };
}

export async function handleCatalogRequest(
  request: Request,
  config: CatalogConfig | null,
): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (!config) {
    return json(503, {
      ok: false,
      error:
        'Supabase не настроен: задайте SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY (см. frontend/.env.local)',
    });
  }

  const url = new URL(request.url);

  if (request.method === 'GET') {
    const supabase = await client(config);
    if (url.searchParams.get('health')) {
      const started = Date.now();
      try {
        const { error } = await withTimeout(
          Promise.resolve(supabase.from('catalog_snapshots').select('id').limit(1)),
          REQUEST_TIMEOUT_MS,
          'проверка подключения',
        );
        if (error) {
          return json(503, { ok: false, error: error.message, latencyMs: Date.now() - started });
        }
        return json(200, { ok: true, latencyMs: Date.now() - started });
      } catch (err) {
        return json(503, { ok: false, error: (err as Error).message, latencyMs: Date.now() - started });
      }
    }
    try {
      const sources = parseSources(url.searchParams.get('sources'));
      const snapshots: Record<string, CatalogSnapshot> = {};
      for (const source of sources) {
        const snapshot = await withTimeout(
          readSnapshot(supabase, source),
          REQUEST_TIMEOUT_MS,
          `чтение ${source}`,
        );
        if (snapshot) snapshots[source] = snapshot;
      }
      return json(200, { ok: true, snapshots });
    } catch (err) {
      return json(502, { ok: false, error: (err as Error).message });
    }
  }

  if (request.method === 'POST') {
    if (!config.writeKey) {
      return json(403, {
        ok: false,
        error:
          'Запись в Supabase отключена: не задан SUPABASE_CATALOG_WRITE_KEY. Чтение работает.',
      });
    }
    const provided = request.headers.get('x-catalog-key') ?? '';
    if (provided !== config.writeKey) {
      return json(403, { ok: false, error: 'Неверный ключ записи (x-catalog-key)' });
    }
    let body: WriteBody;
    try {
      body = (await request.json()) as WriteBody;
    } catch {
      return json(400, { ok: false, error: 'тело запроса — не JSON' });
    }
    try {
      const supabase = await client(config);
      const result = await withTimeout(writeSnapshot(supabase, body), 120_000, 'запись');
      return json(200, { ok: true, ...result });
    } catch (err) {
      return json(400, { ok: false, error: (err as Error).message });
    }
  }

  return json(405, { ok: false, error: 'метод не поддерживается' });
}
