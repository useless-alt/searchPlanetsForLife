#!/usr/bin/env node
/**
 * Готовит статический снимок каталога для сборки веб-приложения (GitHub Pages).
 *
 *   node scripts/prepare-static-data.mjs
 *   node scripts/prepare-static-data.mjs --source=apps/server/data/backups/merged/latest.json
 *
 * Читает слитый снимок, собранный `npm run refresh`, и кладёт его в
 * `apps/web/public/data/catalog.json` — этот файл попадает в сборку и
 * читается клиентом `apps/web/src/api/staticClient.ts`.
 *
 * Файл кладётся обычным JSON: GitHub Pages сам сжимает `application/json`
 * при отдаче (~3 МБ вместо 49 МБ по сети).
 */

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/** Разбор значения аргумента вида `--name=value`. */
function argValue(argv, name) {
  const prefix = `--${name}=`;
  const found = argv.find((arg) => arg.startsWith(prefix));
  return found === undefined ? null : found.slice(prefix.length);
}

const root = process.cwd();
const source =
  argValue(process.argv.slice(2), 'source') ??
  path.join('apps', 'server', 'data', 'backups', 'merged', 'latest.json');
const outDir = path.resolve(
  root,
  argValue(process.argv.slice(2), 'out') ?? path.join('apps', 'web', 'public', 'data'),
);

const sourcePath = path.resolve(root, source);
if (!existsSync(sourcePath)) {
  console.error(
    `Нет слитого снимка: ${sourcePath}\n` +
      'Сначала выполните `npm run refresh` (или задайте --source=...).',
  );
  process.exitCode = 1;
  process.exit();
}

const raw = readFileSync(sourcePath);
let parsed;
try {
  parsed = JSON.parse(raw.toString('utf8'));
} catch {
  console.error(`Файл ${sourcePath} не разбирается как JSON.`);
  process.exitCode = 1;
  process.exit();
}

const payload = parsed?.payload;
if (payload?.snapshot === undefined || !Array.isArray(payload?.planets)) {
  console.error(`В файле ${sourcePath} нет payload.snapshot / payload.planets.`);
  process.exitCode = 1;
  process.exit();
}

mkdirSync(outDir, { recursive: true });
const target = path.join(outDir, 'catalog.json');
// Пишем только payload: клиенту не нужна обёртка { meta, payload }.
writeFileSync(target, JSON.stringify(payload));

const mb = (bytes) => (bytes / 1024 / 1024).toFixed(1);
const written = statSync(target).size;
console.log(
  `Статический снимок: ${path.relative(root, target)} — ` +
    `${mb(written)} МБ, планет ${payload.snapshot.planetCount}, ` +
    `снимок ${String(payload.snapshot.id).slice(0, 12)}…`,
);
