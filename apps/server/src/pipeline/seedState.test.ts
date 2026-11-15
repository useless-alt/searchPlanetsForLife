import type { MergeStats } from '@exo/shared';
import { describe, expect, it, vi } from 'vitest';

import type { BackupStore } from '../backup/store';
import type { ErrorLog } from './errorLog';
import type { Snapshot } from './snapshot';
import { createPipelineState } from './state';

/** Минимальная статистика для снимка. */
const STATS: MergeStats = {
  recordsBySource: { gaia: 0, exomast: 0, nasa: 1, exoplanet_eu: 0, simbad: 0, exomercat: 0 },
  uniquePlanets: 1,
  mergedClusters: 0,
  rejectedUnions: 0,
  sameSourceDuplicates: 0,
  ruleCounts: { R1: 0, R2: 0, R3: 0, R4: 0 },
  vetoed: 0,
};

/** Снимок, который сервер поднимает с диска до первого обновления. */
const SEED: Snapshot = {
  id: 'seed-snapshot',
  builtAt: '2026-11-15T00:00:00.000Z',
  planetCount: 1,
  schemaVersion: 1,
  // Для проверки кэша достаточно id: остальные поля не участвуют.
  planets: [{ id: 'p1', name: 'Планета 1' } as never],
  stats: STATS,
  sources: [
    { source: 'nasa', state: 'backup', backupAt: '2026-11-14T00:00:00.000Z', message: 'timeout' },
  ],
};

describe('стартовый снимок конвейера', () => {
  it('каталог доступен сразу, без обновления и обращений к сети', () => {
    const backup = {
      read: vi.fn(async () => null),
      write: vi.fn(),
      listVersions: vi.fn(async () => []),
      rollback: vi.fn(),
    } as unknown as BackupStore;
    const errorLog = { append: vi.fn(), load: vi.fn() } as unknown as ErrorLog;

    const state = createPipelineState({ backup, errorLog, initialSnapshot: SEED });

    expect(state.getStatus().phase).toBe('ready');
    expect(state.getStatus().hasSnapshot).toBe(true);
    expect(state.getStatus().refreshing).toBe(false);
    expect(state.getCatalog()?.snapshot.id).toBe('seed-snapshot');
    expect(state.getCatalog()?.planets).toHaveLength(1);
    expect(state.getPlanet('p1')?.name).toBe('Планета 1');
    expect(state.getStatus().sources[0]?.state).toBe('backup');
    expect(backup.read).not.toHaveBeenCalled();
  });

  it('без стартового снимка фаза остаётся idle', () => {
    const backup = {
      read: vi.fn(async () => null),
      write: vi.fn(),
      listVersions: vi.fn(async () => []),
      rollback: vi.fn(),
    } as unknown as BackupStore;
    const errorLog = { append: vi.fn(), load: vi.fn() } as unknown as ErrorLog;

    const state = createPipelineState({ backup, errorLog });
    expect(state.getStatus().phase).toBe('idle');
    expect(state.getCatalog()).toBeNull();
  });
});
