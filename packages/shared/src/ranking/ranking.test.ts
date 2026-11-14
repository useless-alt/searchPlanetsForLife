import { describe, expect, it } from 'vitest';

import { makeParam, nullParam } from '../physics/provenance';
import type { ParamValue } from '../types/provenance';
import {
  DEFAULT_FILTERS,
  DEFAULT_SETTINGS,
  type FilterState,
  type ModelSettings,
} from '../types/settings';
import type { CalcMode } from '../types/scoring';
import type { ResolvedPlanet, SolverFlags } from '../types/solver';

import { applyAttributeFilters, applyFilters, spectralClass, surfaceTemperature } from './filters';
import { CALC_MODE_ORDER, CALC_MODE_PRESETS, getCalcPreset } from './presets';
import { formatDelta } from './format';
import { computeRanking, type RankedRowWithPlanet } from './ranking';
import {
  classicIndexOf,
  isCandidate,
  scoreBreakdown,
  scoreClassicEsi,
  scorePlanet,
  scoreStrict,
} from './score';
import { DEFAULT_SORT, sortRows } from './sort';

/**
 * Тесты ранжирования Топ-50 (Задача 6).
 *
 * Планеты собираются напрямую из `ResolvedPlanet`, чтобы параметры (R, M,
 * rho, S, d, L, st_teff, e) задавались точно и порядок индексов был
 * предсказуем.
 */

const measured = (value: number | null): ParamValue => makeParam(value, 'measured');

function makeFlags(overrides: Partial<SolverFlags> = {}): SolverFlags {
  return {
    insufficient_data: false,
    levelB_mass: false,
    levelB_radius: false,
    e_assumed_zero: false,
    excluded_subindices: [],
    k: 4,
    n: 4,
    strict_complete: false,
    available: {
      ESI_R: true,
      ESI_rho: true,
      ESI_ve: true,
      ESI_S: true,
      ESI_T: true,
      F_HZ: true,
    },
    ...overrides,
  };
}

/** Значения параметров планеты; `null` — параметр отсутствует. */
interface PlanetValues {
  R?: number | null;
  M?: number | null;
  rho?: number | null;
  S?: number | null;
  T_eq?: number | null;
  d?: number | null;
  L?: number | null;
  st_teff?: number | null;
  e?: number | null;
  P?: number | null;
  dist_pc?: number | null;
}

function makePlanet(
  id: string,
  values: PlanetValues = {},
  flags: Partial<SolverFlags> = {},
): ResolvedPlanet {
  const value = (input: number | null | undefined): ParamValue =>
    input === undefined ? nullParam() : measured(input);

  return {
    id,
    R: value(values.R),
    M: value(values.M),
    e: value(values.e ?? 0),
    d: value(values.d),
    P: value(values.P),
    S: value(values.S),
    T_eq: value(values.T_eq),
    rho: value(values.rho),
    L: value(values.L),
    st_teff: value(values.st_teff),
    st_rad: nullParam(),
    st_mass: nullParam(),
    dist_pc: value(values.dist_pc),
    ra: nullParam(),
    dec: nullParam(),
    flags: makeFlags(flags),
  };
}

/** Землеподобная планета у солнеподобной звезды: полный набор данных. */
function earthLike(
  id: string,
  overrides: PlanetValues = {},
  flags: Partial<SolverFlags> = {},
): ResolvedPlanet {
  return makePlanet(
    id,
    {
      R: 1,
      M: 1,
      rho: 5.51,
      S: 1,
      T_eq: 255,
      d: 1,
      L: 1,
      st_teff: 5772,
      e: 0,
      P: 365.25,
      dist_pc: 1,
      ...overrides,
    },
    flags,
  );
}

const OPTIMISTIC: ModelSettings = { ...DEFAULT_SETTINGS, hzBounds: 'optimistic' };

