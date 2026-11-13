/** IndexedDB-резервы и кэш схем (idb). */

import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { DYNAMIC_LIMITS } from '@/config';
import type { DataTier, SourceId } from '@/types';

export interface BackupMeta {
  source: SourceId;
  endpoint: string;
  fetchedAt: string;
  recordCount: number;
  sha256: string;
  schemaVersion: number;
}

export interface BackupRecord {
  meta: BackupMeta;
  payload: unknown;
}

export interface SchemaRecord {
  table: string;
  columns: string[];
  fetchedAt: string;
}

interface ExplorerDB extends DBSchema {
  backups: { key: string; value: BackupRecord };
  schemas: { key: string; value: SchemaRecord };
}

const DB_NAME = 'exoplanet-explorer';
const DB_VERSION = 1;
const SCHEMA_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<ExplorerDB>> | null = null;

function getDb(): Promise<IDBPDatabase<ExplorerDB>> {
  if (!dbPromise) {
    dbPromise = openDB<ExplorerDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('backups')) db.createObjectStore('backups');
        if (!db.objectStoreNames.contains('schemas')) db.createObjectStore('schemas');
      },
    });
  }
  return dbPromise;
}

export function latestKey(source: SourceId): string {
  return `backups/${source}/latest`;
}

export function versionKey(source: SourceId, stamp: string): string {
  return `backups/${source}/${stamp}`;
}

export function makeStamp(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

/** Защита от обрезанного ответа: не меньше 50% от предыдущего количества. */
export function shouldAcceptRecordCount(previous: number, next: number): boolean {
  if (!Number.isFinite(next) || next <= 0) return false;
  if (!Number.isFinite(previous) || previous <= 0) return true;
  return next >= previous * 0.5;
}

async function sha256Hex(payload: unknown): Promise<string> {
  try {
    const text = JSON.stringify(payload);
    const bytes = new TextEncoder().encode(text);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return '';
  }
}

export interface SaveBackupOptions {
  allowShrink?: boolean;
}

export async function saveBackup(
  source: SourceId,
  endpoint: string,
  payload: unknown,
  recordCount: number,
  options: SaveBackupOptions = {},
): Promise<{ accepted: boolean; reason?: string; meta?: BackupMeta }> {
  try {
    const db = await getDb();
    const previous = (await db.get('backups', latestKey(source))) as BackupRecord | undefined;
    if (!options.allowShrink && previous && !shouldAcceptRecordCount(previous.meta.recordCount, recordCount)) {
      return {
        accepted: false,
        reason: `ответ обрезан: ${recordCount} записей против ${previous.meta.recordCount} в предыдущей копии`,
      };
    }

    const meta: BackupMeta = {
      source,
      endpoint,
      fetchedAt: new Date().toISOString(),
      recordCount,
      sha256: await sha256Hex(payload),
      schemaVersion: SCHEMA_VERSION,
    };
    const record: BackupRecord = { meta, payload };
    const stamp = makeStamp();

    const tx = db.transaction('backups', 'readwrite');
    await tx.store.put(record, versionKey(source, stamp));
    await tx.store.put(record, latestKey(source));
    await tx.done;

    await rotateVersions(source);
    return { accepted: true, meta };
  } catch (err) {
    return { accepted: false, reason: (err as Error).message };
  }
}

async function rotateVersions(source: SourceId): Promise<void> {
  const db = await getDb();
  const keys = await db.getAllKeys('backups');
  const prefix = `backups/${source}/`;
  const versions = keys.filter(
    (k): k is string => typeof k === 'string' && k.startsWith(prefix) && !k.endsWith('/latest'),
  );
  const excess = keysToRotate(versions, DYNAMIC_LIMITS.backupVersions);
  if (excess.length === 0) return;
  const tx = db.transaction('backups', 'readwrite');
  for (const key of excess) await tx.store.delete(key);
  await tx.done;
}

/** Какие версии удалить: старые сверх лимита. Чистая функция — для тестов. */
export function keysToRotate(versionKeys: string[], limit: number): string[] {
  const sorted = [...versionKeys].sort();
  const excess = sorted.length - Math.max(1, limit);
  return excess > 0 ? sorted.slice(0, excess) : [];
}

export async function getBackup(source: SourceId, key?: string): Promise<BackupRecord | null> {
  try {
    const db = await getDb();
    const record = await db.get('backups', key ?? latestKey(source));
    return (record as BackupRecord | undefined) ?? null;
  } catch {
    return null;
  }
}

export async function listBackupVersions(source: SourceId): Promise<{ key: string; meta: BackupMeta }[]> {
  try {
    const db = await getDb();
    const keys = await db.getAllKeys('backups');
    const prefix = `backups/${source}/`;
    const versions = keys
      .filter((k): k is string => typeof k === 'string' && k.startsWith(prefix) && !k.endsWith('/latest'))
      .sort()
      .reverse();
    const out: { key: string; meta: BackupMeta }[] = [];
    for (const key of versions) {
      const record = (await db.get('backups', key)) as BackupRecord | undefined;
      if (record) out.push({ key, meta: record.meta });
    }
    return out;
  } catch {
    return [];
  }
}

export async function saveSchema(table: string, columns: string[]): Promise<void> {
  try {
    const db = await getDb();
    const record: SchemaRecord = { table, columns, fetchedAt: new Date().toISOString() };
    await db.put('schemas', record, `schema/${table}`);
  } catch {
    /* кэш схемы необязателен */
  }
}

export async function getSchema(table: string): Promise<SchemaRecord | null> {
  try {
    const db = await getDb();
    const record = (await db.get('schemas', `schema/${table}`)) as SchemaRecord | undefined;
    if (!record) return null;
    const ageHours = (Date.now() - new Date(record.fetchedAt).getTime()) / 3_600_000;
    if (ageHours > DYNAMIC_LIMITS.schemaCacheHours) return null;
    return record;
  } catch {
    return null;
  }
}

export async function clearAll(): Promise<void> {
  try {
    const db = await getDb();
    await db.clear('backups');
  } catch {
    /* noop */
  }
}

export type BackupTier = DataTier;
