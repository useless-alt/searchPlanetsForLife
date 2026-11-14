/** Дедупликация и слияние записей каталогов (задача 10, п. 7). */

export { mergeCatalog } from './mergeCatalog';
export type { MergeCatalogInput, MergeCatalogResult } from './mergeCatalog';
export { normalizeName, normalizeLetter, nameKeys, hostKeys } from './normalize';
export { angularSeparationArcsec, findSpatialPairs, relativeDifference } from './spatial';
export { slug, uniquePlanetId } from './ids';
export { mergeFields } from './fields';
export { clusterRecords } from './cluster';
export type { ClusterRecord, RecordCluster } from './cluster';