/**
 * Тестовый набор из трёх планет с заданными порядками:
 *
 *   - по упрощённому ESI (R, S): A → B → C;
 *   - по RHI (F_HZ): B → A → C.
 *
 * Различие обеспечивается расстоянием d: у B — середина консервативной зоны
 * обитаемости (F_HZ = 1), у A — край зоны (F_HZ = 0.25), у C — вне зоны
 * (F_HZ = 0). Значение S убывает от A к C, поэтому упрощённый ESI даёт
 * A → B → C.
 */
const PLANET_A = earthLike('a', { S: 1, d: 1 });
const PLANET_B = earthLike('b', { S: 0.85, d: 1.313 });
const PLANET_C = earthLike('c', { S: 0.7, d: 2.5 });

const TRIO = [PLANET_A, PLANET_B, PLANET_C];

function filters(overrides: Partial<FilterState> = {}): FilterState {
  return { ...DEFAULT_FILTERS, ...overrides };
}

function settings(mode: CalcMode, overrides: Partial<ModelSettings> = {}): ModelSettings {
  return { ...DEFAULT_SETTINGS, mode, ...overrides };
}

function ids(rows: readonly RankedRowWithPlanet[]): string[] {
  return rows.map((row) => row.planetId);
}

describe('пресеты режимов', () => {
  it('четыре режима с подписями по 13.1', () => {
    expect(CALC_MODE_ORDER).toEqual(['adaptive', 'rhi', 'classic_esi', 'strict']);
    expect(CALC_MODE_PRESETS.adaptive.label).toBe('Адаптивный');
    expect(CALC_MODE_PRESETS.rhi.label).toBe('RHI');
    expect(CALC_MODE_PRESETS.classic_esi.label).toBe('Упрощённый ESI (R, S)');
    expect(CALC_MODE_PRESETS.strict.label).toBe('Строгий научный');
  });

  it('прежнее название режима хранится в подсказке classic_esi (U2)', () => {
    expect(getCalcPreset('classic_esi').hint).toContain('Классический ESI (эталон PHL)');
    expect(getCalcPreset('classic_esi').hint).toContain('ESI_S');
  });

  it('у каждого пресета есть формула и описание охвата', () => {
    for (const mode of CALC_MODE_ORDER) {
      const preset = getCalcPreset(mode);

      expect(preset.hint.length).toBeGreaterThan(0);
      expect(preset.coverage.length).toBeGreaterThan(0);
      expect(preset.mode).toBe(mode);
    }
  });
});

describe('оценка планеты', () => {
  it('адаптивный режим считает все доступные субиндексы', () => {
    const score = scorePlanet(earthLike('x'), DEFAULT_SETTINGS);

    expect(score).not.toBeNull();
    expect(score?.k).toBe(4);
    expect(score?.insufficient_data).toBe(false);
  });

  it('k = 2 даёт индекс 0.00 и insufficient_data', () => {
    const planet = makePlanet('sparse', { R: 1, L: 1, st_teff: 5772, d: 1 });
    const score = scorePlanet(planet, DEFAULT_SETTINGS);

    expect(score?.k).toBe(2);
    expect(score?.index).toBe(0);
    expect(score?.insufficient_data).toBe(true);
    expect(isCandidate(score!)).toBe(true);
  });

  it('RHI без F_HZ не оценивает планету (U20)', () => {
    const planet = makePlanet('no-hz', { R: 1, M: 1, rho: 5.51, S: 1 });

    expect(scorePlanet(planet, settings('rhi'))).toBeNull();
    expect(scoreBreakdown(planet, settings('rhi')).index).toBeNull();
    // В адаптивном режиме та же планета рассчитывается: хватает трёх подындексов.
    expect(scoreBreakdown(planet, DEFAULT_SETTINGS).index).toBeGreaterThan(0);
  });

  it('строгий режим не применяется к записи с пропуском (U19)', () => {
    expect(scoreStrict(earthLike('x'), DEFAULT_SETTINGS)).toBeNull();

    const full = earthLike('y', {}, { strict_complete: true });
    expect(scoreStrict(full, DEFAULT_SETTINGS)).not.toBeNull();
  });

  it('упрощённый ESI считается только по S и R', () => {
    const planet = makePlanet('rs', { R: 1, S: 1 });

    expect(scoreClassicEsi(planet, DEFAULT_SETTINGS)?.index).toBeCloseTo(1, 9);
    expect(scoreClassicEsi(makePlanet('no-s', { R: 1 }), DEFAULT_SETTINGS)).toBeNull();
  });

  it('границы зоны обитаемости берутся из настроек', () => {
    const conservative = scoreBreakdown(earthLike('x'), DEFAULT_SETTINGS);
    const optimistic = scoreBreakdown(earthLike('x'), OPTIMISTIC);

    expect(conservative.F_HZ).toBeCloseTo(0.25, 2);
    expect(optimistic.F_HZ).toBeCloseTo(0.74, 2);
  });
});

