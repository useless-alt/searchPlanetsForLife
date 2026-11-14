import type { SourceId } from '../types/provenance';

/**
 * Реестр научных источников (п. 5, 5.1; глобальный контекст, п. 1.6).
 *
 * Ранг — по убыванию точности первичных измерений. Эндпоинты проверены 13.11.2026.
 */
export const SOURCES: Array<{
  id: SourceId;
  rank: number;
  org: string;
  endpoint: string;
  protocol: 'tap' | 'rest';
  table?: string;
}> = [
  {
    id: 'gaia',
    rank: 1,
    org: 'ESA',
    endpoint: 'https://gea.esac.esa.int/tap-server/tap/sync',
    protocol: 'tap',
  },
  {
    id: 'exomast',
    rank: 2,
    org: 'STScI',
    endpoint: 'https://exo.mast.stsci.edu/api/v0.1/exoplanets/{planet}/properties/',
    protocol: 'rest',
  },
  {
    id: 'nasa',
    rank: 3,
    org: 'NASA / Caltech',
    endpoint: 'https://exoplanetarchive.ipac.caltech.edu/TAP/sync',
    protocol: 'tap',
    table: 'pscomppars',
  },
  {
    id: 'exoplanet_eu',
    rank: 4,
    org: 'LESIA',
    endpoint: 'http://voparis-tap-planeto.obspm.fr/tap/sync',
    protocol: 'tap',
    table: 'exoplanet.epn_core',
  },
  {
    id: 'simbad',
    rank: 5,
    org: 'CDS',
    endpoint: 'https://simbad.cfa.harvard.edu/simbad/sim-tap/sync',
    protocol: 'tap',
  },
  {
    id: 'exomercat',
    rank: 6,
    org: 'INAF',
    endpoint: 'http://archives.ia2.inaf.it/vo/tap/projects/sync',
    protocol: 'tap',
    table: 'exomercat.exomercat',
  },
];

/** Приоритет источников при разрешении значений полей (п. 7.3). */
export const SOURCE_PRIORITY: SourceId[] = [
  'gaia',
  'exomast',
  'nasa',
  'exoplanet_eu',
  'simbad',
  'exomercat',
];

/**
 * Порядок источников звёздных параметров (задача 9, п. 7.3).
 *
 * Это единственное место, где задан порядок источников для полей звезды
 * (`st_teff`, `st_rad`, `st_mass`, `st_lum`): Gaia — первичные измерения,
 * далее Exo.MAST, NASA, Exoplanet.eu, SIMBAD, Exo-MerCat (по убыванию
 * точности, п. 1.6).
 *
 * Exo.MAST в списке остаётся, хотя загружается лениво (п. 10.1.4, U6):
 * приоритет относится к разрешению значения, а не к порядку загрузки.
 */
export const STAR_PARAM_PRIORITY: SourceId[] = [
  'gaia',
  'exomast',
  'nasa',
  'exoplanet_eu',
  'simbad',
  'exomercat',
];
