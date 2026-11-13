/** Все константы, пороги и настройки источников. */

import type { FieldKey, Filters, ModelParams, SourceId } from './types';

export const EARTH = {
  radius: 1,
  mass: 1,
  ecc: 0.0167,
  semiMajorAxis: 1,
  period: 365.25,
  teff: 5772,
  luminosity: 1,
  starMass: 1,
} as const;

export const SUN_TEFF = 5772;

/** ESI: (x0; w) */
export const ESI_PARAMS = {
  rade: { x0: 1.0, w: 0.57 },
  rho: { x0: 5.51, w: 1.07 },
  ve: { x0: 1.0, w: 0.7 },
  insol: { x0: 1.0, w: 1.07 },
  ts: { x0: 288, w: 5.58 },
} as const;

export type HzBound = 'conservative' | 'optimistic';

/** Коэффициенты Коппарапу: [S_sun, a, b, c, d] */
export const HZ_COEFFS: Record<HzBound, { in: number[]; out: number[] }> = {
  conservative: {
    in: [1.107, 1.332e-4, 1.58e-8, -8.308e-12, -1.931e-15],
    out: [0.356, 6.171e-5, 1.698e-9, -3.198e-12, -5.575e-16],
  },
  optimistic: {
    in: [1.776, 2.136e-4, 2.533e-8, -1.332e-11, -3.097e-15],
    out: [0.32, 5.547e-5, 1.526e-9, -2.874e-12, -5.011e-16],
  },
};

export const HZ_TEFF = { min: 2600, max: 7200, extrapMin: 2300, extrapMax: 7600 };

export const PENALTY = {
  rockyThreshold: 1.65,
  rockySteepness: 5,
  redDwarfTeff: 3900,
  redDwarfFactor: 0.85,
};

export const Q_DATA = {
  levelBPenalty: 0.1,
  eAssumedPenalty: 0.05,
  eAssumedExemptPeriod: 10,
  excludedSubindexPenalty: 0.05,
  floor: 0.75,
  high: 0.95,
  medium: 0.85,
  minPercent: 75,
  maxPercent: 100,
};

export const DYNAMIC_LIMITS = {
  minSubindexes: 3,
  maxTop: 50,
  backupVersions: 5,
  errorLogSize: 50,
  schemaCacheHours: 24,
  gaiaBatch: 400,
  simbadBatch: 300,
  gaiaParallel: 2,
  defaultParallel: 3,
  totalParallel: 6,
  retries: 3,
  retryBaseMs: 1500,
  progressThrottleMs: 400,
};

export const TIMEOUTS: Record<SourceId, number> = {
  nasa: 60_000,
  exomercat: 45_000,
  exoplanet_eu: 45_000,
  gaia: 90_000,
  simbad: 45_000,
  exomast: 45_000,
};

export const FIELD_PRIORITY: Record<FieldKey, SourceId[]> = {
  teff: ['gaia', 'nasa', 'exoplanet_eu', 'exomast'],
  rad: ['gaia', 'nasa', 'exoplanet_eu', 'exomast'],
  mass: ['gaia', 'nasa', 'exoplanet_eu', 'exomast'],
  lum: ['gaia', 'nasa', 'exoplanet_eu', 'exomast'],
  rade: ['nasa', 'exomast', 'exomercat', 'exoplanet_eu'],
  masse: ['nasa', 'exomast', 'exomercat', 'exoplanet_eu'],
  orbper: ['nasa', 'exomast', 'exomercat', 'exoplanet_eu'],
  orbsmax: ['nasa', 'exomast', 'exomercat', 'exoplanet_eu'],
  ecc: ['nasa', 'exomast', 'exomercat', 'exoplanet_eu'],
  insol: ['nasa', 'exomast', 'exoplanet_eu'],
  dist: ['nasa', 'exoplanet_eu', 'gaia', 'simbad'],
  spectype: ['simbad', 'nasa', 'exoplanet_eu'],
  ra: ['nasa', 'simbad', 'gaia', 'exoplanet_eu', 'exomercat'],
  dec: ['nasa', 'simbad', 'gaia', 'exoplanet_eu', 'exomercat'],
};

