#!/usr/bin/env node
/**
 * Сборка веб-приложения для GitHub Pages (статический режим).
 *
 *   node scripts/build-pages.mjs
 *   node scripts/build-pages.mjs --base=/searchPlanetsForLife/
 *
 * Шаги:
 * 1. `prepare-static-data.mjs` — слитый снимок → `apps/web/public/data/catalog.json.gz`;
 * 2. `vite build` с `VITE_STATIC_DATA=1` и `VITE_BASE=<база путей>`.
 *
 * Переменные выставляются здесь, а не в npm-скрипте: на Windows нельзя
 * задать их в строке скрипта без cross-env.
 */

import { spawnSync } from 'node:child_process';
import path from 'node:path';

/** Разбор значения аргумента вида `--name=value`. */
function argValue(argv, name) {
  const prefix = `--${name}=`;
  const found = argv.find((arg) => arg.startsWith(prefix));
  return found === undefined ? null : found.slice(prefix.length);
}

const root = process.cwd();
const base = argValue(process.argv.slice(2), 'base') ?? '/';
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

/** Запуск дочернего процесса без оболочки; ошибка прерывает сборку. */
function runNode(script) {
  const result = spawnSync(process.execPath, [script], {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
  });

  if (result.status !== 0) {
    console.error(`Команда завершилась с кодом ${result.status ?? 'null'}: ${script}`);
    process.exit(result.status ?? 1);
  }
}

/** Запуск команды через оболочку (npm на Windows — это npm.cmd). */
function runShell(commandLine, env) {
  const result = spawnSync(commandLine, {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, ...env },
    shell: true,
  });

  if (result.status !== 0) {
    console.error(`Команда завершилась с кодом ${result.status ?? 'null'}: ${commandLine}`);
    process.exit(result.status ?? 1);
  }
}

runNode(path.join('scripts', 'prepare-static-data.mjs'));

console.log(`Сборка для GitHub Pages: base=${base}, режим данных — статический`);
runShell(`${npm} run build -w @exo/web`, {
  VITE_STATIC_DATA: '1',
  VITE_BASE: base,
});

console.log('Готово: apps/web/dist');
