/** SIMBAD: кросс-идентификация, спектральный тип, параллакс. */

import { DYNAMIC_LIMITS, SOURCE_CONFIG } from '@/config';
import { fetchSchemaColumns, intersectColumns } from './schema';
import { runTapQuery, type Row } from './tap';

const IDENT_COLUMNS = ['id', 'oidref'];
const BASIC_COLUMNS = ['oid', 'main_id', 'ra', 'dec', 'sp_type', 'plx_value'];

export interface SimbadFetchResult {
  rows: Row[];
  schemaMissing: string[];
}

function quote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

async function fetchBatch(
  ids: string[],
  endpoint: string,
  identCols: string[],
  basicCols: string[],
): Promise<Row[]> {
  const list = ids.map(quote).join(',');
  const basicSelect = basicCols.filter((c) => c !== 'oid');
  const select = ['i.id AS query_id', ...basicSelect.map((c) => `b.${c}`)].join(', ');
  const query = `SELECT ${select} FROM ident AS i JOIN basic AS b ON b.oid = i.oidref WHERE i.id IN (${list})`;
  return runTapQuery('simbad', query, { endpoint });
}

/** Возвращает строки SIMBAD с query_id (точная строка идентификатора). */
export async function fetchSimbad(ids: string[]): Promise<SimbadFetchResult> {
  if (ids.length === 0) return { rows: [], schemaMissing: [] };

  const cfg = SOURCE_CONFIG.simbad;
  const endpoint = cfg.endpoint;
  const [identSchema, basicSchema] = await Promise.all([
    fetchSchemaColumns(endpoint, 'ident', 'simbad', 'POST'),
    fetchSchemaColumns(endpoint, 'basic', 'simbad', 'POST'),
  ]);

  const ident = identSchema
    ? intersectColumns(IDENT_COLUMNS, identSchema)
    : { selected: IDENT_COLUMNS, missing: [], available: null };
  const basic = basicSchema
    ? intersectColumns(BASIC_COLUMNS, basicSchema)
    : { selected: BASIC_COLUMNS, missing: [], available: null };

  if (!ident.selected.includes('id') || !ident.selected.includes('oidref')) {
    throw new Error('SIMBAD: схема изменилась — нет ident.id/oidref');
  }
  if (!basic.selected.includes('main_id') || !basic.selected.includes('oid')) {
    throw new Error('SIMBAD: схема изменилась — нет basic.main_id/oid');
  }

  const schemaMissing = [...ident.missing, ...basic.missing];
  const batches: string[][] = [];
  for (let i = 0; i < ids.length; i += DYNAMIC_LIMITS.simbadBatch) {
    batches.push(ids.slice(i, i + DYNAMIC_LIMITS.simbadBatch));
  }

  const endpoints = [endpoint, ...(cfg.fallbackEndpoints ?? [])];
  let lastError: unknown = null;

  for (const mirror of endpoints) {
    const rows: Row[] = [];
    try {
      let cursor = 0;
      await Promise.all(
        Array.from({ length: Math.min(DYNAMIC_LIMITS.defaultParallel, batches.length) }, async () => {
          for (;;) {
            const index = cursor++;
            const batch = batches[index];
            if (!batch) return;
            if (batch.length === 0) continue;
            rows.push(...(await fetchBatch(batch, mirror, ident.selected, basic.selected)));
          }
        }),
      );
      return { rows, schemaMissing };
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError ?? new Error('SIMBAD: все зеркала недоступны');
}

/** Map: query_id -> строка SIMBAD. */
export function simbadMap(rows: Row[]): Map<string, Row> {
  const map = new Map<string, Row>();
  for (const row of rows) {
    const id = row['query_id'];
    if (id !== null && id !== undefined) map.set(String(id), row);
  }
  return map;
}
