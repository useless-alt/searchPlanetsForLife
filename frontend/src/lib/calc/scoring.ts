import { spectralClassFromTeff, type ModeId, type SpectralClass } from '@/config';
import type { Filters, PlanetComputed, PlanetEntity, RankedPlanet } from '@/types';
import { geomean } from './num';
import { isStrictEligible, fieldNumber, fieldString } from './solver';

export interface ScoreOptions {
  mode: ModeId;
  hzBound: 'conservative' | 'optimistic';
  penalizeRocky: boolean;
  penalizeEcc: boolean;
  penalizeStar: boolean;
  applyQData: boolean;
}

function fHzOf(c: PlanetComputed, bound: 'conservative' | 'optimistic'): number | null {
  return bound === 'optimistic' ? c.fHzOpt : c.fHz;
}

function adaptiveQ(c: PlanetComputed, bound: 'conservative' | 'optimistic'): number {
  return bound === 'optimistic' ? c.qDataAdaptiveOpt : c.qDataAdaptive;
}

function penaltyFactor(c: PlanetComputed, o: ScoreOptions): number {
  if (o.mode !== 'adaptive' && o.mode !== 'rhi') return 1;
  const rocky = o.penalizeRocky ? c.pRocky : 1;
  const ecc = o.penalizeEcc ? c.pEcc : 1;
  const star = o.penalizeStar ? c.pStar : 1;
  return rocky * ecc * star;
}

/** Итоговый индекс для выбранного режима; null — планета не ранжируется. */
export function scorePlanet(entity: PlanetEntity, o: ScoreOptions): number | null {
  const c = entity.computed;
  const fHz = fHzOf(c, o.hzBound);
  let base: number | null = null;

  switch (o.mode) {
    case 'adaptive':
      if (c.insufficientData) return 0;
      base = geomean([c.esiR, c.esiRho, c.esiVe, fHz], 3);
      break;
    case 'rhi':
      if (c.esiInterior !== null && fHz !== null) base = Math.sqrt(c.esiInterior * fHz);
      break;
    case 'classic':
      if (c.esiS !== null && c.esiR !== null) base = Math.sqrt(c.esiS * c.esiR);
      break;
    case 'strict':
      if (isStrictEligible(entity.fields, c) && c.esi4 !== null && fHz !== null) {
        base = Math.sqrt(c.esi4 * fHz);
      }
      break;
  }

  if (base === null || !Number.isFinite(base)) return null;
  const penalty = penaltyFactor(c, o);
  // Q_data входит в формулу только режимов 1 и 2; в classic/strict он не применяется.
  let q = 1;
  if (o.mode === 'adaptive') q = adaptiveQ(c, o.hzBound);
  else if (o.mode === 'rhi') q = c.qDataBase;
  const value = base * penalty * (o.applyQData ? q : 1);
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : null;
}

export function qBadge(q: number): 'Высокая' | 'Средняя' | 'Оценочная' {
  if (q >= 0.95) return 'Высокая';
  if (q >= 0.85) return 'Средняя';
  return 'Оценочная';
}

/** Q_data, который реально используется в выбранном режиме. */
export function qualityFor(
  entity: PlanetEntity,
  mode: ModeId,
  bound: 'conservative' | 'optimistic',
): number {
  const c = entity.computed;
  return mode === 'adaptive' ? adaptiveQ(c, bound) : c.qDataBase;
}

export function qBadgeClass(q: number): string {
  if (q >= 0.95) return 'badge-q-high';
  if (q >= 0.85) return 'badge-q-medium';
  return 'badge-q-low';
}

export function spectralClassOf(entity: PlanetEntity): SpectralClass | null {
  const spec = fieldString(entity.fields, 'spectype');
  if (spec) {
    const letter = spec.trim().charAt(0).toUpperCase();
    if ('MKGFABO'.includes(letter)) return letter as SpectralClass;
  }
  return spectralClassFromTeff(fieldNumber(entity.fields, 'teff'));
}

function passesFilters(entity: PlanetEntity, f: Filters): boolean {
  if (!f.includeCandidates && entity.status === 'candidate') return false;

  if (f.spectral.length > 0) {
    const cls = spectralClassOf(entity);
    if (!cls || !f.spectral.includes(cls)) return false;
  }
  const c = entity.computed;
  const radius = fieldNumber(entity.fields, 'rade');
  if (f.radius) {
    if (radius === null) return false;
    if (radius < f.radius[0] || radius > f.radius[1]) return false;
  }
  if (f.ts) {
    if (c.ts === null) return false;
    if (c.ts < f.ts[0] || c.ts > f.ts[1]) return false;
  }
  if (f.ecc) {
    const ecc = fieldNumber(entity.fields, 'ecc');
    if (ecc === null) return false;
    if (ecc < f.ecc[0] || ecc > f.ecc[1]) return false;
  }
  return true;
}

export interface RankingResult {
  ranked: RankedPlanet[];
  top: RankedPlanet[];
  total: number;
  calculated: number;
  strict: number;
  withoutCoords: number;
}

/** Ранжирование: score desc, Q_data desc, имя asc. Топ-50 строится после фильтров. */
export function buildRanking(
  entities: PlanetEntity[],
  options: ScoreOptions,
  filters: Filters,
  minQData = 75,
): RankingResult {
  const classicOptions: ScoreOptions = { ...options, mode: 'classic' };
  const classicScores = new Map<string, number>();
  for (const e of entities) {
    const s = scorePlanet(e, classicOptions);
    if (s !== null) classicScores.set(e.id, s);
  }
  const classicSorted = [...classicScores.entries()].sort((a, b) => b[1] - a[1]);
  const classicRank = new Map<string, number>();
  classicSorted.forEach(([id], i) => classicRank.set(id, i + 1));

  const all: RankedPlanet[] = entities.map((entity) => {
    const score = scorePlanet(entity, options);
    return {
      entity,
      score,
      classicRank: classicRank.get(entity.id) ?? null,
      rank: null,
      delta: null,
    };
  });

  const ranked = all.filter(
    (r) =>
      r.score !== null &&
      passesFilters(r.entity, filters) &&
      // k < 3 в адаптивном режиме: индекс 0.00, но запись не ранжируется и не входит в Топ-50.
      !(options.mode === 'adaptive' && r.entity.computed.insufficientData) &&
      qualityFor(r.entity, options.mode, options.hzBound) * 100 >= minQData,
  );
  ranked.sort((a, b) => {
    const sa = a.score ?? 0;
    const sb = b.score ?? 0;
    if (sb !== sa) return sb - sa;
    const qa = qualityFor(a.entity, options.mode, options.hzBound);
    const qb = qualityFor(b.entity, options.mode, options.hzBound);
    if (qb !== qa) return qb - qa;
    return (a.entity.names[0] ?? '').localeCompare(b.entity.names[0] ?? '', 'ru');
  });

  ranked.forEach((r, i) => {
    r.rank = i + 1;
    r.delta = r.classicRank !== null ? r.classicRank - r.rank : null;
  });

  const strict = entities.filter((e) => isStrictEligible(e.fields, e.computed)).length;

  return {
    ranked,
    top: ranked.slice(0, 50),
    total: entities.length,
    calculated: ranked.length,
    strict,
    withoutCoords: entities.filter((e) => {
      const ra = fieldNumber(e.fields, 'ra');
      const dec = fieldNumber(e.fields, 'dec');
      const dist = fieldNumber(e.fields, 'dist');
      return ra === null || dec === null || dist === null || dist <= 0;
    }).length,
  };
}
