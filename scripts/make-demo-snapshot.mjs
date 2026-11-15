#!/usr/bin/env node
/**
 * Демонстрационный снимок каталога для запуска без сети.
 *
 *   npm run data:demo
 *   node scripts/make-demo-snapshot.mjs --source=apps/server/data/backups/merged/latest.json
 *
 * Читает слитый снимок `npm run refresh` и кладёт его payload в
 * `data/demo/catalog.json.gz` (gzip, ~3 МБ вместо ~49 МБ).
 *
 * Зачем: сервер при старте поднимает каталог с диска (`pipeline/seed.ts`),
 * поэтому свежий клон работает сразу — даже если научные API недоступны.
 * Файл лежит в git (в отличие от `apps/server/data/`, который игнорируется).
 */

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

/** Разбор значения аргумента вида `--name=value`. */
function argValue(argv, name) {
  const prefix = `--${name}=`;
  const found = argv.find((arg) => arg.startsWith(prefix));
  return found === undefined ? null : found.slice(prefix.length);
}

const root = process.cwd();
const argv = process.argv.slice(2);
const source = path.resolve(
  root,
  argValue(argv, 'source') ??
    path.join('apps', 'server', 'data', 'backups', 'merged', 'latest.json'),
);
const target = path.resolve(
  root,
  argValue(argv, 'out') ?? path.join('data', 'demo', 'catalog.json.gz'),
);

if (!existsSync(source)) {
  console.error(
    `Нет слитого снимка: ${source}\n` + 'Сначала выполните `npm run refresh` (нужна сеть).',
  );
  process.exitCode = 1;
  process.exit();
}

let parsed;
try {
  parsed = JSON.parse(readFileSync(source, 'utf8'));
} catch {
  console.error(`Файл ${source} не разбирается как JSON.`);
  process.exitCode = 1;
  process.exit();
}

// `merged/latest.json` — конверт { meta, payload }; payload и нужен клиенту.
const payload = parsed?.payload ?? parsed;
if (!Array.isArray(payload?.planets) || payload.planets.length === 0) {
  console.error(`В файле ${source} нет payload.planets или каталог пуст.`);
  process.exitCode = 1;
  process.exit();
}

mkdirSync(path.dirname(target), { recursive: true });
const body = Buffer.from(JSON.stringify(payload), 'utf8');
writeFileSync(target, gzipSync(body, { level: 9 }));

const mb = (bytes) => (bytes / 1024 / 1024).toFixed(1);
console.log(
  `Демонстрационный снимок: ${path.relative(root, target)} — ` +
    `${mb(statSync(target).size)} МБ (исходный JSON ${mb(body.length)} МБ), ` +
    `планет ${payload.planets.length}`,
);
