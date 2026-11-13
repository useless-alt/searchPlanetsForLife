/** Глобальное состояние приложения (Zustand) + URL-синхронизация. */

import { create } from 'zustand';
import { DEFAULT_FILTERS, DEFAULT_MODEL, type ModeId } from '@/config';
import type {
  ExoMastData,
  Filters,
  ModelParams,
  PipelineResult,
  PlanetEntity,
  SourceId,
} from '@/types';
import { buildRanking, type RankingResult } from '@/lib/calc/scoring';
import { PipelineClient } from '@/workers/client';
import { readUrlState, writeUrlState, type UrlState, type ViewTab } from './urlState';
import type { ProgressInfo } from '@/lib/pipeline/run';
import { fetchExoMast } from '@/lib/sources/exomast';

const initial: UrlState = readUrlState();

let client: PipelineClient | null = null;
let started = false;
let urlTimer: ReturnType<typeof setTimeout> | null = null;

interface AppState {
  mode: ModeId;
  model: ModelParams;
  filters: Filters;
  pinnedId: string | null;
  tab: ViewTab;
  cardOpen: boolean;
  mapResetToken: number;

  result: PipelineResult | null;
  progress: ProgressInfo;
  done: boolean;
  error: string | null;
  notice: string | null;

  exomast: Record<string, ExoMastData>;
  exomastLoading: Record<string, boolean>;

  setMode: (mode: ModeId) => void;
  setModel: (patch: Partial<ModelParams>) => void;
  resetModel: () => void;
  setFilters: (patch: Partial<Filters>) => void;
  resetFilters: () => void;
  setPinned: (id: string | null, options?: { openCard?: boolean; tab?: ViewTab }) => void;
  setTab: (tab: ViewTab) => void;
  setCardOpen: (open: boolean) => void;
  resetMap: () => void;
  setNotice: (notice: string | null) => void;

  startPipeline: () => void;
  refresh: () => void;
  rollback: (source: SourceId, key: string) => void;
  loadExoMast: (entity: PlanetEntity, force?: boolean) => Promise<void>;
}

function scheduleUrl(state: AppState): void {
  if (urlTimer) clearTimeout(urlTimer);
  urlTimer = setTimeout(() => {
    urlTimer = null;
    writeUrlState({
      mode: state.mode,
      model: state.model,
      filters: state.filters,
      pinnedId: state.pinnedId,
      tab: state.tab,
    });
  }, 150);
}

function getClient(
  get: () => AppState,
  set: (partial: Partial<AppState>) => void,
): PipelineClient {
  if (!client) {
    client = new PipelineClient({
      onProgress: (result, progress, done) => {
        set({ result, progress, done, error: null });
      },
      onError: (message) => {
        set({ error: message, done: true });
      },
    });
  }
  return client;
}

export const useAppStore = create<AppState>((set, get) => ({
  mode: initial.mode,
  model: initial.model,
  filters: initial.filters,
  pinnedId: initial.pinnedId,
  tab: initial.tab,
  cardOpen: Boolean(initial.pinnedId),
  mapResetToken: 0,

  result: null,
  progress: { completed: 0, total: 6, phase: 'Ожидание' },
  done: false,
  error: null,
  notice: null,

  exomast: {},
  exomastLoading: {},

  setMode: (mode) => {
    set({ mode });
    scheduleUrl(get());
  },
  setModel: (patch) => {
    set({ model: { ...get().model, ...patch } });
    scheduleUrl(get());
  },
  resetModel: () => {
    set({ model: { ...DEFAULT_MODEL } });
    scheduleUrl(get());
  },
  setFilters: (patch) => {
    set({ filters: { ...get().filters, ...patch } });
    scheduleUrl(get());
  },
  resetFilters: () => {
    set({ filters: { ...DEFAULT_FILTERS } });
    scheduleUrl(get());
  },
  setPinned: (id, options = {}) => {
    set({
      pinnedId: id,
      cardOpen: id !== null && options.openCard !== false,
      tab: options.tab ?? get().tab,
    });
    scheduleUrl(get());
  },
  setTab: (tab) => {
    set({ tab });
    scheduleUrl(get());
  },
  setCardOpen: (open) => set({ cardOpen: open }),
  resetMap: () => set({ mapResetToken: get().mapResetToken + 1 }),
  setNotice: (notice) => set({ notice }),

  startPipeline: () => {
    if (started) return;
    started = true;
    getClient(get, set).start(false);
  },
  refresh: () => {
    set({ error: null, done: false });
    getClient(get, set).start(true);
  },
  rollback: (source, key) => {
    getClient(get, set).useBackup(source, key);
    set({ notice: `Запрошен откат источника ${source} к версии ${key}` });
  },
  loadExoMast: async (entity, force = false) => {
    const cached = get().exomast[entity.id];
    if (cached && !force) return;
    if (get().exomastLoading[entity.id]) return;
    set({ exomastLoading: { ...get().exomastLoading, [entity.id]: true } });
    try {
      const name = entity.exomastName ?? entity.names[0];
      const data = await fetchExoMast(name);
      set({
        exomast: { ...get().exomast, [entity.id]: data },
        exomastLoading: { ...get().exomastLoading, [entity.id]: false },
      });
    } catch (err) {
      set({
        exomast: {
          ...get().exomast,
          [entity.id]: {
            canonicalName: entity.names[0] ?? null,
            fetchedAt: new Date().toISOString(),
            properties: null,
            spectraFiles: [],
            spectra: [],
            error: (err as Error).message,
          },
        },
        exomastLoading: { ...get().exomastLoading, [entity.id]: false },
      });
    }
  },
}));

/** Ранжирование на главном потоке через useMemo. */
export function rank(
  result: PipelineResult | null,
  mode: ModeId,
  model: ModelParams,
  filters: Filters,
): RankingResult | null {
  if (!result) return null;
  return buildRanking(
    result.entities,
    {
      mode,
      hzBound: model.hzBound,
      penalizeRocky: model.penalizeRocky,
      penalizeEcc: model.penalizeEcc,
      penalizeStar: model.penalizeStar,
      applyQData: model.applyQData,
    },
    filters,
    model.minQData,
  );
}
