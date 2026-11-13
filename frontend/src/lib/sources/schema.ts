/** SCHEMA GUARD: пересечение желаемых колонок с реальной схемой TAP. */

import { fetchWithPolicy } from './transport';
import { parseTapResponse } from './parser';
import { getSchema, saveSchema } from '../cache/backups';

export interface SchemaCheck {
  selected: string[];
  missing: string[];
  available: string[] | null;
}

/** Пересечение без учёта регистра; порядок — как в desired. */
export function intersectColumns(desired: string[], available: string[]): SchemaCheck {
  const present = new Map(available.map((c) => [c.toLowerCase(), c]));
  const selected: string[] = [];
  const missing: string[] = [];
  for (const col of desired) {
    if (present.has(col.toLowerCase())) selected.push(col);
    else missing.push(col);
  }
  return { selected, missing, available };
}

/** Запрос списка колонок таблицы. */
export async function fetchSchemaColumns(
  endpoint: string,
  table: string,
  source: 'nasa' | 'exomercat' | 'exoplanet_eu' | 'gaia' | 'simbad',
  method: 'GET' | 'POST',
): Promise<string[] | null> {
  const cached = await getSchema(table);
  if (cached && cached.columns.length > 0) return cached.columns;

  const escaped = table.replace(/'/g, "''");
  const query = `SELECT column_name FROM TAP_SCHEMA.columns WHERE table_name = '${escaped}'`;

  const body =
    method === 'POST'
      ? new URLSearchParams({ query, format: 'json', lang: 'ADQL', request: 'doQuery' }).toString()
      : undefined;
  const url =
    method === 'GET'
      ? `${endpoint}?query=${encodeURIComponent(query)}&format=json`
      : endpoint;

  try {
    const { response } = await fetchWithPolicy(source, {
      url,
      method,
      body,
      headers: method === 'POST' ? { 'Content-Type': 'application/x-www-form-urlencoded' } : undefined,
    });
    if (!response.ok) return null;
    const rows = parseTapResponse(await response.json());
    const names = rows
      .map((r) => String(r.column_name ?? r.COLUMN_NAME ?? ''))
      .filter((n) => n.length > 0);
    if (names.length > 0) {
      await saveSchema(table, names);
      return names;
    }
    return null;
  } catch {
    return null;
  }
}
