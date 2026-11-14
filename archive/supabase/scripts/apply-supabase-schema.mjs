#!/usr/bin/env node
/**
 * Применение схемы каталогов в Supabase через management API.
 *
 *   node scripts/apply-supabase-schema.mjs
 *
 * Требуется Personal Access Token (sbp_…) в SUPABASE_SERVICE_ROLE_KEY:
 * Dashboard -> Account -> Access Tokens. Схема берётся из supabase/schema.sql.
 * Пути к файлам определяются от расположения скрипта, поэтому его можно
 * запускать из любого каталога.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..');

function parseEnvFile(text) {
  const out = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    ) {
      value = value.slice(1, -1);
    }
    out[line.slice(0, eq).trim()] = value;
  }
  return out;
}

function loadEnv() {
  for (const name of ['.env.local', '.env']) {
    const file = path.join(repo, 'frontend', name);
    if (fs.existsSync(file)) return parseEnvFile(fs.readFileSync(file, 'utf8'));
  }
  return {};
}

const env = loadEnv();
if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error(
    'Не заданы SUPABASE_URL и/или SUPABASE_SERVICE_ROLE_KEY.\n' +
      'Впишите их в frontend/.env.local и повторите.',
  );
  process.exit(1);
}

const ref = new URL(env.SUPABASE_URL).hostname.split('.')[0];
const sql = fs.readFileSync(path.join(repo, 'schema.sql'), 'utf8');

const response = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
  method: 'POST',
  headers: {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ query: sql }),
});

console.log(`схема ${ref}:`, response.status, (await response.text()).slice(0, 400));
