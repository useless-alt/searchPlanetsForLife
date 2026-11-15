/**
 * Сквозной серверный тест конвейера (задача 31, п. 7 постановки).
 *
 * Тест поднимает настоящий `createPipelineState` и настоящие REST-маршруты,
 * но транспорт источников заменён подделками (`testing/fakeSources.ts`).
 * Поэтому проверяется полный путь: поддельные строки → нормализация →
 * слияние → решатель → снимок → ETag/304. Внешняя сеть не используется.
 */

import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  DATASET_IDS,
  DEFAULT_FILTERS,
  DEFAULT_SETTINGS,
  buildDatasetRecords,
  computeRanking,
  solveCatalog,
} from '@exo/shared';
import { afterEach, describe, expect, it } from 'vitest';

import { buildServer } from './index';
import { createTestPipeline, type TestPipeline } from './testing/fakeSources';

/** Каталоги, созданные тестом и удаляемые после каждого сценария. */
const tempDirs: string[] = [];

/** Создаёт конвейер во временном каталоге копий. */
async function createPipeline(env: NodeJS.ProcessEnv = {}): Promise<TestPipeline> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'exo-pipeline-e2e-'));
  tempDirs.push(dir);

  return createTestPipeline({ env, backupDir: dir });
}

/** Запускает полную сборку и дожидается её завершения. */
async function buildOnce(test: TestPipeline): Promise<void> {
  expect(test.pipeline.startRefresh()).toBe(true);
  await test.pipeline.waitForIdle();
}

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();

    if (dir !== undefined) await rm(dir, { recursive: true, force: true });
  }
});

