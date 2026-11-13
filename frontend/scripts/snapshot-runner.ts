/**
 * Генератор аварийных снимков public/data/snapshots/*.json.
 * Запускается из frontend/scripts/make-snapshots.mjs через Vite ssrLoadModule,
 * поэтому использует те же модули src/lib/sources, что и приложение.
 */

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { SOURCE_CONFIG } from '@/config';
import type { SourceId } from '@/types';
import { fetchNasa } from '@/lib/sources/nasa';
import { fetchExomercat } from '@/lib/sources/exomercat';
import { fetchExoplanetEu } from '@/lib/sources/exoplanetEu';
import { fetchGaia, extractGaiaIds } from '@/lib/sources/gaia';
import { fetchSimbad } from '@/lib/sources/simbad';
import { parseTapResponse, type Row } from '@/lib/sources/parser';
import { gazetteer } from '@/lib/pipeline/merge';

const CATALOGS: SourceId[] = ['nasa', 'exomercat', 'exoplanet_eu'];
const ENRICHERS: SourceId[] = ['gaia', 'simbad'];
const ALL: SourceId[] = [...CATALOGS, ...ENRICHERS];

interface Snapshot {
  rows: Row[];
  schemaMissing: string[];
  endpoint: string;
  mode: 'live' | 'backup';
  fetchedAt: string;
}

interface Options {
  live: boolean;
  backups: boolean;
  outDir: string;
  backupsDir: string;
  only: Set<SourceId> | null;
}

function parseArgs(argv: string[]): Options {
  const live = argv.includes('--live');
  const backups = argv.includes('--backups');
  const outArg = argv.find((a) => a.startsWith('--out='));
  const onlyArg = argv.find((a) => a.startsWith('--only='));
  const only = onlyArg
    ? new Set(
        onlyArg
          .slice('--only='.length)
          .split(',')
          .map((s) => s.trim())
          .filter((s): s is SourceId => ALL.includes(s as SourceId)),
      )
    : null;
  return {
    live: live || !backups,
    backups: backups || !live,
    outDir: path.resolve(process.cwd(), outArg ? outArg.slice('--out='.length) : 'public/data/snapshots'),
    backupsDir: path.resolve(process.cwd(), '..', 'data', 'backups'),
    only,
  };
}

function backupFile(source: SourceId, backupsDir: string): string {
  return path.join(backupsDir, source, 'latest.json');
}

function rowsFromBackup(source: SourceId, backupsDir: string): Snapshot | null {
  const file = backupFile(source, backupsDir);
  if (!existsSync(file)) return null;
  try {
    const payload = JSON.parse(readFileSync(file, 'utf8')) as unknown;
    const rows = parseTapResponse(payload);
    if (rows.length === 0) return null;
    return {
      rows,
      schemaMissing: [],
      endpoint: SOURCE_CONFIG[source].endpoint,
      mode: 'backup',
      fetchedAt: statSync(file).mtime.toISOString(),
    };
  } catch (err) {
    console.error(`  [backup] ${source}: ${(err as Error).message}`);
    return null;
  }
}

function validate(source: SourceId, rows: Row[]): void {
  if (rows.length === 0) throw new Error('0 записей');
  const first = rows[0];
  const has = (...keys: string[]): boolean =>
    keys.some((key) => Object.keys(first).some((k) => k.toLowerCase() === key.toLowerCase()));
  if (source === 'nasa' && !has('pl_name')) throw new Error('нет колонки pl_name');
  if (source === 'exomercat' && !has('exomercat_name', 'name')) throw new Error('нет имени Exo-MerCat');
  if (source === 'exoplanet_eu' && !has('target_name', 'granule_uid')) throw new Error('нет имени Exoplanet.eu');
  if (source === 'gaia' && !has('source_id')) throw new Error('нет source_id');
  if (source === 'simbad' && !has('query_id', 'main_id')) throw new Error('нет query_id/main_id');
}