export const CONSENSUS_TOLERANCE: Partial<Record<FieldKey, { rel: number; abs?: number }>> = {
  teff: { rel: 0.08 },
  rad: { rel: 0.25 },
  lum: { rel: 0.4 },
  mass: { rel: 0.25 },
  rade: { rel: 0.2 },
  masse: { rel: 0.4 },
  orbper: { rel: 0.01 },
  orbsmax: { rel: 0.05 },
  dist: { rel: 0.1 },
  ecc: { rel: 0, abs: 0.1 },
};

export interface SourceConfig {
  id: SourceId;
  label: string;
  short: string;
  endpoint: string;
  fallbackEndpoints?: string[];
  table: string;
  method: 'GET' | 'POST';
  timeoutMs: number;
  desiredColumns: string[];
  requiredColumns: string[];
}

export const SOURCE_CONFIG: Record<SourceId, SourceConfig> = {
  nasa: {
    id: 'nasa',
    label: 'NASA Exoplanet Archive',
    short: 'NASA',
    endpoint: 'https://exoplanetarchive.ipac.caltech.edu/TAP/sync',
    table: 'pscomppars',
    method: 'GET',
    timeoutMs: TIMEOUTS.nasa,
    desiredColumns: [
      'pl_name', 'hostname', 'pl_letter', 'discoverymethod', 'disc_year', 'pl_controv_flag',
      'cb_flag', 'sy_snum', 'sy_pnum', 'pl_rade', 'pl_bmasse', 'pl_bmassprov', 'pl_dens',
      'pl_orbper', 'pl_orbsmax', 'pl_orbeccen', 'pl_insol', 'pl_eqt', 'st_teff', 'st_rad',
      'st_mass', 'st_lum', 'st_spectype', 'sy_dist', 'sy_plx', 'ra', 'dec', 'hd_name',
      'hip_name', 'tic_id', 'gaia_dr2_id', 'gaia_dr3_id',
    ],
    requiredColumns: ['pl_name'],
  },
  exomercat: {
    id: 'exomercat',
    label: 'Exo-MerCat (INAF)',
    short: 'Exo-MerCat',
    endpoint: 'http://archives.ia2.inaf.it/vo/tap/projects/sync',
    table: 'exomercat.exomercat',
    method: 'POST',
    timeoutMs: TIMEOUTS.exomercat,
    desiredColumns: [
      'exomercat_name', 'name', 'nasa_name', 'eu_name', 'host', 'letter', 'main_id',
      'main_id_ra', 'main_id_dec', 'binary', 'mass', 'mass_min', 'mass_max', 'mass_url',
      'msini', 'p', 'a', 'e', 'i', 'r', 'discovery_year', 'discovery_method', 'status',
    ],
    requiredColumns: ['exomercat_name'],
  },
  exoplanet_eu: {
    id: 'exoplanet_eu',
    label: 'Exoplanet.eu (LESIA)',
    short: 'Exoplanet.eu',
    endpoint: 'http://voparis-tap-planeto.obspm.fr/tap/sync',
    table: 'exoplanet.epn_core',
    method: 'POST',
    timeoutMs: TIMEOUTS.exoplanet_eu,
    desiredColumns: [
      'target_name', 'granule_uid', 'alt_target_name', 'star_name', 'ra', 'dec', 'mass',
      'mass_sin_i', 'radius', 'semi_major_axis', 'eccentricity', 'orbital_period', 'period',
      'star_mass', 'star_radius', 'star_teff', 'star_age', 'star_distance', 'distance',
      'star_spec_type', 'star_sp_type', 'discovered', 'detection_type', 'publication_status',
    ],
    requiredColumns: ['target_name'],
  },
  gaia: {
    id: 'gaia',
    label: 'ESA Gaia DR3',
    short: 'Gaia',
    endpoint: 'https://gea.esac.esa.int/tap-server/tap/sync',
    table: 'gaiadr3.astrophysical_parameters',
    method: 'POST',
    timeoutMs: TIMEOUTS.gaia,
    desiredColumns: [
      'source_id', 'teff_gspphot', 'radius_gspphot', 'radius_flame', 'lum_flame',
      'mass_flame', 'parallax', 'parallax_over_error',
    ],
    requiredColumns: ['source_id'],
  },
  simbad: {
    id: 'simbad',
    label: 'CDS SIMBAD',
    short: 'SIMBAD',
    endpoint: 'https://simbad.cfa.harvard.edu/simbad/sim-tap/sync',
    fallbackEndpoints: [
      'https://simbad.cds.unistra.fr/simbad/sim-tap/sync',
      'https://simbad.u-strasbg.fr/simbad/sim-tap/sync',
    ],
    table: 'basic',
    method: 'POST',
    timeoutMs: TIMEOUTS.simbad,
    desiredColumns: ['query_id', 'main_id', 'ra', 'dec', 'sp_type', 'plx_value'],
    requiredColumns: ['main_id'],
  },
  exomast: {
    id: 'exomast',
    label: 'Exo.MAST (STScI)',
    short: 'Exo.MAST',
    endpoint: 'https://exo.mast.stsci.edu/api/v0.1',
    table: '-',
    method: 'GET',
    timeoutMs: TIMEOUTS.exomast,
    desiredColumns: [],
    requiredColumns: [],
  },
};

