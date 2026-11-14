#!/usr/bin/env node
/**
 * Восстанавливает резервные копии источников из Supabase (перед обновлением в CI).
 *
 *   node scripts/restore-backups-from-supabase.mjs
 *   node scripts/restore-backups-from-supabase.mjs --force
 *
 * Зачем: на чистом runner GitHub Actions локальных копий нет, а конвейер
 * использует их как fallback, если источник не отвечает (п. 8.2). Без этого
 * шага временный сбой одного каталога ронял бы всю сборку страницы.
 *
 * По умолчанию уже существующие локальные файлы не перезаписываются
 * (локальная копия могла быть свежее); `--force` перезаписывает всё.
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { readFileSync } from 'node:fs';

const SOURCES = ['nasa', 'exoplanet_eu', 'exomercat', 'gaia', 'simbad'];
const BUCKET_DEFAULT = 'planet-backups';

/** Разбор файла `.env` в объект. */
function parseEnvFile(text) {
  const out = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    out[line.slice(0, eq).trim()] = line
      .slice(eq + 1)
      .trim()
      .replace(/^["']|["']$/g, '');
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

/** Разбор значения аргумента вида `--name=value`. */
function argValue(argv, name) {
  const prefix = `--${name}=`;
  const found = argv.find((arg) => arg.startsWith(prefix));
  return found === undefined ? null : found.slice(prefix.length);
}

const root = process.cwd();
const argv = process.argv.slice(2);
const env = loadEnv(root);
if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Не заданы SUPABASE_URL и/или SUPABASE_SERVICE_ROLE_KEY — восстанавливать нечего.');
  process.exitCode = 1;
  process.exit();
}

const dir = path.resolve(
  root,
  argValue(argv, 'dir') ?? path.join('apps', 'server', 'data', 'backups'),
);
const bucket = argValue(argv, 'bucket') ?? BUCKET_DEFAULT;
const force = argv.includes('--force');

const headers = {
  apikey: env.SUPABASE_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
};

let restored = 0;
for (const source of SOURCES) {
  const target = path.join(dir, source, 'latest.json');
  if (existsSync(target) && !force) {
    console.log(`  ${source}: локальная копия уже есть — пропущен`);
    continue;
  }

  const response = await fetch(
    `${env.SUPABASE_URL}/storage/v1/object/${bucket}/catalog/${source}/latest.json`,
    { headers },
  );
  if (!response.ok) {
    console.log(`  ${source}: в Supabase копии нет (${response.status}) — пропущен`);
    continue;
  }

  const body = Buffer.from(await response.arrayBuffer());
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, body);
  restored += 1;
  console.log(`  ${source}: восстановлено ${body.length} байт`);
}

console.log(`\nВосстановлено копий: ${restored} → ${dir}`);
