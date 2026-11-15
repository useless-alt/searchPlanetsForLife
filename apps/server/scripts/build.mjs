#!/usr/bin/env node
/**
 * Сборка сервера в один ESM-файл (`dist/index.js`) через esbuild.
 *
 *   npm run build -w @exo/server
 *   node apps/server/dist/index.js
 *
 * `@exo/shared` — исходники TypeScript из workspace, поэтому он
 * собирается внутрь бандла. Fastify и `@fastify/compress` остаются внешними:
 * это обычные npm-зависимости, Node найдёт их в `node_modules`.
 *
 * Итог: для запуска не нужны ни tsx, ни TypeScript — только Node ≥ 20.
 */

import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

await build({
  absWorkingDir: packageRoot,
  entryPoints: ['src/index.ts'],
  outfile: 'dist/index.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  sourcemap: true,
  logLevel: 'info',
  // Зависимости ставятся из npm и не должны попадать в бандл.
  external: ['fastify', '@fastify/compress'],
  banner: {
    // Бандл в формате ESM, а часть зависимостей ожидает CommonJS-require.
    js: [
      "import { createRequire as __exoCreateRequire } from 'node:module';",
      'const require = __exoCreateRequire(import.meta.url);',
    ].join('\n'),
  },
});
