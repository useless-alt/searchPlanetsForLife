import { EARTH, PENALTY, Q_DATA, SUN_TEFF } from '@/config';
import type { FieldKey, FieldValue, Origin, PlanetComputed } from '@/types';
import { massFromRadius, radiusFromMass } from './chen-kipping';
import { esiR, esiRho, esiS, esiT, esiVe } from './esi';
import { habitableZone, type HzResult } from './hz';
import { geomean, num } from './num';
import { pEcc, pRocky, pStar } from './penalties';

const ORIGIN_RANK: Record<Origin, number> = { measured: 0, physics: 1, model: 2 };

function worstOrigin(...origins: (Origin | null | undefined)[]): Origin {
  let worst: Origin = 'measured';
  for (const o of origins) {
    if (!o) continue;
    if (ORIGIN_RANK[o] > ORIGIN_RANK[worst]) worst = o;
  }
  return worst;
}

export function fieldNumber(fields: Record<FieldKey, FieldValue>, key: FieldKey): number | null {
  const f = fields[key];
  if (!f || f.value === null) return null;
  return typeof f.value === 'number' ? num(f.value) : num(f.value);
}

export function fieldString(fields: Record<FieldKey, FieldValue>, key: FieldKey): string | null {
  const f = fields[key];
  if (!f || f.value === null) return null;
  return String(f.value);
}

export interface SolveOptions {
  hzBound: 'conservative' | 'optimistic';
}

/**
 * Последовательно применяет Уровни А, Б и В.
 * Возвращает производные значения и их происхождение.
 */
export function solvePlanet(fields: Record<FieldKey, FieldValue>, options: SolveOptions): PlanetComputed {
  const rade = fieldNumber(fields, 'rade');
  const masse = fieldNumber(fields, 'masse');
  const eccMeasured = fieldNumber(fields, 'ecc');
  const teff = fieldNumber(fields, 'teff');
  const starRad = fieldNumber(fields, 'rad');
  const starMass = fieldNumber(fields, 'mass');
  const stLum = fieldNumber(fields, 'lum');
  const insol = fieldNumber(fields, 'insol');
  const orbper = fieldNumber(fields, 'orbper');
  const orbsmax = fieldNumber(fields, 'orbsmax');

  const origins: Partial<Record<FieldKey, Origin>> = {};
  for (const key of Object.keys(fields) as FieldKey[]) {
    if (fields[key].origin) origins[key] = fields[key].origin ?? undefined;
  }

  // Уровень А.1 — светимость
  let lum = stLum;
  if (lum === null && starRad !== null && teff !== null) {
    lum = starRad * starRad * Math.pow(teff / SUN_TEFF, 4);
    origins.lum = worstOrigin(origins.rad, origins.teff, 'physics');
  }

  // Уровень А.2 — a и P через третий закон Кеплера
  let a = orbsmax;
  let p = orbper;
  if (a === null && p !== null && starMass !== null && starMass > 0) {
    a = Math.cbrt(starMass * Math.pow(p / 365.25, 2));
    origins.orbsmax = worstOrigin(origins.orbper, origins.mass, 'physics');
  }
  if (p === null && a !== null && starMass !== null && starMass > 0 && a > 0) {
    p = 365.25 * Math.sqrt((a * a * a) / starMass);
    origins.orbper = worstOrigin(origins.orbsmax, origins.mass, 'physics');
  }

  // Уровень А.3 — эксцентриситет
  let ecc = eccMeasured;
  let eAssumed = false;
  if (ecc === null) {
    ecc = 0;
    eAssumed = true;
    origins.ecc = 'physics';
  }

  // Уровень Б — восстановление массы/радиуса
  let radius = rade;
  let mass = masse;
  let levelB = false;
  if (radius === null && mass !== null) {
    const derived = radiusFromMass(mass);
    if (derived !== null) {
      radius = derived;
      levelB = true;
      origins.rade = 'model';
    }
  }
  if (mass === null && radius !== null) {
    const derived = massFromRadius(radius);
    if (derived !== null) {
      mass = derived;
      levelB = true;
      origins.masse = 'model';
    }
  }

  // Уровень А.4 — поток
  let sFlux = insol;
  if (sFlux === null && lum !== null && a !== null && a > 0) {
    sFlux = lum / (a * a * Math.sqrt(Math.max(1e-9, 1 - ecc * ecc)));
    origins.insol = worstOrigin(origins.lum ?? 'physics', 'physics');
  }

  // Уровень А.5–6 — температуры
  const teq = sFlux !== null && sFlux > 0 ? 255 * Math.pow(sFlux, 0.25) : null;
  const ts = teq !== null ? teq + 33 : null;

  // Уровень А.7 — плотность и скорость убегания
  const rho = mass !== null && radius !== null && radius > 0 ? (5.51 * mass) / Math.pow(radius, 3) : null;
  const ve = mass !== null && radius !== null && radius > 0 ? Math.sqrt(mass / radius) : null;

  // Индексы
  const eR = esiR(radius);
  const eRho = esiRho(rho);
  const eVe = esiVe(ve);
  const eS = esiS(sFlux);
  const eT = esiT(ts);
  const esiInterior = geomean([eR, eRho, eVe], 3);
  const esi4 = geomean([eR, eRho, eVe, eT], 4);

  // Зона обитаемости
  const hz: HzResult = habitableZone(teff, lum, a, ecc, options.hzBound);

  const available = [eR, eRho, eVe, hz.fHz].filter((v) => v !== null).length;
  const insufficientData = available < 3;

  // Q_data
  const exemptEcc = eAssumed && p !== null && p < Q_DATA.eAssumedExemptPeriod;
  let qBase = 1;
  if (levelB) qBase -= Q_DATA.levelBPenalty;
  if (eAssumed && !exemptEcc) qBase -= Q_DATA.eAssumedPenalty;
  const qDataBase = Math.max(Q_DATA.floor, qBase);
  const excluded = 4 - available;
  const qDataAdaptive = Math.max(Q_DATA.floor, qBase - Q_DATA.excludedSubindexPenalty * excluded);

  const missing: string[] = [];
  if (radius === null) missing.push('радиус R');
  if (ts === null) missing.push('температура T_s');
  if (teff === null) missing.push('температура звезды');
  if (lum === null) missing.push('светимость звезды L');

  const computed: PlanetComputed = {
    radiusUsed: radius,
    massUsed: mass,
    semiMajorAxis: a,
    period: p,
    eccentricity: ecc,
    luminosity: lum,
    starTeff: teff,
    starRadius: starRad,
    starMass,
    sFlux,
    teq,
    ts,
    rho,
    ve,
    esiR: eR,
    esiRho: eRho,
    esiVe: eVe,
    esiS: eS,
    esiT: eT,
    esiInterior,
    esi4,
    fHz: hz.fHz,
    hzd: hz.hzd,
    dIn: hz.dIn,
    dOut: hz.dOut,
    dEff: hz.dEff,
    hzExtrapolated: hz.extrapolated,
    hzValid: hz.valid,
    eAssumed,
    levelB,
    insufficientData,
    availableSubindexes: available,
    pRocky: pRocky(radius),
    pEcc: pEcc(ecc),
    pStar: pStar(teff),
    qDataBase,
    qDataAdaptive,
    fHzOpt: null,
    hzdOpt: null,
    dInOpt: null,
    dOutOpt: null,
    hzOptValid: false,
    qDataAdaptiveOpt: qDataAdaptive,
    availableSubindexesOpt: available,
    origins,
    missing,
  };

  return computed;
}

