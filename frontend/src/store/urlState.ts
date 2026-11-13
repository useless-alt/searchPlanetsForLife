/** Сериализация режима, параметров модели, фильтров и закрепления в URL. */

import { DEFAULT_FILTERS, DEFAULT_MODEL, MODES, SPECTRAL_CLASS_LIST, type ModeId } from '@/config';
import type { Filters, ModelParams } from '@/types';

export type ViewTab = 'map' | 'system';

export interface UrlState {
  mode: ModeId;
  model: ModelParams;
  filters: Filters;
  pinnedId: string | null;
  tab: ViewTab;
}

function bool(value: string | null, fallback: boolean): boolean {
  if (value === null) return fallback;
  return value === '1' || value === 'true';
}

function numberOrNull(value: string | null): number | null {
  if (value === null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function range(min: string | null, max: string | null): [number, number] | null {
  const a = numberOrNull(min);
  const b = numberOrNull(max);
  if (a === null || b === null) return null;
  return a <= b ? [a, b] : [b, a];
}

export function readUrlState(search = typeof location !== 'undefined' ? location.search : ''): UrlState {
  const params = new URLSearchParams(search);
  const modeRaw = params.get('mode');
  const mode: ModeId = MODES.some((m) => m.id === modeRaw)
    ? (modeRaw as ModeId)
    : 'adaptive';

  const model: ModelParams = {
    hzBound: params.get('hz') === 'opt' ? 'optimistic' : 'conservative',
    penalizeRocky: bool(params.get('rocky'), DEFAULT_MODEL.penalizeRocky),
    penalizeEcc: bool(params.get('eccp'), DEFAULT_MODEL.penalizeEcc),
    penalizeStar: bool(params.get('starp'), DEFAULT_MODEL.penalizeStar),
    applyQData: bool(params.get('qdata'), DEFAULT_MODEL.applyQData),
    minQData: Math.min(100, Math.max(75, numberOrNull(params.get('minq')) ?? DEFAULT_MODEL.minQData)),
  };

  const spectral = (params.get('spec') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s): s is (typeof SPECTRAL_CLASS_LIST)[number] =>
      (SPECTRAL_CLASS_LIST as readonly string[]).includes(s),
    );

  const filters: Filters = {
    spectral,
    radius: range(params.get('rmin'), params.get('rmax')),
    ts: range(params.get('tmin'), params.get('tmax')),
    ecc: range(params.get('emin'), params.get('emax')),
    includeCandidates: bool(params.get('cand'), DEFAULT_FILTERS.includeCandidates),
  };

  const tabRaw = params.get('tab');
  return {
    mode,
    model,
    filters,
    pinnedId: params.get('pin') || null,
    tab: tabRaw === 'system' ? 'system' : 'map',
  };
}

export function writeUrlState(state: UrlState): void {
  if (typeof window === 'undefined') return;
  const params = new URLSearchParams(window.location.search);

  params.set('mode', state.mode);
  params.set('hz', state.model.hzBound === 'optimistic' ? 'opt' : 'cons');
  params.set('rocky', state.model.penalizeRocky ? '1' : '0');
  params.set('eccp', state.model.penalizeEcc ? '1' : '0');
  params.set('starp', state.model.penalizeStar ? '1' : '0');
  params.set('qdata', state.model.applyQData ? '1' : '0');
  params.set('minq', String(Math.round(state.model.minQData)));
  if (state.filters.spectral.length > 0) params.set('spec', state.filters.spectral.join(','));
  else params.delete('spec');
  if (state.filters.radius) {
    params.set('rmin', String(state.filters.radius[0]));
    params.set('rmax', String(state.filters.radius[1]));
  } else {
    params.delete('rmin');
    params.delete('rmax');
  }
  if (state.filters.ts) {
    params.set('tmin', String(state.filters.ts[0]));
    params.set('tmax', String(state.filters.ts[1]));
  } else {
    params.delete('tmin');
    params.delete('tmax');
  }
  if (state.filters.ecc) {
    params.set('emin', String(state.filters.ecc[0]));
    params.set('emax', String(state.filters.ecc[1]));
  } else {
    params.delete('emin');
    params.delete('emax');
  }
  params.set('cand', state.filters.includeCandidates ? '1' : '0');
  if (state.pinnedId) params.set('pin', state.pinnedId);
  else params.delete('pin');
  params.set('tab', state.tab);

  const next = `${window.location.pathname}?${params.toString()}${window.location.hash}`;
  if (next !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
    window.history.replaceState(null, '', next);
  }
}

export function emptyUrlState(): UrlState {
  return { mode: 'adaptive', model: { ...DEFAULT_MODEL }, filters: { ...DEFAULT_FILTERS }, pinnedId: null, tab: 'map' };
}
