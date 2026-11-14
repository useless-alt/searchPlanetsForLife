#!/usr/bin/env node
/**
 * Загрузка резервных копий каталогов экзопланет в Supabase.
 *
 *   node scripts/upload-backups-to-supabase.mjs
 *   node scripts/upload-backups-to-supabase.mjs --only=nasa,gaia
 *   node scripts/upload-backups-to-supabase.mjs --dir=apps/server/data/backups
 *   node scripts/upload-backups-to-supabase.mjs --bucket=planet-backups
 *
 * Куда грузится:
 *   1) Storage bucket (приватный, по умолчанию `planet-backups`):
 *      `catalog/<source>/latest.json` — файлы бэкапа как есть;
 *      `manifest.json` — сводка по источникам с контрольными суммами.
 *   2) Postgres (таблицы из `supabase/schema.sql`):
 *      `catalog_snapshots` — метаданные версии, `catalog_rows` — строки (jsonb).
 *
 * Доступы читаются из `SUPABASE_URL` и `SUPABASE_SERVICE_ROLE_KEY`
 * (файл `.env.local` или `.env` в корне репозитория, либо переменные окружения).
 * Если ключ — Personal Access Token (`sbp_…`), ключ проекта и применение схемы
 * выполняются через management API.
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

const BUCKET_DEFAULT = 'planet-backups';
const SOURCES_DEFAULT = ['nasa', 'exoplanet_eu', 'exomercat', 'gaia', 'simbad'];
const ROW_CHUNK = 500;

/** Порог, с которого большой файл сжимается gzip перед загрузкой. */
const GZIP_THRESHOLD = 8 * 1024 * 1024;

/** Лимит размера объекта в бакете (задаётся при создании бакета). */
const OBJECT_SIZE_LIMIT = 50 * 1024 * 1024;

/**
 * Сколько версий снимка хранить в Postgres на источник.
 *
 * По умолчанию 1 — новая версия полностью заменяет прежнюю (после успешной
 * загрузки). Значение 3 оставляет историю для отката.
 */
function keepVersions(env) {
  const parsed = Number.parseInt(env.SUPABASE_KEEP_VERSIONS ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

/** Разбор файла `.env` в объект. */
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

/** Переменные окружения + файлы `.env.local` / `.env` в корне репозитория. */
function loadEnv(root) {
  const env = { ...process.env };
  for (const name of ['.env.local', '.env']) {
    const file = path.join(root, name);
    if (!existsSync(file)) continue;
    Object.assign(env, parseEnvFile(readFileSync(file, 'utf8')));
  }
  return env;
}

/** Разбор аргументов командной строки. */
function parseArgs(argv) {
  const onlyArg = argv.find((a) => a.startsWith('--only='));
  const dirArg = argv.find((a) => a.startsWith('--dir='));
  const bucketArg = argv.find((a) => a.startsWith('--bucket='));
  return {
    only: onlyArg
      ? onlyArg
          .slice('--only='.length)
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : SOURCES_DEFAULT,
    dir: dirArg ? path.resolve(dirArg.slice('--dir='.length)) : null,
    bucket: bucketArg ? bucketArg.slice('--bucket='.length).trim() : BUCKET_DEFAULT,
  };
}

/** Заголовки REST/Storage-запросов с полным доступом. */
function headers(env) {
  return {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
  };
}

/** Если ключ — Personal Access Token, достаём ключ проекта через management API. */
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
  // Новый secret-ключ management API отдаётся замаскированным, поэтому берём
  // legacy service_role JWT — он приходит целиком и работает с REST API.
  const legacy = keys.find((k) => k.type === 'legacy' && k.name === 'service_role')?.api_key;
  const secret = keys.find(
    (k) => k.type === 'secret' && k.api_key && !/[•‣·*]/.test(k.api_key),
  )?.api_key;
  const key = legacy ?? secret;
  if (!key) throw new Error('в проекте не найден ключ доступа к API');
  return key;
}

/** Выполнение SQL через management API (нужен Personal Access Token). */
async function applySchema(env, sql) {
  const ref = new URL(env.SUPABASE_URL).hostname.split('.')[0];
  const response = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`SQL -> ${response.status}: ${text.slice(0, 400)}`);
  return text;
}

/** Запрос к REST API Supabase. */
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

/** Проверка, что таблицы `catalog_snapshots` / `catalog_rows` существуют. */
async function tablesExist(env) {
  const response = await fetch(`${env.SUPABASE_URL}/rest/v1/catalog_snapshots?select=id&limit=1`, {
    headers: headers(env),
  });
  return response.ok;
}