describe('классификация и фильтры', () => {
  it('спектральный класс определяется по порогам U9', () => {
    expect(spectralClass(3500)).toBe('M');
    expect(spectralClass(3900)).toBe('K');
    expect(spectralClass(5200)).toBe('G');
    expect(spectralClass(6000)).toBe('F');
    expect(spectralClass(7500)).toBe('A');
    expect(spectralClass(10000)).toBe('B');
    expect(spectralClass(30000)).toBe('O');
    expect(spectralClass(null)).toBeNull();
  });

  it('T_s = T_eq + 33', () => {
    expect(surfaceTemperature(255)).toBe(288);
    expect(surfaceTemperature(null)).toBeNull();
  });

  it('пустой список классов не ограничивает выборку', () => {
    const rows = [PLANET_A, PLANET_B].map((planet) => ({
      planet,
      score: scoreBreakdown(planet, DEFAULT_SETTINGS),
    }));

    expect(applyFilters(rows, filters(), DEFAULT_SETTINGS)).toHaveLength(2);
  });

  it('фильтр по классу M оставляет только красных карликов', () => {
    const dwarf = earthLike('dwarf', { st_teff: 3200, L: 0.01, d: 0.05 });

    const rows = [PLANET_A, dwarf].map((planet) => ({
      planet,
      score: scoreBreakdown(planet, DEFAULT_SETTINGS),
    }));

    const filtered = applyFilters(rows, filters({ spectralClasses: ['M'] }), DEFAULT_SETTINGS);

    expect(filtered.map((row) => row.planet.id)).toEqual(['dwarf']);
  });

  it('неизвестный класс при непустом списке отбрасывается', () => {
    const unknown = earthLike('unknown', { st_teff: null });

    const rows = [PLANET_A, unknown].map((planet) => ({
      planet,
      score: scoreBreakdown(planet, DEFAULT_SETTINGS),
    }));

    expect(applyFilters(rows, filters({ spectralClasses: ['M'] }), DEFAULT_SETTINGS)).toHaveLength(
      0,
    );
    expect(applyFilters(rows, filters(), DEFAULT_SETTINGS)).toHaveLength(2);
  });

  it('диапазон радиуса с одной границей ограничивает только снизу', () => {
    const rows = [earthLike('small', { R: 0.5 }), earthLike('big', { R: 3 })].map((planet) => ({
      planet,
      score: scoreBreakdown(planet, DEFAULT_SETTINGS),
    }));

    const filtered = applyFilters(
      rows,
      filters({ radius: { min: 1, max: null } }),
      DEFAULT_SETTINGS,
    );

    expect(filtered.map((row) => row.planet.id)).toEqual(['big']);
  });

  it('значение null при заданной границе отбрасывается', () => {
    const rows = [makePlanet('unknown-r', { M: 1, S: 1, L: 1, st_teff: 5772, d: 1 })].map(
      (planet) => ({ planet, score: scoreBreakdown(planet, DEFAULT_SETTINGS) }),
    );

    expect(applyAttributeFilters(rows, filters({ radius: { min: 1, max: null } }))).toHaveLength(0);
    expect(applyAttributeFilters(rows, filters())).toHaveLength(1);
  });

  it('диапазон температуры поверхности [230, 330] K', () => {
    const rows = [
      earthLike('cold', { T_eq: 180 }),
      earthLike('warm', { T_eq: 250 }),
      earthLike('hot', { T_eq: 400 }),
    ].map((planet) => ({ planet, score: scoreBreakdown(planet, DEFAULT_SETTINGS) }));

    const filtered = applyFilters(rows, filters({ T_s: { min: 230, max: 330 } }), DEFAULT_SETTINGS);

    expect(filtered.map((row) => row.planet.id)).toEqual(['warm']);
  });

  it('фильтр по эксцентриситету использует принятое значение 0', () => {
    const rows = [earthLike('circular', { e: 0 }), earthLike('elliptic', { e: 0.4 })].map(
      (planet) => ({ planet, score: scoreBreakdown(planet, DEFAULT_SETTINGS) }),
    );

    const filtered = applyFilters(rows, filters({ e: { min: 0.1, max: null } }), DEFAULT_SETTINGS);

    expect(filtered.map((row) => row.planet.id)).toEqual(['elliptic']);
  });

  it('порог Q_data отсекает планеты с низкой достоверностью', () => {
    const weak = earthLike('weak', {}, { levelB_mass: true, e_assumed_zero: true });
    const strong = earthLike('strong');

    const rows = [weak, strong].map((planet) => ({
      planet,
      score: scoreBreakdown(planet, DEFAULT_SETTINGS),
    }));

    const filtered = applyFilters(rows, filters(), { ...DEFAULT_SETTINGS, qMin: 0.9 });

    expect(filtered.map((row) => row.planet.id)).toEqual(['strong']);
  });

  it('ползунок Q_data работает независимо от чекбокса qdata', () => {
    const weak = earthLike('weak', {}, { levelB_mass: true, e_assumed_zero: true });

    const rows = [{ planet: weak, score: scoreBreakdown(weak, DEFAULT_SETTINGS) }];

    const withoutQ = applyFilters(rows, filters(), {
      ...DEFAULT_SETTINGS,
      qMin: 0.9,
      penalties: { ...DEFAULT_SETTINGS.penalties, qdata: false },
    });

    expect(withoutQ).toHaveLength(0);
  });

  it('кандидаты отбрасываются, если переключатель выключен', () => {
    const candidate = makePlanet('candidate', { R: 1, L: 1, st_teff: 5772, d: 1 });

    const rows = [candidate].map((planet) => ({
      planet,
      score: scoreBreakdown(planet, DEFAULT_SETTINGS),
    }));

    expect(applyFilters(rows, filters(), DEFAULT_SETTINGS)).toHaveLength(0);
    expect(applyFilters(rows, filters({ includeCandidates: true }), DEFAULT_SETTINGS)).toHaveLength(
      1,
    );
  });

  it('геометрические фильтры не зависят от порога Q_data и кандидатов', () => {
    const candidate = makePlanet('candidate', { R: 1, L: 1, st_teff: 5772, d: 1 });

    const rows = [candidate].map((planet) => ({
      planet,
      score: scoreBreakdown(planet, DEFAULT_SETTINGS),
    }));

    expect(applyAttributeFilters(rows, filters())).toHaveLength(1);
  });
});

