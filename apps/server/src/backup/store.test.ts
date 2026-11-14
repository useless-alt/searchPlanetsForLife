/**
 * Тесты хранилища резервных копий (п. 8.1–8.2).
 *
 * Рабочая папка — временная (os.tmpdir()), файлы после каждого теста удаляются.
 */

import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as NodeFsPromises from 'node:fs/promises';

import type { SourceId } from '@exo/shared';

import { computeChecksum } from './checksum';
import { BackupValidationError } from './errors';
import { VERSION_FILE_PATTERN } from './paths';
import { createBackupStore } from './store';

/** Имитация сбоя переименования latest.json. */
const mocks = vi.hoisted(() => ({ failLatestRename: false }));

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof NodeFsPromises>();
  return {
    ...actual,
    default: actual,
    rename: async (from: string, to: string) => {
      if (mocks.failLatestRename && String(to).endsWith('latest.json')) {
        throw new Error('EIO: имитация сбоя переименования latest.json');
      }
      return actual.rename(from, to);
    },
  };
});

const ENDPOINT = 'https://example.test/tap/sync';

/** Вспомогательная функция: список файлов каталога (пустой список, если нет). */
async function listFiles(dir: string): Promise<string[]> {
  try {
    return await readdir(dir);
  } catch {
    return [];
  }
}

