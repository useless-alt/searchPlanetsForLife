/**
 * Автономное обновление каталога без HTTP-сервера.
 *
 *   npm run refresh -w @exo/server
 *
 * Выполняет этапы 1–2 загрузки и слияние (п. 10.1), пишет резервные копии
 * источников через {@link createBackupStore} и слитый снимок каталога в
 * `${BACKUP_DIR}/merged/latest.json` — это тот же JSON, который отдаёт
 * `GET /api/catalog`, но без HTTP-обвязки.
 *
 * Код возврата:
 *   0 — снимок собран и записан;
 *   1 — каталог пуст либо новый снимок подозрительно меньше предыдущего;
 *       в этом случае прежний снимок остаётся в силе (замена только
 *       после успешного обновления).
 *
 * Порог уменьшения задаётся переменной `REFRESH_MIN_RATIO` (по умолчанию 0.5):
 * если число планет упало ниже `previous * ratio`, снимок не записывается.
 */

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { BACKUP_SCHEMA_VERSION } from '@exo/shared';

import { computeChecksum } from '../backup/checksum';
import { createBackupStore } from '../backup/store';
import { loadEnvFiles } from '../env';
import { createErrorLog } from '../pipeline/errorLog';
import { buildSnapshot, toCatalogResponse } from '../pipeline/snapshot';
import { runStages } from '../pipeline/stages';

/**
 * Источники, без которых снимок не считается полным.
 *
 * Если хоть один из них не дал данных (ни живым запросом, ни резервной
 * копией), прежний снимок остаётся в силе: неполный каталог не заменяет
 * полный. Список переопределяется переменной `REFRESH_REQUIRE_SOURCES`
 * (через запятую; пустое значение — проверка отключена).
 */
const REQUIRED_SOURCES = ['nasa', 'exoplanet_eu', 'exomercat', 'gaia', 'simbad'] as const;

