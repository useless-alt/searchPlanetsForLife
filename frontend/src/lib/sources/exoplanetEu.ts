/** Exoplanet.eu: epn_core. */

import { SOURCE_CONFIG } from '@/config';
import type { SourceFetchResult } from '@/types';
import { fetchSchemaColumns, intersectColumns } from './schema';
import { runTapQueryWithFallback, type Row } from './tap';

export async function fetchExoplanetEu(): Promise<SourceFetchResult> {
  const cfg = SOURCE_CONFIG.exoplanet_eu;
  const fetchedAt = new Date().toISOString();

  const schema = await fetchSchemaColumns(cfg.endpoint, cfg.table, 'exoplanet_eu', 'POST');
  const check = schema
    ? intersectColumns(cfg.desiredColumns, schema)
    : { selected: cfg.desiredColumns, missing: [], available: null };

  if (!check.selected.includes('target_name') && !check.selected.includes('granule_uid')) {
    throw new Error('Exoplanet.eu: схема изменилась — нет имени планеты');
  }

  const query = `select ${check.selected.join(',')} from ${cfg.table}`;
  const rows: Row[] = await runTapQueryWithFallback('exoplanet_eu', query);

  return {
    source: 'exoplanet_eu',
    rows,
    tier: 'live',
    fetchedAt,
    schemaMissing: check.missing,
  };
}