async function liveFor(source: SourceId, nasaRows: Row[]): Promise<Snapshot> {
  const cfg = SOURCE_CONFIG[source];
  if (source === 'nasa') {
    const r = await fetchNasa();
    return { rows: r.rows, schemaMissing: r.schemaMissing, endpoint: cfg.endpoint, mode: 'live', fetchedAt: r.fetchedAt };
  }
  if (source === 'exomercat') {
    const r = await fetchExomercat();
    return { rows: r.rows, schemaMissing: r.schemaMissing, endpoint: cfg.endpoint, mode: 'live', fetchedAt: r.fetchedAt };
  }
  if (source === 'exoplanet_eu') {
    const r = await fetchExoplanetEu();
    return { rows: r.rows, schemaMissing: r.schemaMissing, endpoint: cfg.endpoint, mode: 'live', fetchedAt: r.fetchedAt };
  }
  if (source === 'gaia') {
    const ids = extractGaiaIds(nasaRows);
    if (ids.length === 0) throw new Error('в NASA нет Gaia DR3 id');
    const r = await fetchGaia(ids);
    return { rows: r.rows, schemaMissing: r.schemaMissing, endpoint: cfg.endpoint, mode: 'live', fetchedAt: new Date().toISOString() };
  }
  const { simbadIds } = gazetteer(nasaRows);
  if (simbadIds.length === 0) throw new Error('в NASA нет Gaia/TIC id');
  const r = await fetchSimbad(simbadIds);
  return { rows: r.rows, schemaMissing: r.schemaMissing, endpoint: cfg.endpoint, mode: 'live', fetchedAt: new Date().toISOString() };
}

async function collect(source: SourceId, options: Options, nasaRows: Row[]): Promise<Snapshot | null> {
  if (options.live) {
    try {
      const live = await liveFor(source, nasaRows);
      validate(source, live.rows);
      return live;
    } catch (err) {
      console.error(`  [live] ${source}: ${(err as Error).message}`);
      if (!options.backups) return null;
    }
  }
  const backup = rowsFromBackup(source, options.backupsDir);
  if (backup) {
    try {
      validate(source, backup.rows);
      return backup;
    } catch (err) {
      console.error(`  [backup] ${source}: ${(err as Error).message}`);
    }
  }
  return null;
}

export async function run(argv: string[] = process.argv.slice(2)): Promise<number> {
  const options = parseArgs(argv);
  const selected = ALL.filter((s) => !options.only || options.only.has(s));
  mkdirSync(options.outDir, { recursive: true });

  console.log('Снимки экзопланетных каталогов');
  console.log(`  режим: ${options.live ? (options.backups ? 'LIVE -> резерв' : 'только LIVE') : 'только резерв'}`);
  console.log(`  выход: ${options.outDir}\n`);

  const results = new Map<SourceId, Snapshot>();
  let failed = 0;

  for (const source of CATALOGS) {
    if (!selected.includes(source)) continue;
    process.stdout.write(`${source} … `);
    const snapshot = await collect(source, options, []);
    if (!snapshot) {
      failed += 1;
      console.log('ПРОПУЩЕН');
      continue;
    }
    results.set(source, snapshot);
    console.log(`${snapshot.rows.length} записей (${snapshot.mode})`);
  }

  const nasaRows = results.get('nasa')?.rows ?? [];
  for (const source of ENRICHERS) {
    if (!selected.includes(source)) continue;
    process.stdout.write(`${source} … `);
    const snapshot = await collect(source, options, nasaRows);
    if (!snapshot) {
      failed += 1;
      console.log('ПРОПУЩЕН');
      continue;
    }
    results.set(source, snapshot);
    console.log(`${snapshot.rows.length} записей (${snapshot.mode})`);
  }

  console.log('');
  for (const [source, snapshot] of results) {
    const file = path.join(options.outDir, `${source}.json`);
    const body = JSON.stringify({
      meta: {
        source,
        fetchedAt: snapshot.fetchedAt,
        recordCount: snapshot.rows.length,
        endpoint: snapshot.endpoint,
        schemaVersion: 1,
        missingColumns: snapshot.schemaMissing,
        origin: snapshot.mode,
      },
      rows: snapshot.rows,
    });
    writeFileSync(file, body);
    const kb = (Buffer.byteLength(body) / 1024).toFixed(0);
    console.log(`  ${source}: ${snapshot.rows.length} записей, ${kb} КБ -> ${path.relative(process.cwd(), file)}`);
    if (snapshot.schemaMissing.length > 0) {
      console.log(`    отсутствуют колонки: ${snapshot.schemaMissing.join(', ')}`);
    }
  }

  if (results.size === 0) {
    console.error('\nНи один источник не дал данных.');
    return 1;
  }
  if (failed > 0) {
    console.error(`\nНе удалось подготовить источников: ${failed}. Остальные снимки записаны.`);
    return 1;
  }
  console.log('\nГотово. Снимки записаны.');
  return 0;
}
