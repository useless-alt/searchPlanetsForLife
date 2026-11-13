/** NASA Exoplanet Archive: pscomppars. */

import { SOURCE_CONFIG } from '@/config';
import type { SourceFetchResult } from '@/types';
import { intersectColumns, fetchSchemaColumns } from './schema';
import { runTapQueryWithFallback, type Row } from './tap';

export async function fetchNasa(): Promise<SourceFetchResult> {
  const cfg = SOURCE_CONFIG.nasa;
  const fetchedAt = new Date().toISOString();

  const schema = await fetchSchemaColumns(cfg.endpoint, cfg.table, 'nasa', 'GET');
  const check = schema
    ? intersectColumns(cfg.desiredColumns, schema)
    : { selected: cfg.desiredColumns, missing: [], available: null };

  if (!check.selected.includes('pl_name')) {
    throw new Error('NASA: схема изменилась — колонка pl_name отсутствует');
  }

  const query = `select ${check.selected.join(',')} from ${cfg.table}`;
  const rows: Row[] = await runTapQueryWithFallback('nasa', query);

  return {
    source: 'nasa',
    rows,
    tier: 'live',
    fetchedAt,
    schemaMissing: check.missing,
  };
}
