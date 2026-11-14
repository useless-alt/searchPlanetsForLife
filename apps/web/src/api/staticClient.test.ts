import type { CatalogResponse } from '@exo/shared';
import { describe, expect, it, vi } from 'vitest';

import { createStaticApiClient } from './staticClient';

/**
 * Тесты статического клиента каталога (GitHub Pages).
 *
 * Снимок — минимальный `CatalogResponse`: проверяется только разбор ответа
 * и семантика запросов, а не содержимое каталога.
 */

/** Минимальный снимок каталога для проверок. */
function makeCatalog(id = 'snap-1', planetCount = 2): CatalogResponse {
  return {
    snapshot: { id, builtAt: '2026-11-15T00:00:00.000Z', planetCount, schemaVersion: 1 },
    planets: [],
    sources: [
      { source: 'nasa', state: 'updated', backupAt: null, message: null },
      { source: 'exomast', state: 'pending', backupAt: null, message: null },
    ],
    stats: { inputPlanets: 0, mergedPlanets: 0, clusters: 0, duplicates: 0 },
  } as unknown as CatalogResponse;
}

/** Подменённый fetch, который отвечает одним и тем же снимком. */
function mockFetch(body: BodyInit | null, status = 200) {
  return vi.fn(
    async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(body, { status }),
  );
}

/** Клиент поверх подменённого fetch. */
function makeClient(fetchImpl: ReturnType<typeof mockFetch>) {
  return createStaticApiClient({
    baseUrl: 'https://pages.test/repo',
    fetchImpl: fetchImpl as unknown as typeof fetch,
  });
}

describe('статический клиент каталога', () => {
  it('читает снимок и отдаёт его как каталог', async () => {
    const fetchImpl = mockFetch(JSON.stringify(makeCatalog()));

    const result = await makeClient(fetchImpl).getCatalog();

    expect(result.notModified).toBe(false);
    if (result.notModified) throw new Error('ожидался снимок каталога');
    expect(result.catalog.snapshot.id).toBe('snap-1');
    expect(String(fetchImpl.mock.calls[0]?.[0])).toBe('https://pages.test/repo/data/catalog.json');
  });

  it('не пересчитывает тот же снимок (304)', async () => {
    const fetchImpl = mockFetch(JSON.stringify(makeCatalog('snap-7')));
    const client = makeClient(fetchImpl);

    const first = await client.getCatalog();
    expect(first.notModified).toBe(false);

    const second = await client.getCatalog('snap-7');
    expect(second).toEqual({ notModified: true });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('отдаёт статус «готово» из заголовка снимка', async () => {
    const fetchImpl = mockFetch(JSON.stringify(makeCatalog('snap-3')));

    const status = await makeClient(fetchImpl).getStatus();

    expect(status.phase).toBe('ready');
    expect(status.hasSnapshot).toBe(true);
    expect(status.refreshing).toBe(false);
    expect(status.sources).toHaveLength(2);
    expect(status.startedAt).toBe('2026-11-15T00:00:00.000Z');
  });

  it('после refresh перечитывает файл, а не кэш', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(makeCatalog('snap-1'))))
      .mockResolvedValueOnce(new Response(JSON.stringify(makeCatalog('snap-2'))));

    const client = makeClient(fetchImpl as unknown as ReturnType<typeof mockFetch>);

    await client.getCatalog();
    expect(await client.refresh()).toBe('started');

    const result = await client.getCatalog();
    if (result.notModified) throw new Error('ожидался новый снимок');
    expect(result.catalog.snapshot.id).toBe('snap-2');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('журнал ошибок в статике пуст', async () => {
    const fetchImpl = mockFetch(JSON.stringify(makeCatalog()));

    expect(await makeClient(fetchImpl).getErrors()).toEqual([]);
  });

  it('сообщает об отсутствии снимка', async () => {
    const fetchImpl = mockFetch(null, 404);

    await expect(makeClient(fetchImpl).getCatalog()).rejects.toThrow('не найден');
  });

  it('отвергает файл, который не похож на снимок', async () => {
    const fetchImpl = mockFetch(JSON.stringify({ hello: 'world' }));

    await expect(makeClient(fetchImpl).getCatalog()).rejects.toThrow('не похож на снимок');
  });
});