describe('ранжирование', () => {
  it('порядок по RHI: B, A, C; сдвиг относительно упрощённого ESI', () => {
    const result = computeRanking(TRIO, settings('rhi'), filters());

    expect(ids(result.rows)).toEqual(['b', 'a', 'c']);

    const byId = new Map(result.rows.map((row) => [row.planetId, row]));

    expect(byId.get('b')?.rank).toBe(1);
    expect(byId.get('b')?.rankClassic).toBe(2);
    expect(byId.get('b')?.delta).toBe(1);

    expect(byId.get('a')?.rank).toBe(2);
    expect(byId.get('a')?.rankClassic).toBe(1);
    expect(byId.get('a')?.delta).toBe(-1);

    expect(byId.get('c')?.rank).toBe(3);
    expect(byId.get('c')?.rankClassic).toBe(3);
    expect(byId.get('c')?.delta).toBe(0);
  });

  it('формат сдвига: [+1], [-1], [0]', () => {
    const result = computeRanking(TRIO, settings('rhi'), filters());
    const byId = new Map(result.rows.map((row) => [row.planetId, row]));

    expect(formatDelta(byId.get('b')?.delta ?? null)).toBe('[+1]');
    expect(formatDelta(byId.get('a')?.delta ?? null)).toBe('[-1]');
    expect(formatDelta(byId.get('c')?.delta ?? null)).toBe('[0]');
    expect(formatDelta(null)).toBe('—');
  });

  it('в режиме classic_esi сдвиг равен нулю у всех', () => {
    const result = computeRanking(TRIO, settings('classic_esi'), filters());

    expect(ids(result.rows)).toEqual(['a', 'b', 'c']);

    for (const row of result.rows) {
      expect(row.delta).toBe(0);
    }
  });

  it('адаптивный режим: планета с k = 2 отсутствует без кандидатов и идёт последней с ними', () => {
    const sparse = makePlanet('sparse', { R: 1, L: 1, st_teff: 5772, d: 1 });
    const planets = [PLANET_A, sparse];

    const withoutCandidates = computeRanking(planets, settings('adaptive'), filters());

    expect(ids(withoutCandidates.rows)).toEqual(['a']);
    expect(withoutCandidates.counters.matching).toBe(1);

    const withCandidates = computeRanking(
      planets,
      settings('adaptive'),
      filters({ includeCandidates: true }),
    );

    expect(ids(withCandidates.rows)).toEqual(['a', 'sparse']);
    expect(withCandidates.rows[1]?.score.index).toBe(0);
    expect(withCandidates.rows[1]?.score.insufficient_data).toBe(true);
  });

  it('планета без F_HZ и без strict_complete не попадает в строки, но входит в total', () => {
    const noHz = makePlanet('no-hz', { R: 1, M: 1, rho: 5.51, S: 1 });

    const rhi = computeRanking([PLANET_A, noHz], settings('rhi'), filters());
    expect(ids(rhi.rows)).toEqual(['a']);
    expect(rhi.counters.total).toBe(2);

    const strict = computeRanking([PLANET_A, noHz], settings('strict'), filters());
    expect(ids(strict.rows)).toEqual([]);
    expect(strict.counters.total).toBe(2);
  });

  it('ранг непрерывен от 1 и строк не больше 50', () => {
    const many = Array.from({ length: 120 }, (_, index) =>
      earthLike(`p${index}`, { S: 0.4 + (index % 30) * 0.02, d: 0.6 + (index % 17) * 0.05 }),
    );

    const result = computeRanking(many, settings('rhi'), filters());

    expect(result.rows).toHaveLength(50);
    expect(result.rows.map((row) => row.rank)).toEqual(
      Array.from({ length: 50 }, (_, index) => index + 1),
    );
  });

  it('при малом числе подходящих планет строк меньше 50, при нуле — пустой список', () => {
    const few = computeRanking(TRIO, settings('rhi'), filters());
    expect(few.rows.length).toBeLessThan(50);

    const none = computeRanking(TRIO, settings('rhi'), filters({ spectralClasses: ['O'] }));

    expect(none.rows).toEqual([]);
    expect(none.counters.matching).toBe(0);
  });

  it('счётчики совпадают с тестовым набором', () => {
    const sparse = makePlanet('sparse', { R: 1, L: 1, st_teff: 5772, d: 1 });
    const noHz = makePlanet('no-hz', { R: 1, M: 1, rho: 5.51, S: 1 });
    const full = earthLike('full', {}, { strict_complete: true });

    const result = computeRanking([PLANET_A, sparse, noHz, full], settings('adaptive'), filters());

    expect(result.counters.total).toBe(4);
    // A, noHz и full рассчитаны; sparse — кандидат с нулевым баллом.
    expect(result.counters.computed).toBe(3);
    expect(result.counters.strictMeasured).toBe(1);
    // Кандидаты скрыты по умолчанию.
    expect(result.counters.matching).toBe(3);
  });

  it('оценки доступны для всех планет, null — если режим не применим', () => {
    const result = computeRanking(
      [PLANET_A, makePlanet('no-hz', { R: 1, M: 1, rho: 5.51, S: 1 })],
      settings('rhi'),
      filters(),
    );

    expect(result.scores.get('a')).not.toBeNull();
    expect(result.scores.get('no-hz')).toBeNull();
  });

  it('повторные планеты считаются один раз', () => {
    const result = computeRanking([PLANET_A, PLANET_A], settings('rhi'), filters());

    expect(result.counters.total).toBe(1);
    expect(result.rows).toHaveLength(1);
  });

  it('упрощённый ESI покрывает планеты только с S и R', () => {
    const simple = makePlanet('simple', { R: 1, S: 1 });

    const result = computeRanking([simple], settings('classic_esi'), filters());

    expect(ids(result.rows)).toEqual(['simple']);
    expect(result.rows[0]?.score.index).toBeCloseTo(1, 9);
    expect(result.rows[0]?.delta).toBe(0);
  });

  it('один вызов computeRanking пересчитывает результат под новые настройки', () => {
    const planets = TRIO;

    const before = computeRanking(planets, settings('rhi'), filters());

    // Смена режима.
    const otherMode = computeRanking(planets, settings('classic_esi'), filters());
    expect(ids(otherMode.rows)).not.toEqual(ids(before.rows));

    // Смена границ зоны обитаемости.
    const otherBounds = computeRanking(
      planets,
      settings('rhi', { hzBounds: 'optimistic' }),
      filters(),
    );
    expect(otherBounds.rows.map((row) => row.score.F_HZ)).not.toEqual(
      before.rows.map((row) => row.score.F_HZ),
    );

    // Смена чекбоксов штрафов.
    const otherPenalties = computeRanking(
      planets,
      settings('rhi', { penalties: { rocky: false, ecc: false, star: false, qdata: false } }),
      filters(),
    );
    expect(otherPenalties.rows.map((row) => row.score.index)).not.toEqual(
      before.rows.map((row) => row.score.index),
    );

    // Смена порога Q_data: планета с Q_data = 0.9 отсекается порогом 0.95.
    const weak = earthLike('weak', {}, { levelB_mass: true });
    expect(
      computeRanking([weak], settings('rhi'), filters({ includeCandidates: true })).rows,
    ).toHaveLength(1);
    expect(
      computeRanking([weak], settings('rhi', { qMin: 0.95 }), filters({ includeCandidates: true }))
        .rows,
    ).toHaveLength(0);

    // Смена фильтров.
    expect(
      computeRanking(planets, settings('rhi'), filters({ spectralClasses: ['O'] })).rows,
    ).toEqual([]);
  });

  it('базовый балл совпадает с режимом classic_esi', () => {
    const score = scoreBreakdown(PLANET_A, DEFAULT_SETTINGS);

    expect(classicIndexOf(score)).toBeCloseTo(
      scoreClassicEsi(PLANET_A, DEFAULT_SETTINGS)?.index ?? 0,
      12,
    );
  });
});

