/** Встроенные аварийные снимки public/data/snapshots/<source>.json (zod-валидация). */

import { z } from 'zod';
import type { DataTier, SourceId } from '@/types';

const sourceSchema = z.enum(['nasa', 'exomercat', 'exoplanet_eu', 'gaia', 'simbad', 'exomast']);

const metaSchema = z
  .object({
    source: sourceSchema,
    fetchedAt: z.string().min(4),
    recordCount: z.number().int().nonnegative(),
    endpoint: z.string().optional(),
    schemaVersion: z.number().optional(),
    sha256: z.string().optional(),
    missingColumns: z.array(z.string()).optional(),
  })
  .passthrough();

const snapshotSchema = z.object({
  meta: metaSchema,
  rows: z.array(z.record(z.unknown())),
});

export type SnapshotMeta = z.infer<typeof metaSchema>;
export type SnapshotFile = z.infer<typeof snapshotSchema>;

export interface LoadedSnapshot {
  rows: Record<string, unknown>[];
  meta: SnapshotMeta;
  tier: DataTier;
}

export function parseSnapshot(json: unknown): SnapshotFile | null {
  const parsed = snapshotSchema.safeParse(json);
  return parsed.success ? parsed.data : null;
}

export function snapshotUrl(source: SourceId): string {
  return `${import.meta.env.BASE_URL}data/snapshots/${source}.json`;
}

export async function loadSnapshot(source: SourceId): Promise<LoadedSnapshot | null> {
  try {
    const response = await fetch(snapshotUrl(source), { cache: 'no-store' });
    if (!response.ok) return null;
    const parsed = parseSnapshot(await response.json());
    if (!parsed) return null;
    return { rows: parsed.rows, meta: parsed.meta, tier: 'snapshot' };
  } catch {
    return null;
  }
}