/** Критерий «строгого научного» режима: ключевые поля только измерены. */
export function isStrictEligible(fields: Record<FieldKey, FieldValue>, computed: PlanetComputed): boolean {
  const o = computed.origins;
  const trueMass = fields.masse.isMinMass !== true;
  const hasOrbit = o.orbsmax === 'measured' || o.orbper === 'measured';
  const hasLum = o.lum === 'measured' || o.rad === 'measured';
  return (
    o.rade === 'measured' &&
    o.masse === 'measured' &&
    trueMass &&
    o.ecc === 'measured' &&
    hasOrbit &&
    o.teff === 'measured' &&
    o.mass === 'measured' &&
    hasLum
  );
}

const EARTH_VALUES: Record<FieldKey, number | string> = {
  rade: EARTH.radius,
  masse: EARTH.mass,
  orbper: EARTH.period,
  orbsmax: EARTH.semiMajorAxis,
  ecc: EARTH.ecc,
  insol: 1,
  teff: EARTH.teff,
  rad: 1,
  mass: EARTH.starMass,
  lum: EARTH.luminosity,
  spectype: 'G2V',
  dist: 0,
  ra: 0,
  dec: 0,
};

export const EARTH_FIELDS: Record<FieldKey, FieldValue> = Object.fromEntries(
  (Object.entries(EARTH_VALUES) as [FieldKey, number | string][]).map(([key, value]) => [
    key,
    {
      value,
      origin: 'measured' as Origin,
      source: null,
      fetchedAt: null,
      tier: null,
      conflict: false,
      alternatives: [],
    },
  ]),
) as unknown as Record<FieldKey, FieldValue>;

/** Калибровочная строка «Земля (эталон)». */
export function earthComputed(bound: 'conservative' | 'optimistic'): PlanetComputed {
  return solvePlanet(EARTH_FIELDS, { hzBound: bound });
}

export function defaultField(): FieldValue {
  return {
    value: null,
    origin: null,
    source: null,
    fetchedAt: null,
    tier: null,
    conflict: false,
    alternatives: [],
  };
}

export function starPenalty(teff: number | null): number {
  return teff !== null && teff < PENALTY.redDwarfTeff ? PENALTY.redDwarfFactor : 1;
}