/** Создание приватного бакета (или проверка существующего). */
async function ensureBucket(env, bucket) {
  const response = await fetch(`${env.SUPABASE_URL}/storage/v1/bucket/${bucket}`, {
    headers: headers(env),
  });
  if (response.ok) {
    console.log(`  бакет «${bucket}» уже существует`);
    return;
  }
  const created = await fetch(`${env.SUPABASE_URL}/storage/v1/bucket`, {
    method: 'POST',
    headers: headers(env),
    body: JSON.stringify({
      id: bucket,
      name: bucket,
      public: false,
      // Ограничение размера объекта: 50 МБ — максимум, который принимает
      // Storage API проекта (большие значения отклоняются с 413).
      file_size_limit: 52428800,
    }),
  });
  const text = await created.text();
  if (!created.ok) {
    // Бакет мог быть создан ранее (409) — это не ошибка.
    if (created.status === 409) {
      console.log(`  бакет «${bucket}» уже существует (приватный)`);
      return;
    }
    throw new Error(`создание бакета -> ${created.status}: ${text.slice(0, 400)}`);
  }
  console.log(`  бакет «${bucket}» создан (приватный)`);
}

/** Загрузка одного файла в бакет (перезапись при повторе). */
async function uploadObject(env, bucket, objectPath, body, contentType) {
  const response = await fetch(`${env.SUPABASE_URL}/storage/v1/object/${bucket}/${objectPath}`, {
    method: 'PUT',
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': contentType,
      'x-upsert': 'true',
    },
    body,
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`загрузка ${objectPath} -> ${response.status}: ${text.slice(0, 400)}`);
  }
}

/** Строки каталога из payload бэкапа (массив или объект с `records`). */
function extractRows(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === 'object' && Array.isArray(payload.records))
    return payload.records;
  return [];
}

/**
 * Запись одной версии каталога в Postgres: снапшот + строки.
 *
 * Порядок: сначала создаётся новый снапшот и его строки, затем проверяется,
 * что строк ровно столько, сколько ожидалось, и только после этого удаляются
 * прежние версии источника. Если загрузка строк оборвалась, недозагруженный
 * снапшот удаляется — прежние данные остаются в силе.
 */
async function uploadSnapshot(env, source, snapshot, rows, keep) {
  const inserted = await rest(
    env,
    'POST',
    'catalog_snapshots?select=id',
    {
      source,
      fetched_at: snapshot.meta?.fetched_at ?? new Date().toISOString(),
      record_count: rows.length,
      endpoint: snapshot.meta?.endpoint ?? null,
      schema_version: snapshot.meta?.schema_version ?? 1,
      missing_columns: [],
      origin: 'backup',
      sha256: snapshot.meta?.checksum ?? null,
    },
    { Prefer: 'return=representation' },
  );
  const snapshotId = Array.isArray(inserted) ? inserted[0].id : inserted.id;

  try {
    for (let i = 0; i < rows.length; i += ROW_CHUNK) {
      const batch = rows.slice(i, i + ROW_CHUNK).map((data, j) => ({
        snapshot_id: snapshotId,
        ord: i + j,
        data,
      }));
      await rest(env, 'POST', 'catalog_rows', batch);
    }

    // Проверка полноты: в базе должно быть ровно столько строк, сколько записано.
    const counted = await fetch(
      `${env.SUPABASE_URL}/rest/v1/catalog_rows?select=snapshot_id&snapshot_id=eq.${snapshotId}&limit=1`,
      { headers: { ...headers(env), Prefer: 'count=exact', Range: '0-0' } },
    );
    const range = counted.headers.get('content-range') ?? '';
    const actual = Number.parseInt(range.split('/')[1] ?? '', 10);
    if (Number.isFinite(actual) && actual !== rows.length) {
      throw new Error(`записано ${actual} строк вместо ${rows.length}`);
    }
  } catch (error) {
    // Откат: удаляем недозагруженный снапшот (строки удаляются каскадом).
    await rest(env, 'DELETE', `catalog_snapshots?id=eq.${snapshotId}`).catch(() => undefined);
    throw error;
  }

  // Прежние версии источника удаляем только после успешной загрузки новой.
  // Новый снимок исключаем из выборки явно: у fallback-копии `fetched_at`
  // совпадает с прежним, и сортировка по одному полю не должна была бы
  // выбрать именно его на удаление.
  const stale = await rest(
    env,
    'GET',
    `catalog_snapshots?select=id&source=eq.${encodeURIComponent(source)}` +
      `&id=neq.${snapshotId}&order=fetched_at.desc,id.desc`,
  );
  if (Array.isArray(stale) && stale.length >= keep) {
    const ids = stale
      .slice(0, stale.length - keep + 1)
      .map((r) => r.id)
      .join(',');
    await rest(env, 'DELETE', `catalog_snapshots?id=in.(${ids})`);
  }

  return snapshotId;
}