export const MODES = [
  { id: 'adaptive', label: 'Адаптивный', formula: 'geomean(ESI_R, ESI_ρ, ESI_v, F_HZ) · P_rocky · P_ecc · P_star · Q_data' },
  { id: 'rhi', label: 'RHI', formula: 'sqrt(ESI_interior · F_HZ) · P_rocky · P_ecc · P_star · Q_data' },
  { id: 'classic', label: 'Упрощённый ESI (R, S)', formula: 'sqrt(ESI_S · ESI_R)' },
  { id: 'strict', label: 'Строгий научный', formula: 'sqrt(ESI4 · F_HZ), ESI4 = (ESI_R·ESI_ρ·ESI_v·ESI_T)^(1/4)' },
] as const;

export type ModeId = (typeof MODES)[number]['id'];

export const DEFAULT_MODEL: ModelParams = {
  hzBound: 'conservative',
  penalizeRocky: true,
  penalizeEcc: true,
  penalizeStar: true,
  applyQData: true,
  minQData: 75,
};

export const DEFAULT_FILTERS: Filters = {
  spectral: [],
  radius: null,
  ts: null,
  ecc: null,
  includeCandidates: false,
};

export const SPECTRAL_CLASS_LIST = ['M', 'K', 'G', 'F', 'A', 'B', 'O'] as const;

export const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

export const SPECTRAL_CLASSES = ['M', 'K', 'G', 'F', 'A', 'B', 'O'] as const;
export type SpectralClass = (typeof SPECTRAL_CLASSES)[number];

export function spectralClassFromTeff(teff: number | null): SpectralClass | null {
  if (teff === null || !Number.isFinite(teff)) return null;
  if (teff < 3900) return 'M';
  if (teff < 5200) return 'K';
  if (teff < 6000) return 'G';
  if (teff < 7500) return 'F';
  if (teff < 10000) return 'A';
  if (teff < 30000) return 'B';
  return 'O';
}

export const CLASS_COLORS: Record<SpectralClass, string> = {
  M: '#ff6b6b',
  K: '#ffa94d',
  G: '#ffd43b',
  F: '#f8f9fa',
  A: '#a5d8ff',
  B: '#74c0fc',
  O: '#4dabf7',
};
