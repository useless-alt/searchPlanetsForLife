// TEST FIXTURE: данные в этом файле используются только тестами.
import { describe, expect, it } from 'vitest';
import { parseSnapshot, snapshotUrl } from './snapshots';

const valid = {
  meta: {
    source: 'nasa',
    fetchedAt: '2026-11-14T00:00:00.000Z',
    recordCount: 1,
    endpoint: 'https://example.org/tap',
    schemaVersion: 1,
  },
  rows: [{ pl_name: 'TRAPPIST-1 e', pl_rade: 0.92 }],
};

describe('снимки public/data/snapshots', () => {
  it('валидирует корректный файл и сохраняет лишние поля meta', () => {
    const parsed = parseSnapshot({ ...valid, meta: { ...valid.meta, comment: 'demo' } });
    expect(parsed).not.toBeNull();
    expect(parsed?.rows).toHaveLength(1);
    expect(parsed?.meta.source).toBe('nasa');
    expect((parsed?.meta as Record<string, unknown>).comment).toBe('demo');
  });

  it('отвергает неизвестный источник', () => {
    expect(parseSnapshot({ ...valid, meta: { ...valid.meta, source: 'unknown' } })).toBeNull();
  });

  it('отвергает отсутствие meta или rows', () => {
    expect(parseSnapshot({ rows: [] })).toBeNull();
    expect(parseSnapshot({ meta: valid.meta })).toBeNull();
    expect(parseSnapshot(null)).toBeNull();
    expect(parseSnapshot('{}')).toBeNull();
  });

  it('отвергает не-объекты в rows', () => {
    expect(parseSnapshot({ ...valid, rows: [1, 2] })).toBeNull();
  });

  it('требует неотрицательный recordCount', () => {
    expect(parseSnapshot({ ...valid, meta: { ...valid.meta, recordCount: -1 } })).toBeNull();
  });

  it('строит URL с учётом base path', () => {
    expect(snapshotUrl('gaia')).toBe('/data/snapshots/gaia.json');
  });
});