describe('сортировка отображения', () => {
  const rows = computeRanking(
    [
      earthLike('big', { R: 3, S: 0.8 }),
      earthLike('small', { R: 0.5, S: 0.8 }),
      earthLike('mid', { R: 1, S: 0.8 }),
    ],
    settings('rhi'),
    filters(),
  ).rows;

  it('по умолчанию строки идут по рангу', () => {
    expect(DEFAULT_SORT.key).toBe('rank');
    expect(rows.map((row) => row.rank)).toEqual([1, 2, 3]);
  });

  it('сортировка по радиусу не меняет ранги', () => {
    const sorted = sortRows(rows, { key: 'R', direction: 'asc' });

    expect(ids(sorted)).toEqual(['small', 'mid', 'big']);

    const ranksBefore = new Map(rows.map((row) => [row.planetId, row.rank]));
    const ranksAfter = new Map(sorted.map((row) => [row.planetId, row.rank]));

    expect(ranksAfter).toEqual(ranksBefore);
  });

  it('null всегда в конце независимо от направления', () => {
    const withNull = computeRanking(
      [earthLike('known', { S: 0.8 }), earthLike('unknown', { S: 0.8, dist_pc: null })],
      settings('rhi'),
      filters(),
    ).rows;

    const ascending = sortRows(withNull, { key: 'dist_pc', direction: 'asc' });
    const descending = sortRows(withNull, { key: 'dist_pc', direction: 'desc' });

    expect(ids(ascending)).toEqual(['known', 'unknown']);
    expect(ids(descending)).toEqual(['known', 'unknown']);
  });

  it('сортировка стабильна', () => {
    // Две строки с одинаковым радиусом: порядок не должен меняться.
    const template = rows.find((row) => row.planetId === 'mid') as RankedRowWithPlanet;
    const equal = [
      { ...template, planetId: 'first' },
      { ...template, planetId: 'second' },
    ];

    expect(ids(sortRows(equal, { key: 'R', direction: 'asc' }))).toEqual(['first', 'second']);
  });
});