describe('хранилище резервных копий', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'exo-backup-'));
    mocks.failLatestRename = false;
  });

  afterEach(async () => {
    mocks.failLatestRename = false;
    await rm(root, { recursive: true, force: true });
  });

  it('записывает копию и читает её обратно с полным набором метаданных', async () => {
    const store = createBackupStore({ dir: root, keepVersions: 5 });
    const payload = { rows: [{ id: 'a' }, { id: 'b' }] };

    const meta = await store.write('gaia', payload, { endpoint: ENDPOINT, recordCount: 2 });

    expect(Object.keys(meta).sort()).toEqual([
      'checksum',
      'endpoint',
      'fetched_at',
      'record_count',
      'schema_version',
      'source',
    ]);
    expect(meta.source).toBe('gaia');
    expect(meta.endpoint).toBe(ENDPOINT);
    expect(meta.record_count).toBe(2);
    expect(meta.schema_version).toBe(1);
    expect(meta.checksum).toBe(computeChecksum(payload));
    expect(meta.fetched_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);

    const result = await store.read('gaia');
    expect(result).not.toBeNull();
    expect(result?.payload).toEqual(payload);
    expect(result?.meta).toEqual(meta);
    expect(result?.recoveredFrom).toBeNull();

    const files = await listFiles(path.join(root, 'gaia'));
    expect(files).toContain('latest.json');
    expect(files.filter((name) => name !== 'latest.json')).toHaveLength(1);
    for (const name of files.filter((n) => n !== 'latest.json')) {
      expect(name).toMatch(VERSION_FILE_PATTERN);
    }
  });

  it('оставляет при семи записях ровно пять версий и latest.json', async () => {
    const store = createBackupStore({ dir: root, keepVersions: 5 });

    for (let i = 0; i < 7; i += 1) {
      await store.write('nasa', { rows: [{ i }] }, { endpoint: ENDPOINT, recordCount: 1 });
    }

    const files = await listFiles(path.join(root, 'nasa'));
    const versions = files.filter((name) => name !== 'latest.json');
    expect(versions).toHaveLength(5);
    expect(files).toContain('latest.json');
    for (const name of versions) {
      expect(name).toMatch(VERSION_FILE_PATTERN);
    }
    expect(await store.listVersions('nasa')).toHaveLength(5);
  });

  it('не меньше пяти версий, даже если запрошено меньше', async () => {
    const store = createBackupStore({ dir: root, keepVersions: 2 });

    for (let i = 0; i < 7; i += 1) {
      await store.write('nasa', { rows: [{ i }] }, { endpoint: ENDPOINT, recordCount: 1 });
    }

    const versions = (await store.listVersions('nasa')).length;
    expect(versions).toBe(5);
  });

  it('сохраняет прежний latest.json, если переименование latest.json сорвалось', async () => {
    const store = createBackupStore({ dir: root, keepVersions: 5 });
    await store.write('gaia', { v: 1 }, { endpoint: ENDPOINT, recordCount: 1 });
    const latestPath = path.join(root, 'gaia', 'latest.json');
    const before = await readFile(latestPath, 'utf8');

    mocks.failLatestRename = true;
    await expect(
      store.write('gaia', { v: 2 }, { endpoint: ENDPOINT, recordCount: 1 }),
    ).rejects.toThrow(/latest\.json/);
    mocks.failLatestRename = false;

    expect(await readFile(latestPath, 'utf8')).toBe(before);
    const result = await store.read('gaia');
    expect(result?.payload).toEqual({ v: 1 });
  });

  it('восстанавливается из версии, если latest.json урезан', async () => {
    const store = createBackupStore({ dir: root, keepVersions: 5 });
    await store.write('gaia', { v: 1 }, { endpoint: ENDPOINT, recordCount: 1 });
    await writeFile(path.join(root, 'gaia', 'latest.json'), '{"meta": {"source"', 'utf8');

    const result = await store.read('gaia');
    expect(result?.payload).toEqual({ v: 1 });
    expect(result?.recoveredFrom).not.toBeNull();
    expect(result?.recoveredFrom).toMatch(VERSION_FILE_PATTERN);
  });

  it('восстанавливается из версии, если payload изменён при прежней checksum', async () => {
    const store = createBackupStore({ dir: root, keepVersions: 5 });
    const payload = { v: 1 };
    await store.write('gaia', payload, { endpoint: ENDPOINT, recordCount: 1 });

    const latestPath = path.join(root, 'gaia', 'latest.json');
    const raw = JSON.parse(await readFile(latestPath, 'utf8')) as {
      meta: { checksum: string };
      payload: unknown;
    };
    raw.payload = { v: 999 };
    await writeFile(latestPath, JSON.stringify(raw), 'utf8');

    const result = await store.read('gaia');
    expect(result?.payload).toEqual(payload);
    expect(result?.recoveredFrom).not.toBeNull();
    expect(result?.meta.checksum).toBe(computeChecksum(payload));
  });

  it('не создаёт файлов при ошибках валидации', async () => {
    const store = createBackupStore({ dir: root, keepVersions: 5 });

    const empty = await store
      .write('gaia', { rows: [] }, { endpoint: ENDPOINT, recordCount: 0 })
      .catch((error: unknown) => error);
    expect(empty).toBeInstanceOf(BackupValidationError);
    expect((empty as BackupValidationError).reason).toBe('empty');

    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    const broken = await store
      .write('gaia', cyclic, { endpoint: ENDPOINT, recordCount: 1 })
      .catch((error: unknown) => error);
    expect(broken).toBeInstanceOf(BackupValidationError);
    expect((broken as BackupValidationError).reason).toBe('invalid_json');

    const missing = await store
      .write(
        'gaia',
        { rows: [{ id: 'a' }] },
        {
          endpoint: ENDPOINT,
          recordCount: 1,
          requiredFields: ['id', 'name'],
        },
      )
      .catch((error: unknown) => error);
    expect(missing).toBeInstanceOf(BackupValidationError);
    expect((missing as BackupValidationError).reason).toBe('missing_fields');

    expect(await listFiles(root)).toEqual([]);
    expect(await listFiles(path.join(root, 'gaia'))).toEqual([]);
  });

  it('выдаёт разные имена версий для двух записей в одну секунду', async () => {
    const store = createBackupStore({ dir: root, keepVersions: 5 });
    const now = new Date('2026-01-02T03:04:05.000Z');

    await store.write('gaia', { v: 1 }, { endpoint: ENDPOINT, recordCount: 1 }, now);
    await store.write('gaia', { v: 2 }, { endpoint: ENDPOINT, recordCount: 1 }, now);

    const versions = await store.listVersions('gaia');
    expect(versions).toHaveLength(2);
    expect(new Set(versions).size).toBe(2);
    expect(versions[0]).toBe('20260102_030406.json');
    expect(versions[1]).toBe('20260102_030405.json');
  });

  it('отклоняет некорректные источник и ключ кэша', async () => {
    const store = createBackupStore({ dir: root, keepVersions: 5 });

    const badKey = await store
      .write('gaia', { v: 1 }, { endpoint: ENDPOINT, recordCount: 1, key: '../x' })
      .catch((error: unknown) => error);
    expect(badKey).toBeInstanceOf(BackupValidationError);
    expect((badKey as BackupValidationError).reason).toBe('invalid_key');

    const badSource = await store
      .write('a/b' as SourceId, { v: 1 }, { endpoint: ENDPOINT, recordCount: 1 })
      .catch((error: unknown) => error);
    expect(badSource).toBeInstanceOf(BackupValidationError);
    expect((badSource as BackupValidationError).reason).toBe('invalid_key');

    expect(await listFiles(root)).toEqual([]);
  });

  it('раскладывает кэш Exo.MAST по подпапкам ключа', async () => {
    const store = createBackupStore({ dir: root, keepVersions: 5 });

    await store.write(
      'exomast',
      { rows: [{ id: 'kepler-22b' }] },
      { endpoint: ENDPOINT, recordCount: 1, key: 'kepler-22b' },
    );

    const files = await listFiles(path.join(root, 'exomast', 'kepler-22b'));
    expect(files).toContain('latest.json');
    expect(await store.listVersions('exomast', 'kepler-22b')).toHaveLength(1);
  });

  it('откатывает latest.json к старой версии', async () => {
    const store = createBackupStore({ dir: root, keepVersions: 5 });
    await store.write(
      'gaia',
      { v: 1 },
      { endpoint: ENDPOINT, recordCount: 1 },
      new Date('2026-01-02T03:04:05.000Z'),
    );
    await store.write(
      'gaia',
      { v: 2 },
      { endpoint: ENDPOINT, recordCount: 1 },
      new Date('2026-01-02T03:05:05.000Z'),
    );

    const versions = await store.listVersions('gaia');
    const old = versions[1] as string;
    const meta = await store.rollback('gaia', old);

    const result = await store.read('gaia');
    expect(result?.payload).toEqual({ v: 1 });
    expect(result?.meta.checksum).toBe(meta.checksum);
    // Версии при откате не удаляются.
    expect(await store.listVersions('gaia')).toHaveLength(2);
  });

  it('выполняет десять параллельных записей без повреждения файлов', async () => {
    const store = createBackupStore({ dir: root, keepVersions: 5 });

    await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        store.write('gaia', { rows: [{ i }] }, { endpoint: ENDPOINT, recordCount: 1 }),
      ),
    );

    const versions = await store.listVersions('gaia');
    expect(versions).toHaveLength(5);
    const dir = path.join(root, 'gaia');
    for (const name of versions) {
      const raw = JSON.parse(await readFile(path.join(dir, name), 'utf8')) as {
        meta: { checksum: string };
        payload: unknown;
      };
      expect(computeChecksum(raw.payload)).toBe(raw.meta.checksum);
    }
    const result = await store.read('gaia');
    expect(result).not.toBeNull();
    expect(result?.recoveredFrom).toBeNull();
  });

  it('не читает ничего, если копий нет', async () => {
    const store = createBackupStore({ dir: root, keepVersions: 5 });
    expect(await store.read('simbad')).toBeNull();
    expect(await store.listVersions('simbad')).toEqual([]);
  });

  it('откатывается к несуществующей версии с ошибкой', async () => {
    const store = createBackupStore({ dir: root, keepVersions: 5 });
    await store.write('gaia', { v: 1 }, { endpoint: ENDPOINT, recordCount: 1 });

    await expect(store.rollback('gaia', '20200101_000000.json')).rejects.toBeInstanceOf(
      BackupValidationError,
    );
    await expect(store.rollback('gaia', 'не-версия.json')).rejects.toBeInstanceOf(
      BackupValidationError,
    );
  });

  it('создаёт каталог источника при первой записи', async () => {
    const store = createBackupStore({ dir: root, keepVersions: 5 });
    await mkdir(root, { recursive: true });
    await store.write(
      'exoplanet_eu',
      { rows: [{ id: 'x' }] },
      {
        endpoint: ENDPOINT,
        recordCount: 1,
      },
    );
    expect(await listFiles(path.join(root, 'exoplanet_eu'))).toContain('latest.json');
  });
});