/** Главный сценарий. */
async function main() {
  const root = process.cwd();
  const env = loadEnv(root);
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error(
      'Не заданы SUPABASE_URL и/или SUPABASE_SERVICE_ROLE_KEY.\n' +
        'Впишите их в `.env.local` в корне репозитория и повторите.',
    );
    process.exitCode = 1;
    return;
  }

  const args = parseArgs(process.argv.slice(2));
  const dir = args.dir ?? path.join(root, 'apps', 'server', 'data', 'backups');
  if (!existsSync(dir)) {
    console.error(`Каталог с бэкапами не найден: ${dir}`);
    process.exitCode = 1;
    return;
  }

  const isPat = env.SUPABASE_SERVICE_ROLE_KEY.startsWith('sbp_');
  env.SUPABASE_SERVICE_ROLE_KEY = await resolveKey(env);

  console.log(`Загрузка в Supabase: ${env.SUPABASE_URL}`);
  console.log(`Бакет: ${args.bucket}, каталог бэкапов: ${dir}\n`);

  // 1. Схема Postgres.
  let withTables = await tablesExist(env);
  if (!withTables && isPat) {
    const sql = readFileSync(path.join(root, 'supabase', 'schema.sql'), 'utf8');
    await applySchema(env, sql);
    withTables = await tablesExist(env);
    console.log(`  схема применена${withTables ? '' : ' (таблицы не видны)'}`);
  } else if (!withTables) {
    console.warn(
      '  ВНИМАНИЕ: таблицы catalog_snapshots/catalog_rows не найдены.\n' +
        '  Примените `supabase/schema.sql` в Supabase SQL Editor\n' +
        '  (или передайте Personal Access Token `sbp_…` вместо service_role ключа).\n' +
        '  Файлы в Storage будут загружены в любом случае.',
    );
  }

  // 2. Бакет.
  await ensureBucket(env, args.bucket);

  // 3. Файлы и строки.
  const keep = keepVersions(env);
  console.log(`  версий на источник в Postgres: ${keep}\n`);
  const manifest = [];
  for (const source of args.only) {
    const file = path.join(dir, source, 'latest.json');
    if (!existsSync(file)) {
      console.log(`  ${source}: нет файла ${file} — пропущен`);
      continue;
    }
    const raw = readFileSync(file);
    const snapshot = JSON.parse(raw.toString('utf8'));
    const rows = extractRows(snapshot.payload);

    await uploadObject(env, args.bucket, `catalog/${source}/latest.json`, raw, 'application/json');

    let snapshotId = null;
    if (withTables) {
      snapshotId = await uploadSnapshot(env, source, snapshot, rows, keep);
    }

    manifest.push({
      source,
      file: `catalog/${source}/latest.json`,
      bytes: raw.length,
      records: rows.length,
      fetched_at: snapshot.meta?.fetched_at ?? null,
      endpoint: snapshot.meta?.endpoint ?? null,
      checksum: snapshot.meta?.checksum ?? null,
      schema_version: snapshot.meta?.schema_version ?? 1,
      snapshot_id: snapshotId,
    });
    console.log(`  ${source}: ${rows.length} записей, snapshot id=${snapshotId ?? '—'}`);
  }

  // 3a. Слитый снимок каталога (тот же JSON, что отдаёт GET /api/catalog).
  // Файл крупный (десятки мегабайт), поэтому при превышении порога он
  // сжимается gzip: иначе он не влезает в лимит объекта бакета.
  const mergedFile = path.join(dir, 'merged', 'latest.json');
  let merged = null;
  if (existsSync(mergedFile)) {
    const raw = readFileSync(mergedFile);
    const snapshot = JSON.parse(raw.toString('utf8'));
    const useGzip = raw.length > GZIP_THRESHOLD;
    const body = useGzip ? gzipSync(raw, { level: 9 }) : raw;
    if (body.length > OBJECT_SIZE_LIMIT) {
      console.warn(
        `  merged: ${body.length} байт — больше лимита бакета (${OBJECT_SIZE_LIMIT}), пропущен`,
      );
    } else {
      await uploadObject(
        env,
        args.bucket,
        'catalog/merged/latest.json.gz',
        body,
        useGzip ? 'application/gzip' : 'application/json',
      );
      merged = {
        file: 'catalog/merged/latest.json.gz',
        compressed: useGzip,
        bytes: raw.length,
        uploaded_bytes: body.length,
        planets: snapshot.meta?.planet_count ?? null,
        snapshot_id: snapshot.meta?.snapshot_id ?? null,
        generated_at: snapshot.meta?.generated_at ?? null,
        checksum: snapshot.meta?.checksum ?? null,
      };
      console.log(
        `  merged: планет ${merged.planets ?? '—'}, снимок ${merged.snapshot_id ?? '—'}` +
          `${useGzip ? `, gzip ${body.length} байт` : ''}`,
      );
    }
  } else {
    console.log('  merged: файла merged/latest.json нет — пропущен');
  }

  // 4. Манифест бэкапа.
  const manifestBody = JSON.stringify(
    {
      generated_at: new Date().toISOString(),
      bucket: args.bucket,
      keep_versions: keep,
      sources: manifest,
      merged,
    },
    null,
    2,
  );
  await uploadObject(env, args.bucket, 'manifest.json', manifestBody, 'application/json');
  console.log(`  manifest.json: ${manifest.length} источников`);

  // 5. Контрольная сумма манифеста — для проверки целостности копии.
  const manifestSha = createHash('sha256').update(manifestBody).digest('hex');
  console.log(`\nsha256(manifest.json) = ${manifestSha}`);
  console.log('Готово.');
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