/** Список обязательных источников с учётом переменной окружения. */
function requiredSources(): string[] {
  const raw = process.env.REFRESH_REQUIRE_SOURCES;
  if (raw === undefined) return [...REQUIRED_SOURCES];
  return raw
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

/** Корень репозитория: относительный `BACKUP_DIR` считается от него, а не от cwd. */
const REPO_ROOT = fileURLToPath(new URL('../../../../', import.meta.url));

/** Каталог резервных копий (тот же, что у сервера, п. 8.1). */
function backupDir(): string {
  const raw = process.env.BACKUP_DIR?.trim();
  return path.resolve(REPO_ROOT, raw && raw.length > 0 ? raw : 'data/backups');
}

/** Сколько версий копии хранить (п. 8.2). */
function keepVersions(): number {
  const parsed = Number.parseInt(process.env.BACKUP_KEEP_VERSIONS ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 5;
}

/** Доля от предыдущего числа планет, ниже которой снимок не заменяет старый. */
function minRatio(): number {
  const parsed = Number.parseFloat(process.env.REFRESH_MIN_RATIO ?? '');
  return Number.isFinite(parsed) && parsed > 0 && parsed <= 1 ? parsed : 0.5;
}

/** Метаданные слитого снимка. */
interface MergedMeta {
  /** Время сборки (ISO 8601). */
  generated_at: string;
  /** Идентификатор снимка (SHA-256 от списка планет) — он же ETag. */
  snapshot_id: string;
  /** Число планет после слияния. */
  planet_count: number;
  /** Контрольная сумма payload. */
  checksum: string;
  /** Версия схемы данных. */
  schema_version: number;
}

/** Число планет в прежнем слитом снимке; 0 — снимка нет. */
async function previousPlanetCount(filePath: string): Promise<number> {
  try {
    const parsed: unknown = JSON.parse(await readFile(filePath, 'utf8'));
    if (parsed === null || typeof parsed !== 'object') return 0;
    const envelope = parsed as { meta?: { planet_count?: unknown } };
    const count = envelope.meta?.planet_count;
    return typeof count === 'number' && Number.isFinite(count) ? count : 0;
  } catch {
    return 0;
  }
}

/** Запись файла атомарно: временный файл + переименование. */
async function writeAtomic(filePath: string, data: string): Promise<void> {
  const tmpPath = `${filePath}.tmp`;
  await writeFile(tmpPath, data, 'utf8');
  await rename(tmpPath, filePath);
}

/** Главный сценарий. */
async function main(): Promise<void> {
  // `.env` / `.env.local`: BACKUP_DIR, REFRESH_* и таймауты (п. 1.3).
  loadEnvFiles();
  const dir = backupDir();
  const mergedDir = path.join(dir, 'merged');
  const mergedLatest = path.join(mergedDir, 'latest.json');

  const backup = createBackupStore({ dir, keepVersions: keepVersions() });
  const errorLog = createErrorLog();
  await errorLog.load();

  console.log('[refresh] загрузка источников…');
  const result = await runStages({
    backup,
    logError: (entry) => errorLog.append(entry),
  });

  for (const status of result.statuses) {
    const suffix = status.message === null ? '' : ` — ${status.message}`;
    console.log(`  ${status.source}: ${status.state}${suffix}`);
  }
  console.log(`[refresh] планет после слияния: ${result.planets.length}`);

  if (result.planets.length === 0) {
    console.error('[refresh] каталог пуст — прежний снимок остаётся в силе');
    process.exitCode = 1;
    return;
  }

  // Проверка полноты: все обязательные источники должны дать данные.
  const required = requiredSources();
  const missing = result.statuses.filter(
    (status) =>
      required.includes(status.source) && status.state !== 'updated' && status.state !== 'backup',
  );
  if (missing.length > 0) {
    for (const status of missing) {
      console.error(
        `[refresh] источник ${status.source}: ${status.state} — ${status.message ?? ''}`,
      );
    }
    console.error(
      '[refresh] обновление неполное — прежний снимок остаётся в силе ' +
        '(замена только после успешного обновления)',
    );
    process.exitCode = 1;
    return;
  }

  const previous = await previousPlanetCount(mergedLatest);
  const ratio = minRatio();
  if (previous > 0 && result.planets.length < previous * ratio) {
    console.error(
      `[refresh] новый снимок заметно меньше прежнего ` +
        `(${result.planets.length} < ${previous} * ${ratio}) — замена отменена`,
    );
    process.exitCode = 1;
    return;
  }

  const snapshot = buildSnapshot({
    planets: result.planets,
    stats: result.stats,
    sources: result.statuses,
  });
  const payload = toCatalogResponse(snapshot, result.statuses);
  const meta: MergedMeta = {
    generated_at: snapshot.builtAt,
    snapshot_id: snapshot.id,
    planet_count: snapshot.planetCount,
    checksum: computeChecksum(payload),
    schema_version: BACKUP_SCHEMA_VERSION,
  };

  await mkdir(mergedDir, { recursive: true });
  const body = JSON.stringify({ meta, payload });
  await writeAtomic(mergedLatest, body);

  // Версионная копия слитого снимка — для истории и отката.
  const now = new Date();
  const stamp = [
    now.getUTCFullYear(),
    String(now.getUTCMonth() + 1).padStart(2, '0'),
    String(now.getUTCDate()).padStart(2, '0'),
    '_',
    String(now.getUTCHours()).padStart(2, '0'),
    String(now.getUTCMinutes()).padStart(2, '0'),
    String(now.getUTCSeconds()).padStart(2, '0'),
  ].join('');
  await writeAtomic(path.join(mergedDir, `${stamp}.json`), body);

  console.log(
    `[refresh] слитый снимок записан: ${mergedLatest} ` +
      `(snapshot ${snapshot.id.slice(0, 12)}…, планет ${snapshot.planetCount})`,
  );
}

main().catch((error: unknown) => {
  console.error('[refresh] обновление не удалось:', error);
  process.exitCode = 1;
});