describe('конвейер на поддельных источниках', () => {
  it('ставит места в Топ-50 без пропусков и по убыванию индекса', async () => {
    const test = await createPipeline();
    await buildOnce(test);

    const snapshot = test.pipeline.getSnapshot();

    expect(snapshot).not.toBeNull();

    // То же, что видит клиент: решатель → ранжирование по умолчанию.
    const resolved = solveCatalog(snapshot?.planets ?? []);
    const ranking = computeRanking(resolved, DEFAULT_SETTINGS, DEFAULT_FILTERS, {
      key: 'rank',
      direction: 'asc',
    });

    expect(ranking.rows).toHaveLength(50);

    // Места идут подряд 1…50, без повторов и пропусков.
    expect(ranking.rows.map((row) => row.rank)).toEqual(
      Array.from({ length: 50 }, (_, index) => index + 1),
    );

    // Порядок мест соответствует убыванию балла: у следующей планеты
    // индекс не выше, чем у предыдущей (null — в конце, по контракту сортировки).
    for (let index = 1; index < ranking.rows.length; index += 1) {
      const previous = ranking.rows[index - 1]?.score.index ?? null;
      const current = ranking.rows[index]?.score.index ?? null;

      if (previous === null) continue;
      if (current === null) continue;

      expect(current, `место ${index + 1}`).toBeLessThanOrEqual(previous);
    }

    // Сдвиг ранга — ровно разница между классическим местом и текущим.
    for (const row of ranking.rows) {
      if (row.rankClassic === null) {
        expect(row.delta).toBeNull();
      } else {
        expect(row.delta).toBe(row.rankClassic - row.rank);
      }
    }
  });

  it('превращает 82 входные записи в 80 уникальных планет и считает кластеры', async () => {
    const test = await createPipeline();
    await buildOnce(test);

    const snapshot = test.pipeline.getSnapshot();

    expect(snapshot).not.toBeNull();
    expect(snapshot?.planetCount).toBe(80);
    expect(snapshot?.stats.uniquePlanets).toBe(80);
    expect(snapshot?.stats.mergedClusters).toBe(1);

    // 82 планетные записи + одна синтетическая запись Gaia.
    const records = snapshot?.stats.recordsBySource;
    const total = records === undefined ? 0 : Object.values(records).reduce((a, b) => a + b, 0);

    expect(total).toBe(buildDatasetRecords().planets.length + 1);
  });

  it('отдаёт приоритет полям Gaia перед NASA (п. 7.3)', async () => {
    const test = await createPipeline();
    await buildOnce(test);

    const planet = test.pipeline.getPlanet(DATASET_IDS.strictOk01);

    expect(planet).not.toBeNull();
    expect(planet?.params.st_teff.value).toBe(6000);
    expect(planet?.params.st_teff.source).toBe('gaia');
    expect(planet?.params.st_rad.value).toBe(1.05);
    expect(planet?.params.st_mass.value).toBe(1.1);

    // Значение NASA сохраняется как альтернатива.
    expect(planet?.params.st_teff.alternatives.some((item) => item.source === 'nasa')).toBe(true);
  });

  it('сливает dup-* в одну планету с тремя источниками и значениями NASA', async () => {
    const test = await createPipeline();
    await buildOnce(test);

    const planet = test.pipeline.getPlanet(DATASET_IDS.dup);

    expect(planet).not.toBeNull();
    expect(planet?.sources).toEqual(['nasa', 'exoplanet_eu', 'exomercat']);
    expect(planet?.sources.length).toBe(3);

    // Каноническое имя и значения — из NASA: он выше Exoplanet.eu и Exo-MerCat.
    expect(planet?.name).toBe('NASA Dup-9999 b');
    expect(planet?.params.pl_rade.value).toBe(1.6);
    expect(planet?.params.pl_rade.source).toBe('nasa');
    expect(planet?.params.pl_orbper.value).toBe(300);
    expect(planet?.params.pl_orbper.source).toBe('nasa');
  });

  it('строит снимок при недоступном Gaia без копии и помечает источник error_no_backup', async () => {
    const test = await createPipeline({ EXO_FAIL: 'gaia:timeout' });
    await buildOnce(test);

    const snapshot = test.pipeline.getSnapshot();
    const status = test.pipeline.getStatus().sources.find((item) => item.source === 'gaia');

    expect(snapshot?.planetCount).toBe(80);
    expect(status?.state).toBe('error_no_backup');
    expect(status?.message).toContain('timeout');

    // Без Gaia температура остаётся измерением NASA.
    const planet = test.pipeline.getPlanet(DATASET_IDS.strictOk01);

    expect(planet?.params.st_teff.value).toBe(5780);
    expect(planet?.params.st_teff.source).toBe('nasa');

    const log = test.pipeline.getErrorLog().recent(10);

    expect(log.some((entry) => entry.source === 'gaia' && entry.reason === 'timeout')).toBe(true);
  });

  it('использует ранее положенную копию Gaia: статус backup и данные из копии', async () => {
    const test = await createPipeline({
      EXO_FAIL: 'gaia:timeout',
      EXO_PRESEED_BACKUPS: 'gaia',
    });
    await buildOnce(test);

    const status = test.pipeline.getStatus().sources.find((item) => item.source === 'gaia');
    const planet = test.pipeline.getPlanet(DATASET_IDS.strictOk01);

    expect(status?.state).toBe('backup');
    expect(status?.backupAt).not.toBeNull();
    expect(planet?.params.st_teff.value).toBe(6000);
    expect(planet?.params.st_teff.source).toBe('gaia');
  });

  it('при сбое NASA с копией продолжает расчёт на резервных данных', async () => {
    const test = await createPipeline({
      EXO_FAIL: 'nasa:http_500',
      EXO_PRESEED_BACKUPS: 'nasa',
    });
    await buildOnce(test);

    const snapshot = test.pipeline.getSnapshot();
    const status = test.pipeline.getStatus().sources.find((item) => item.source === 'nasa');

    expect(snapshot?.planetCount).toBe(80);
    expect(status?.state).toBe('backup');
    expect(status?.backupAt).toBe('2026-11-14T08:00:00.000Z');
  });

  it('пропускает источник без копии и строит снимок из остальных', async () => {
    const test = await createPipeline({ EXO_FAIL: 'exoplanet_eu:invalid_json' });
    await buildOnce(test);

    const snapshot = test.pipeline.getSnapshot();
    const status = test.pipeline.getStatus().sources.find((item) => item.source === 'exoplanet_eu');

    // 7 записей Exoplanet.eu отсутствуют, но дубль остаётся в NASA и
    // Exo-MerCat: 82 − 7 = 75 записей, 6 уникальных планет Exoplanet.eu
    // выпадают, значит уникальных планет 74.
    expect(status?.state).toBe('error_no_backup');
    expect(snapshot?.planetCount).toBe(74);
    expect(snapshot?.stats.recordsBySource.exoplanet_eu).toBe(0);
  });

  it('не запрашивает Exo.MAST при старте (U6)', async () => {
    const test = await createPipeline();
    await buildOnce(test);

    expect(test.exomast.requests()).toBe(0);

    const status = test.pipeline.getStatus().sources.find((item) => item.source === 'exomast');

    expect(status?.state).toBe('pending');
  });

  it('отдаёт ETag и повторный запрос с If-None-Match — 304', async () => {
    const test = await createPipeline();
    await buildOnce(test);

    const app = buildServer({ pipeline: test.pipeline, webRoot: null });

    try {
      const first = await app.inject({ method: 'GET', url: '/api/catalog' });
      const etag = first.headers['etag'];

      expect(first.statusCode).toBe(200);
      expect(typeof etag).toBe('string');
      expect(etag?.length).toBeGreaterThan(0);

      const second = await app.inject({
        method: 'GET',
        url: '/api/catalog',
        headers: { 'if-none-match': String(etag) },
      });

      expect(second.statusCode).toBe(304);
      expect(second.body).toBe('');
    } finally {
      await app.close();
    }
  });

  it('повторное обновление отвечает 202, а параллельное — 409', async () => {
    const test = await createPipeline();
    await buildOnce(test);

    const app = buildServer({ pipeline: test.pipeline, webRoot: null });

    try {
      const first = await app.inject({ method: 'POST', url: '/api/refresh' });
      const second = await app.inject({ method: 'POST', url: '/api/refresh' });

      expect(first.statusCode).toBe(202);
      expect(second.statusCode).toBe(409);

      await test.pipeline.waitForIdle();

      const status = await app.inject({ method: 'GET', url: '/api/status' });
      const body = status.json<{ phase: string; sources: unknown[] }>();

      expect(body.phase).toBe('ready');
      expect(body.sources).toHaveLength(6);
    } finally {
      await app.close();
    }
  });
});
