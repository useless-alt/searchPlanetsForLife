/** Exo-MerCat (INAF): объединённый каталог и кросс-имена. */

import { SOURCE_CONFIG } from '@/config';
import type { SourceFetchResult } from '@/types';
import { fetchSchemaColumns, intersectColumns } from './schema';
import { runTapQueryWithFallback, type Row } from './tap';

export async function fetchExomercat(): Promise<SourceFetchResult> {
  const cfg = SOURCE_CONFIG.exomercat;
  const fetchedAt = new Date().toISOString();

  const schema = await fetchSchemaColumns(cfg.endpoint, cfg.table, 'exomercat', 'POST');
  const check = schema
    ? intersectColumns(cfg.desiredColumns, schema)
    : { selected: cfg.desiredColumns, missing: [], available: null };

  const hasName = check.selected.includes('exomercat_name') || check.selected.includes('name');
  if (!hasName) {
    throw new Error('Exo-MerCat: схема изменилась — нет колонки имени');
  }

  const query = `select ${check.selected.join(',')} from ${cfg.table}`;
  const rows: Row[] = await runTapQueryWithFallback('exomercat', query);

  return {
    source: 'exomercat',
    rows,
    tier: 'live',
    fetchedAt,
    schemaMissing: check.missing,
  };
}
