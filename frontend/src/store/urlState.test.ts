// TEST FIXTURE: данные в этом файле используются только тестами.
import { afterEach, describe, expect, it } from 'vitest';
import { emptyUrlState, readUrlState, writeUrlState } from './urlState';
import { DEFAULT_MODEL } from '@/config';

afterEach(() => {
  window.history.replaceState(null, '', '/');
});

describe('readUrlState', () => {
  it('читает режим, модель, фильтры, pin и вкладку', () => {
    const state = readUrlState(
      '?mode=rhi&hz=opt&rocky=0&eccp=0&starp=0&qdata=0&minq=92&spec=M,K&rmin=1&rmax=2&tmin=200&tmax=400&emin=0&emax=0.2&cand=1&pin=e7&tab=system',
    );
    expect(state.mode).toBe('rhi');
    expect(state.model).toEqual({
      hzBound: 'optimistic',
      penalizeRocky: false,
      penalizeEcc: false,
      penalizeStar: false,
      applyQData: false,
      minQData: 92,
    });
    expect(state.filters.spectral).toEqual(['M', 'K']);
    expect(state.filters.radius).toEqual([1, 2]);
    expect(state.filters.ts).toEqual([200, 400]);
    expect(state.filters.ecc).toEqual([0, 0.2]);
    expect(state.filters.includeCandidates).toBe(true);
    expect(state.pinnedId).toBe('e7');
    expect(state.tab).toBe('system');
  });

  it('подставляет значения по умолчанию и отбрасывает мусор', () => {
    const state = readUrlState('?mode=nope&spec=X&rmin=2&rmax=1&minq=5&tab=weird');
    expect(state.mode).toBe('adaptive');
    expect(state.model.hzBound).toBe('conservative');
    expect(state.model.minQData).toBe(75);
    expect(state.filters.spectral).toEqual([]);
    expect(state.filters.radius).toEqual([1, 2]);
    expect(state.tab).toBe('map');
    expect(state.pinnedId).toBeNull();
  });

  it('пустая строка даёт значения по умолчанию', () => {
    const state = readUrlState('');
    expect(state.mode).toBe('adaptive');
    expect(state.model).toEqual(DEFAULT_MODEL);
    expect(state.filters.includeCandidates).toBe(false);
  });
});

describe('writeUrlState', () => {
  it('сериализует состояние и сохраняет посторонние параметры', () => {
    window.history.replaceState(null, '', '/?utm=test#hash');
    writeUrlState({
      mode: 'strict',
      model: {
        hzBound: 'optimistic',
        penalizeRocky: true,
        penalizeEcc: false,
        penalizeStar: true,
        applyQData: false,
        minQData: 88,
      },
      filters: {
        spectral: ['G', 'K'],
        radius: [0.5, 1.5],
        ts: [250, 320],
        ecc: [0, 0.1],
        includeCandidates: true,
      },
      pinnedId: 'e3',
      tab: 'system',
    });
    const params = new URLSearchParams(window.location.search);
    expect(window.location.hash).toBe('#hash');
    expect(params.get('utm')).toBe('test');
    expect(params.get('mode')).toBe('strict');
    expect(params.get('hz')).toBe('opt');
    expect(params.get('rocky')).toBe('1');
    expect(params.get('eccp')).toBe('0');
    expect(params.get('qdata')).toBe('0');
    expect(params.get('minq')).toBe('88');
    expect(params.get('spec')).toBe('G,K');
    expect(params.get('rmin')).toBe('0.5');
    expect(params.get('rmax')).toBe('1.5');
    expect(params.get('tmin')).toBe('250');
    expect(params.get('cand')).toBe('1');
    expect(params.get('pin')).toBe('e3');
    expect(params.get('tab')).toBe('system');
  });

  it('удаляет неактивные фильтры и pin', () => {
    window.history.replaceState(null, '', '/?spec=M&rmin=1&rmax=2&pin=e1');
    writeUrlState(emptyUrlState());
    const params = new URLSearchParams(window.location.search);
    expect(params.get('spec')).toBeNull();
    expect(params.get('rmin')).toBeNull();
    expect(params.get('rmax')).toBeNull();
    expect(params.get('pin')).toBeNull();
    expect(params.get('cand')).toBe('0');
    expect(params.get('tab')).toBe('map');
  });

  it('round-trip сохраняет состояние', () => {
    const state = {
      mode: 'classic' as const,
      model: { ...DEFAULT_MODEL, hzBound: 'optimistic' as const, minQData: 91 },
      filters: {
        spectral: ['F'],
        radius: [0.8, 2.4] as [number, number],
        ts: null,
        ecc: null,
        includeCandidates: false,
      },
      pinnedId: null,
      tab: 'map' as const,
    };
    window.history.replaceState(null, '', '/');
    writeUrlState(state);
    expect(readUrlState(window.location.search)).toEqual(state);
  });
});
