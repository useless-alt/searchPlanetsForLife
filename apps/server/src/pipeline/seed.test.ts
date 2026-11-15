import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

import { afterEach, describe, expect, it } from 'vitest';

import { loadSeedSnapshot, readSeedSnapshot, snapshotFromCatalogPayload } from './seed';

/** Временные каталоги, которые надо убрать после теста. */
const tempDirs: string[] = [];

/** Минимальная запись планеты: снимку достаточно `id` и `name`. */
function planet(id: string, name: string): Record<string, unknown> {
  return { id, name, params: {}, sources: ['nasa'], warnings: [], hostAliases: [] };
}

/** Ответ `GET /api/catalog` в минимальном виде. */
function catalogPayload(): Record<string, unknown> {
  return {
    snapshot: {
      id: 'abc123',
      builtAt: '2026-11-15T00:00:00.000Z',
      planetCount: 2,
      schemaVersion: 1,
    },
    planets: [planet('p1', 'Планета 1'), planet('p2', 'Планета 2')],
    sources: [{ source: 'nasa', state: 'updated', backupAt: null, message: null }],
    stats: {
      recordsBySource: {
        gaia: 0,
        exomast: 0,
        nasa: 2,
        exoplanet_eu: 0,
        simbad: 0,
        exomercat: 0,
      },
      uniquePlanets: 2,
      mergedClusters: 0,
      rejectedUnions: 0,
      sameSourceDuplicates: 0,
      ruleCounts: { R1: 0, R2: 0, R3: 0, R4: 0 },
      vetoed: 0,
    },
  };
}

/** Временный файл с содержимым. */
async function writeTemp(name: string, content: string | Buffer): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'exo-seed-'));
  tempDirs.push(dir);
  const filePath = path.join(dir, name);
  await writeFile(filePath, content);
  return filePath;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('snapshotFromCatalogPayload', () => {
  it('читает заголовок снимка и статистику', () => {
    const snapshot = snapshotFromCatalogPayload(catalogPayload());

    expect(snapshot).not.toBeNull();
    expect(snapshot?.id).toBe('abc123');
    expect(snapshot?.planetCount).toBe(2);
    expect(snapshot?.builtAt).toBe('2026-11-15T00:00:00.000Z');
    expect(snapshot?.planets.map((item) => item.id)).toEqual(['p1', 'p2']);
    expect(snapshot?.stats.uniquePlanets).toBe(2);
    expect(snapshot?.sources).toHaveLength(1);
  });

  it('достаёт payload из конверта merged/latest.json', () => {
    const snapshot = snapshotFromCatalogPayload({
      meta: { planet_count: 2 },
      payload: catalogPayload(),
    });
    expect(snapshot?.planetCount).toBe(2);
  });

  it('без заголовка считает id сам и подставляет пустую статистику', () => {
    const payload = catalogPayload();
    delete payload.snapshot;
    delete payload.stats;
    delete payload.sources;

    const snapshot = snapshotFromCatalogPayload(payload);
    expect(snapshot).not.toBeNull();
    expect(snapshot?.id).toHaveLength(64);
    expect(snapshot?.stats.uniquePlanets).toBe(2);
    expect(snapshot?.sources).toEqual([]);
  });

  it('пустой каталог и мусор не считаются снимком', () => {
    expect(snapshotFromCatalogPayload({ planets: [] })).toBeNull();
    expect(snapshotFromCatalogPayload(null)).toBeNull();
    expect(snapshotFromCatalogPayload('{}')).toBeNull();
    expect(snapshotFromCatalogPayload({ planets: [{ name: 'без id' }] })).toBeNull();
  });

  it('записи без id отбрасываются, остальные остаются', () => {
    const snapshot = snapshotFromCatalogPayload({
      planets: [planet('p1', 'Планета 1'), { name: 'мусор' }],
    });
    expect(snapshot?.planets).toHaveLength(1);
    expect(snapshot?.planetCount).toBe(1);
  });
});

describe('readSeedSnapshot', () => {
  it('читает обычный JSON', async () => {
    const filePath = await writeTemp('catalog.json', JSON.stringify(catalogPayload()));
    const seed = await readSeedSnapshot(filePath);

    expect(seed?.filePath).toBe(filePath);
    expect(seed?.snapshot.planetCount).toBe(2);
  });

  it('читает gzip', async () => {
    const filePath = await writeTemp(
      'catalog.json.gz',
      gzipSync(Buffer.from(JSON.stringify(catalogPayload()), 'utf8')),
    );
    const seed = await readSeedSnapshot(filePath);

    expect(seed?.snapshot.id).toBe('abc123');
  });

  it('отсутствующий файл, битый JSON и битый gzip не бросают исключений', async () => {
    expect(await readSeedSnapshot(path.join(os.tmpdir(), 'exo-no-such-file.json'))).toBeNull();

    const brokenJson = await writeTemp('broken.json', '{ не json');
    expect(await readSeedSnapshot(brokenJson)).toBeNull();

    const brokenGzip = await writeTemp('broken.json.gz', Buffer.from('не gzip', 'utf8'));
    expect(await readSeedSnapshot(brokenGzip)).toBeNull();
  });

  it('файл без планет считается непригодным', async () => {
    const filePath = await writeTemp('empty.json', JSON.stringify({ planets: [] }));
    expect(await readSeedSnapshot(filePath)).toBeNull();
  });
});

describe('loadSeedSnapshot', () => {
  it('пропускает пустые и битые пути и берёт первый пригодный', async () => {
    const broken = await writeTemp('broken.json', 'не json');
    const good = await writeTemp('catalog.json', JSON.stringify(catalogPayload()));

    const seed = await loadSeedSnapshot([null, '', broken, good]);
    expect(seed?.filePath).toBe(good);
  });

  it('если пригодных файлов нет — null', async () => {
    expect(await loadSeedSnapshot([undefined, null, ''])).toBeNull();
  });
});
