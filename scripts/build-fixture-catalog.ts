import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  BACKUP_SCHEMA_VERSION,
  SOURCE_PRIORITY,
  buildDatasetRecords,
  type CatalogResponse,
  type SourceStatus,
} from '@exo/shared';

import { mergeCatalog } from '../apps/server/src/merge/mergeCatalog';

/**
 * Собирает заглушку ответа `GET /api/catalog` для e2e и скриншотов
 * (задача 27a).
 *
 * Вход — детерминированный набор `buildDatasetRecords()`, проходящий через
 * настоящий `mergeCatalog`. Выход — `e2e/fixtures/catalog.json` в формате
 * `CatalogResponse`; файл в git не хранится (`.gitignore`), его создаёт
 * `npm run pretest:shots`.
 *
 * Сеть не нужна: ни один источник не вызывается.
 */

/** Время сборки снимка: фиксировано, чтобы кадры не зависели от даты. */
const BUILT_AT = '2026-11-14T09:00:00.000Z';

/** Шесть статусов «обновлено» в порядке приоритета источников. */
const SOURCES: SourceStatus[] = SOURCE_PRIORITY.map((source) => ({
  source,
  state: 'updated',
  backupAt: null,
  message: null,
}));

const { planets, stars } = buildDatasetRecords();
const merged = mergeCatalog({ planets, stars });

const catalog: CatalogResponse = {
  snapshot: {
    id: createHash('sha256').update(JSON.stringify(merged.planets)).digest('hex'),
    builtAt: BUILT_AT,
    planetCount: merged.planets.length,
    schemaVersion: BACKUP_SCHEMA_VERSION,
  },
  planets: merged.planets,
  sources: SOURCES,
  stats: merged.stats,
};

const target = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../e2e/fixtures/catalog.json',
);

mkdirSync(path.dirname(target), { recursive: true });
writeFileSync(target, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8');

console.log(
  `[build-fixture-catalog] ${merged.planets.length} планет → ${path.relative(process.cwd(), target)}`,
);
