#!/usr/bin/env node
/**
 * Запускает scripts/snapshot-runner.ts через Vite (ssrLoadModule),
 * чтобы генератор снимков использовал ровно те же модули, что и приложение.
 *
 *   node scripts/make-snapshots.mjs                 LIVE -> data/backups
 *   node scripts/make-snapshots.mjs --backups       только data/backups
 *   node scripts/make-snapshots.mjs --live          только LIVE
 *   node scripts/make-snapshots.mjs --only=nasa,gaia
 *   node scripts/make-snapshots.mjs --out=public/data/snapshots
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

const server = await createServer({
  root,
  configFile: path.join(root, 'vite.config.ts'),
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'warn',
});

try {
  const module = await server.ssrLoadModule('/scripts/snapshot-runner.ts');
  const code = await module.run(process.argv.slice(2));
  process.exitCode = code;
} catch (err) {
  console.error(err);
  process.exitCode = 1;
} finally {
  await server.close();
}
