/** Gaia DR3: параметры звёзд по source_id из NASA. */

import { DYNAMIC_LIMITS, SOURCE_CONFIG } from '@/config';
import { fetchSchemaColumns, intersectColumns } from './schema';
import { runTapQuery, type Row } from './tap';

const AP_COLUMNS = ['source_id', 'teff_gspphot', 'radius_gspphot', 'radius_flame', 'lum_flame', 'mass_flame'];
const GS_COLUMNS = ['source_id', 'parallax', 'parallax_over_error'];

export interface GaiaFetchResult {
  rows: Row[];
  schemaMissing: string[];
}

export function gaiaKey(id: string): string {
  const numeric = id.replace(/^Gaia DR3\s*/i, '').trim();
  const parsed = Number(numeric);
  return Number.isFinite(parsed) ? String(parsed) : numeric;
}

export function extractGaiaIds(rows: Row[]): string[] {
  const ids = new Set<string>();
  for (const row of rows) {
    const raw = row['gaia_dr3_id'] ?? row['gaia_dr2_id'];
    if (typeof raw === 'string' && /^Gaia DR\d/i.test(raw.trim())) {
      ids.add(raw.trim());
    }
  }
  return [...ids];
}

function idList(ids: string[]): string {
  return ids
    .map((id) => id.replace(/^Gaia DR3\s*/i, '').replace(/^Gaia DR2\s*/i, '').trim())
    .filter((id) => /^\d+$/.test(id))
    .join(',');
}

async function fetchJoin(ids: string[], apCols: string[], gsCols: string[]): Promise<Row[]> {
  const apSelect = apCols.map((c) => `ap.${c}`).join(',');
  const gsSelect = gsCols.filter((c) => c !== 'source_id').map((c) => `gs.${c}`).join(',');
  const query = `SELECT ${apSelect}${gsSelect ? `, ${gsSelect}` : ''} FROM gaiadr3.astrophysical_parameters AS ap JOIN gaiadr3.gaia_source AS gs ON gs.source_id = ap.source_id WHERE ap.source_id IN (${idList(ids)})`;
  return runTapQuery('gaia', query);
}

async function fetchSplit(ids: string[], apCols: string[], gsCols: string[]): Promise<Row[]> {
  const ap = await runTapQuery(
    'gaia',
    `SELECT ${apCols.join(',')} FROM gaiadr3.astrophysical_parameters WHERE source_id IN (${idList(ids)})`,
  );
  let gs: Row[] = [];
  try {
    gs = await runTapQuery(
      'gaia',
      `SELECT ${gsCols.join(',')} FROM gaiadr3.gaia_source WHERE source_id IN (${idList(ids)})`,
    );
  } catch {
    // Без gaia_source остаются только астрофизические параметры — это допустимо.
  }
  const byId = new Map<string, Row>();
  for (const row of ap) byId.set(String(row['source_id']), { ...row });
  for (const row of gs) {
    const key = String(row['source_id']);
    const existing = byId.get(key) ?? {};
    byId.set(key, { ...existing, ...row });
  }
  return [...byId.values()];
}

/** Возвращает строки Gaia (source_id + параметры); при сбое JOIN — split-fallback. */
export async function fetchGaia(ids: string[]): Promise<GaiaFetchResult> {
  const cfg = SOURCE_CONFIG.gaia;
  if (ids.length === 0) return { rows: [], schemaMissing: [] };

  const [apSchema, gsSchema] = await Promise.all([
    fetchSchemaColumns(cfg.endpoint, 'gaiadr3.astrophysical_parameters', 'gaia', 'POST'),
    fetchSchemaColumns(cfg.endpoint, 'gaiadr3.gaia_source', 'gaia', 'POST'),
  ]);

  const apCheck = apSchema
    ? intersectColumns(AP_COLUMNS, apSchema)
    : { selected: AP_COLUMNS, missing: [], available: null };
  const gsCheck = gsSchema
    ? intersectColumns(GS_COLUMNS, gsSchema)
    : { selected: GS_COLUMNS, missing: [], available: null };

  if (!apCheck.selected.includes('source_id')) {
    throw new Error('Gaia: схема изменилась — нет source_id');
  }
  if (!gsCheck.selected.includes('source_id')) throw new Error('Gaia: нет source_id в gaia_source');

  const schemaMissing = [...apCheck.missing, ...gsCheck.missing];
  const apCols = apCheck.selected;
  const gsCols = gsCheck.selected;
  const idsByBatch: string[][] = [];
  for (let i = 0; i < ids.length; i += DYNAMIC_LIMITS.gaiaBatch) {
    idsByBatch.push(ids.slice(i, i + DYNAMIC_LIMITS.gaiaBatch));
  }

  const rows: Row[] = [];
  let cursor = 0;
  async function worker(): Promise<void> {
    for (;;) {
      const index = cursor++;
      const batch = idsByBatch[index];
      if (!batch) return;
      if (batch.length === 0) continue;
      let result: Row[];
      try {
        result = await fetchJoin(batch, apCols, gsCols);
      } catch {
        result = await fetchSplit(batch, apCols, gsCols);
      }
      rows.push(...result);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(DYNAMIC_LIMITS.gaiaParallel, idsByBatch.length) }, () => worker()),
  );

  return { rows, schemaMissing };
}

/** Map: source_id (строка) -> строка Gaia. */
export function gaiaMap(rows: Row[]): Map<string, Row> {
  const map = new Map<string, Row>();
  for (const row of rows) {
    const id = row['source_id'];
    if (id !== null && id !== undefined) map.set(String(id), row);
  }
  return map;
}
