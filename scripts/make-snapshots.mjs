#!/usr/bin/env node
/**
 * Удобная обёртка для запуска из корня репозитория:
 *   node scripts/make-snapshots.mjs [--live|--backups] [--only=...]
 * Вся работа выполняется frontend/scripts/make-snapshots.mjs, который
 * подгружает общие модули src/lib/sources через Vite.
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const frontend = path.resolve(here, '..', 'frontend');

const child = spawn(
  process.execPath,
  [path.join(frontend, 'scripts', 'make-snapshots.mjs'), ...process.argv.slice(2)],
  { cwd: frontend, stdio: 'inherit' },
);
child.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
child.on('error', (err) => {
  console.error(err);
  process.exitCode = 1;
});
