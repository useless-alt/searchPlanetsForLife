#!/usr/bin/env node
/**
 * Выгрузка снимков каталогов в Supabase Postgres.
 *
 *   node scripts/upload-catalog.mjs                     # все файлы public/data/snapshots
 *   node scripts/upload-catalog.mjs --only=nasa,gaia    # выборочно
 *   node scripts/upload-catalog.mjs --dir=path/to/dir   # другой каталог
 *
 * Ключи берутся из frontend/.env.local:
 *   SUPABASE_URL              — https://<project>.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY — ключ с полным доступом (никогда не попадает в бандл)
 *
 * Таблицы создаются скриптом supabase/schema.sql в корне репозитория.
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const ROW_CHUNK = 500;
const KEEP_VERSIONS = 3;

function parseEnvFile(text) {
  const out = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function loadEnv(root) {
  const env = {};
  for (const name of ['.env.local', '.env']) {
    const file = path.join(root, name);
    if (!existsSync(file)) continue;
    Object.assign(env, parseEnvFile(readFileSync(file, 'utf8')));
  }
  return env;
}

function parseArgs(argv) {
  const onlyArg = argv.find((a) => a.startsWith('--only='));
  const dirArg = argv.find((a) => a.startsWith('--dir='));
  return {
    only: onlyArg
      ? new Set(
          onlyArg
            .slice('--only='.length)
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
        )
      : null,
    dir: dirArg ? path.resolve(dirArg.slice('--dir='.length)) : null,
  };
}

function headers(env) {
  return {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
  };
}

/**
 * Ключ из .env.local может быть Personal Access Token (sbp_…): тогда сервер
 * сам достаёт ключ проекта через management API.
 */
async function resolveKey(env) {
  const token = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!token.startsWith('sbp_')) return token;
  const ref = new URL(env.SUPABASE_URL).hostname.split('.')[0];
  const response = await fetch(`https://api.supabase.com/v1/projects/${ref}/api-keys`, {
    headers: { apikey: token, Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new Error(`Personal Access Token не принят management API: ${response.status}`);
  }
  const keys = await response.json();
  // Новый secret-ключ management API отдаёт замаскированным, поэтому берём
  // legacy service_role JWT — он приходит целиком и работает с REST API.
  const legacy = keys.find((k) => k.type === 'legacy' && k.name === 'service_role')?.api_key;
  const secret = keys.find(
    (k) => k.type === 'secret' && k.api_key && !/[\u2022\u2023\u00b7*]/.test(k.api_key),
  )?.api_key;
  const key = legacy ?? secret;
  if (!key) throw new Error('в проекте не найден ключ доступа к API');
  return key;
}

async function rest(env, method, pathname, body, extraHeaders = {}) {
  const response = await fetch(`${env.SUPABASE_URL}/rest/v1/${pathname}`, {
    method,
    headers: { ...headers(env), ...extraHeaders },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${method} ${pathname} -> ${response.status}: ${text.slice(0, 400)}`);
  }
  return text ? JSON.parse(text) : null;
}

async function uploadSource(env, source, snapshot) {
  const inserted = await rest(
    env,
    'POST',
    'catalog_snapshots?select=id',
    {
      source,
      fetched_at: snapshot.meta?.fetchedAt ?? new Date().toISOString(),
      record_count: snapshot.rows.length,
      endpoint: snapshot.meta?.endpoint ?? null,
      schema_version: snapshot.meta?.schemaVersion ?? 1,
      missing_columns: snapshot.meta?.missingColumns ?? [],
      origin: snapshot.meta?.origin ?? 'live',
      sha256: snapshot.meta?.sha256 ?? null,
    },
    { Prefer: 'return=representation' },
  );
  const snapshotId = Array.isArray(inserted) ? inserted[0].id : inserted.id;

  for (let i = 0; i < snapshot.rows.length; i += ROW_CHUNK) {
    const batch = snapshot.rows.slice(i, i + ROW_CHUNK).map((data, j) => ({
      snapshot_id: snapshotId,
      ord: i + j,
      data,
    }));
    await rest(env, 'POST', 'catalog_rows', batch);
  }

  const stale = await rest(
    env,
    'GET',
    `catalog_snapshots?select=id&source=eq.${encodeURIComponent(source)}&order=fetched_at.desc`,
  );
  if (Array.isArray(stale) && stale.length > KEEP_VERSIONS) {
    const ids = stale.slice(KEEP_VERSIONS).map((r) => r.id).join(',');
    await rest(env, 'DELETE', `catalog_snapshots?id=in.(${ids})`);
  }

  return snapshotId;
}

async function main() {
  const root = process.cwd();
  const env = loadEnv(root);
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error(
      'Не заданы SUPABASE_URL и/или SUPABASE_SERVICE_ROLE_KEY.\n' +
        'Впишите их в frontend/.env.local и повторите.',
    );
    process.exitCode = 1;
    return;
  }

  const args = parseArgs(process.argv.slice(2));
  env.SUPABASE_SERVICE_ROLE_KEY = await resolveKey(env);
  const dir = args.dir ?? path.join(root, 'public', 'data', 'snapshots');
  if (!existsSync(dir)) {
    console.error(`Каталог со снимками не найден: ${dir}`);
    process.exitCode = 1;
    return;
  }

  const files = ['nasa', 'exomercat', 'exoplanet_eu', 'gaia', 'simbad']
    .filter((s) => !args.only || args.only.has(s))
    .map((s) => path.join(dir, `${s}.json`))
    .filter((f) => existsSync(f));

  if (files.length === 0) {
    console.error('Нет файлов снимков для выгрузки.');
    process.exitCode = 1;
    return;
  }

  console.log(`Загрузка в Supabase: ${env.SUPABASE_URL}\n`);
  for (const file of files) {
    const source = path.basename(file, '.json');
    const snapshot = JSON.parse(readFileSync(file, 'utf8'));
    if (!Array.isArray(snapshot.rows)) {
      console.error(`  ${source}: нет массива rows — пропущен`);
      continue;
    }
    process.stdout.write(`  ${source} … `);
    const id = await uploadSource(env, source, snapshot);
    console.log(`${snapshot.rows.length} записей, snapshot id=${id}`);
  }
  console.log('\nГотово.');
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