describe('переключение границ зоны обитаемости', () => {
  /**
   * Набор для проверки смены границ: у планет одинаковые R, M и rho, поэтому
   * порядок по RHI определяется только F_HZ. Консервативная зона уже
   * оптимистичной, и планеты у её краёв меняются местами.
   */
  const edge = earthLike('x', { d: 1 });
  const outer = earthLike('y', { d: 1.6 });
  const outside = earthLike('z', { d: 2.5 });

  it('меняет F_HZ и порядок планет', () => {
    const conservative = computeRanking([edge, outer, outside], settings('rhi'), filters());
    const optimistic = computeRanking(
      [edge, outer, outside],
      settings('rhi', { hzBounds: 'optimistic' }),
      filters(),
    );

    expect(conservative.rows[0]?.score.F_HZ).not.toBe(optimistic.rows[0]?.score.F_HZ);
    expect(ids(conservative.rows)).toEqual(['y', 'x', 'z']);
    expect(ids(optimistic.rows)).toEqual(['x', 'y', 'z']);
  });
});

describe('производительность', () => {
  it('10 000 планет пересчитываются быстрее 200 мс', () => {
    const planets = Array.from({ length: 10000 }, (_, index) =>
      earthLike(`p${index}`, {
        R: 0.5 + (index % 40) * 0.1,
        M: 0.5 + (index % 30) * 0.2,
        rho: 3 + (index % 20) * 0.3,
        S: 0.2 + (index % 50) * 0.015,
        T_eq: 150 + (index % 100),
        d: 0.2 + (index % 25) * 0.06,
        L: 0.01 + (index % 10) * 0.1,
        st_teff: 2800 + (index % 40) * 100,
        e: (index % 10) * 0.05,
        dist_pc: 1 + (index % 500),
      }),
    );

    const model = settings('rhi');
    const state = filters();

    // Прогрев: первый вызов компилирует горячие пути.
    computeRanking(planets, model, state);

    const timings: number[] = [];

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const started = performance.now();
      computeRanking(planets, model, state);
      timings.push(performance.now() - started);
    }

    expect(Math.min(...timings)).toBeLessThan(200);
  });
});
