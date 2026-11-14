/** Модель данных: сущность планеты, кандидаты полей, статусы источников. */

export type SourceId = 'nasa' | 'exomercat' | 'exoplanet_eu' | 'gaia' | 'simbad' | 'exomast';
export type DataTier = 'live' | 'cache' | 'supabase' | 'snapshot';
export type Origin = 'measured' | 'physics' | 'model';
export type PlanetStatus = 'confirmed' | 'candidate' | 'unknown';
export type FieldKey =
  | 'rade'
  | 'masse'
  | 'orbper'
  | 'orbsmax'
  | 'ecc'
  | 'insol'
  | 'teff'
  | 'rad'
  | 'mass'
  | 'lum'
  | 'spectype'
  | 'dist'
  | 'ra'
  | 'dec';

export interface Candidate {
  value: number | string | null;
  source: SourceId;
  fetchedAt: string;
  tier: DataTier;
  isMinMass?: boolean;
}

export interface FieldValue {
  value: number | string | null;
  origin: Origin | null;
  source: SourceId | null;
  fetchedAt: string | null;
  tier: DataTier | null;
  conflict: boolean;
  alternatives: Candidate[];
  isMinMass?: boolean;
}

export interface PlanetComputed {
  radiusUsed: number | null;
  massUsed: number | null;
  semiMajorAxis: number | null;
  period: number | null;
  eccentricity: number | null;
  luminosity: number | null;
  starTeff: number | null;
  starRadius: number | null;
  starMass: number | null;
  sFlux: number | null;
  teq: number | null;
  ts: number | null;
  rho: number | null;
  ve: number | null;
  esiR: number | null;
  esiRho: number | null;
  esiVe: number | null;
  esiS: number | null;
  esiT: number | null;
  esiInterior: number | null;
  esi4: number | null;
  fHz: number | null;
  hzd: number | null;
  dIn: number | null;
  dOut: number | null;
  dEff: number | null;
  hzExtrapolated: boolean;
  hzValid: boolean;
  fHzOpt: number | null;
  hzdOpt: number | null;
  dInOpt: number | null;
  dOutOpt: number | null;
  hzOptValid: boolean;
  qDataAdaptiveOpt: number;
  availableSubindexesOpt: number;
  eAssumed: boolean;
  levelB: boolean;
  insufficientData: boolean;
  availableSubindexes: number;
  pRocky: number;
  pEcc: number;
  pStar: number;
  qDataBase: number;
  qDataAdaptive: number;
  origins: Partial<Record<FieldKey, Origin>>;
  missing: string[];
}

export interface PlanetEntity {
  id: string;
  names: string[];
  sources: SourceId[];
  status: PlanetStatus;
  contested: boolean;
  hostName: string | null;
  letter: string | null;
  gaiaDr3Id: string | null;
  ticId: string | null;
  exomastName: string | null;
  fields: Record<FieldKey, FieldValue>;
  dedupWarnings: string[];
  computed: PlanetComputed;
}

export interface SourceStatus {
  source: SourceId;
  label: string;
  state: 'live' | 'cache' | 'supabase' | 'snapshot' | 'error' | 'pending' | 'skipped';
  records: number;
  fetchedAt: string | null;
  tier: DataTier | null;
  error: string | null;
  schemaMissing: string[];
}

export interface LogEntry {
  time: string;
  source: SourceId | 'pipeline';
  endpoint: string;
  reason: string;
  level: string;
}

export interface SourceFetchResult {
  source: SourceId;
  rows: Record<string, unknown>[];
  tier: DataTier;
  fetchedAt: string;
  schemaMissing: string[];
  error?: string;
}

export interface DatasetCounts {
  total: number;
  ranked: number;
  strict: number;
  candidates: number;
  noCoords: number;
  conflicts: number;
  insufficient: number;
}

export interface PipelineResult {
  entities: PlanetEntity[];
  statuses: SourceStatus[];
  logs: LogEntry[];
  diagnostics: string[];
  counts: DatasetCounts;
  generatedAt: string;
}

export interface ModelParams {
  hzBound: 'conservative' | 'optimistic';
  penalizeRocky: boolean;
  penalizeEcc: boolean;
  penalizeStar: boolean;
  applyQData: boolean;
  minQData: number;
}

export interface Filters {
  spectral: string[];
  radius: [number, number] | null;
  ts: [number, number] | null;
  ecc: [number, number] | null;
  includeCandidates: boolean;
}

export interface RankedPlanet {
  entity: PlanetEntity;
  score: number | null;
  classicRank: number | null;
  rank: number | null;
  delta: number | null;
}

export interface ExoMastData {
  canonicalName: string | null;
  fetchedAt: string;
  properties: Record<string, unknown> | null;
  spectraFiles: string[];
  spectra: { wavelength: number; value: number; error: number | null }[];
  error: string | null;
}
