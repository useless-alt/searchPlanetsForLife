import {
  SOURCE_PRIORITY,
  type MergeStats,
  type PlanetRecord,
  type SourceId,
  type SourceRecord,
  type StarRecord,
} from '@exo/shared';

import { clusterRecords, type ClusterRecord, type RecordCluster } from './cluster';
import { mergeFields } from './fields';
import { uniquePlanetId } from './ids';
import { hostKeys, nameKeys, normalizeLetter, normalizeName } from './normalize';

/** Входные данные слияния каталога (п. 7). */
export interface MergeCatalogInput {
  planets: SourceRecord[];
  stars: StarRecord[];
}

/** Результат слияния: уникальные планеты и статистика дедупликации. */
export interface MergeCatalogResult {
  planets: PlanetRecord[];
  stats: MergeStats;
}

interface WorkRecord extends ClusterRecord {
  hostKeys: Set<string>;
  hostAliases: string[];
  simbadStars: number[];
}

const SOURCE_RANK = new Map<SourceId, number>(
  SOURCE_PRIORITY.map((source, index) => [source, index]),
);

function rank(source: SourceId): number {
  return SOURCE_RANK.get(source) ?? SOURCE_PRIORITY.length;
}

function compareNames(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a < b ? -1 : 1;
}

function starSortKey(record: StarRecord): string {
  return (record.key.gaiaDr3Id ?? record.key.hostQuery ?? record.mainId ?? '').toLowerCase();
}

function prepareRecords(records: readonly SourceRecord[]): WorkRecord[] {
  return records
    .map((record, originalIndex) => ({
      record,
      originalIndex,
      normalizedName: normalizeName(record.planetName),
    }))
    .sort(
      (a, b) =>
        rank(a.record.source) - rank(b.record.source) ||
        compareNames(a.normalizedName, b.normalizedName) ||
        a.originalIndex - b.originalIndex,
    )
    .map(({ record, normalizedName }) => ({
      record,
      normalizedName,
      letter: normalizeLetter(record.letter),
      nameKeys: nameKeys(record),
      hostKeys: hostKeys(record),
      hostAliases: [...record.hostAliases],
      simbadStars: [],
    }));
}

function prepareStars(records: readonly StarRecord[]): StarRecord[] {
  return records
    .map((record, originalIndex) => ({ record, originalIndex, key: starSortKey(record) }))
    .sort(
      (a, b) =>
        rank(a.record.source) - rank(b.record.source) ||
        compareNames(a.key, b.key) ||
        a.originalIndex - b.originalIndex,
    )
    .map(({ record }) => record);
}

function addHostAlias(record: WorkRecord, alias: string | null): void {
  if (alias === null || alias.trim() === '') return;
  const key = alias.trim().toLowerCase();
  if (!record.hostAliases.some((current) => current.trim().toLowerCase() === key)) {
    record.hostAliases.push(alias);
  }
  const normalized = normalizeName(alias);
  if (normalized !== null) record.hostKeys.add(normalized);
}

/** Мост через SIMBAD: hostQuery → hostAliases планетных записей (п. 7.2). */
function attachSimbad(records: WorkRecord[], stars: readonly StarRecord[]): void {
  const byHostKey = new Map<string, number[]>();
  records.forEach((record, index) => {
    for (const key of record.hostKeys) {
      const group = byHostKey.get(key);
      if (group) group.push(index);
      else byHostKey.set(key, [index]);
    }
  });

  stars.forEach((star, starIndex) => {
    if (star.source !== 'simbad') return;
    const query = normalizeName(star.key.hostQuery);
    if (query === null) return;
    for (const index of byHostKey.get(query) ?? []) {
      const record = records[index] as WorkRecord;
      record.simbadStars.push(starIndex);
      addHostAlias(record, star.mainId);
      for (const alias of star.aliases) addHostAlias(record, alias);
    }
  });
}

function initialStats(input: MergeCatalogInput): MergeStats {
  const recordsBySource = Object.fromEntries(
    SOURCE_PRIORITY.map((source) => [source, 0]),
  ) as Record<SourceId, number>;
  for (const record of input.planets) recordsBySource[record.source] += 1;
  for (const record of input.stars) recordsBySource[record.source] += 1;

  return {
    recordsBySource,
    uniquePlanets: 0,
    mergedClusters: 0,
    rejectedUnions: 0,
    sameSourceDuplicates: 0,
    ruleCounts: { R1: 0, R2: 0, R3: 0, R4: 0 },
    vetoed: 0,
  };
}

function addUniqueName(target: string[], seen: Set<string>, value: string | null): void {
  if (value === null || value.trim() === '') return;
  const key = value.trim().toLowerCase();
  if (seen.has(key)) return;
  seen.add(key);
  target.push(value);
}

function firstNonEmpty(
  records: readonly SourceRecord[],
  pick: (record: SourceRecord) => string | null,
): string | null {
  for (const record of records) {
    const value = pick(record);
    if (value !== null && value.trim() !== '') return value;
  }
  return null;
}

function buildPlanetRecord(
  cluster: RecordCluster,
  work: readonly WorkRecord[],
  attachedStars: readonly StarRecord[],
  usedIds: Set<string>,
): PlanetRecord {
  const members = cluster.members.map((index) => work[index] as WorkRecord);
  const sourceRecords = members.map(({ record }) => record);
  const canonical = sourceRecords[0] as SourceRecord;

  const aliases: string[] = [];
  const aliasKeys = new Set<string>([canonical.planetName.trim().toLowerCase()]);
  for (const record of sourceRecords) {
    addUniqueName(aliases, aliasKeys, record.planetName);
    for (const alias of record.aliases) addUniqueName(aliases, aliasKeys, alias);
  }

  const hostAliases: string[] = [];
  const hostAliasKeys = new Set<string>();
  for (const member of members) {
    for (const alias of member.hostAliases) addUniqueName(hostAliases, hostAliasKeys, alias);
  }

  const sourceSet = new Set<SourceId>(sourceRecords.map((record) => record.source));
  for (const star of attachedStars) sourceSet.add(star.source);
  const sources = SOURCE_PRIORITY.filter((source) => sourceSet.has(source));

  const warnings: string[] = [];
  for (const source of sources) {
    const count = sourceRecords.filter((record) => record.source === source).length;
    if (count > 1) warnings.push(`В кластере несколько записей одного источника: ${source}.`);
  }
  if (cluster.rejected) {
    warnings.push('Слияние отклонено ограничением уникальности источника.');
  }

  return {
    id: uniquePlanetId(canonical.planetName, usedIds),
    name: canonical.planetName,
    aliases,
    hostname: firstNonEmpty(sourceRecords, (record) => record.hostname) ?? '',
    letter: firstNonEmpty(sourceRecords, (record) => record.letter),
    hostAliases,
    sources,
    warnings,
    params: mergeFields(sourceRecords, attachedStars),
  };
}

/**
 * Дедуплицирует записи источников и сливает их в уникальные PlanetRecord
 * (п. 7). Входные массивы не изменяются; порядок результата детерминирован.
 */
export function mergeCatalog(input: MergeCatalogInput): MergeCatalogResult {
  const stats = initialStats(input);
  const records = prepareRecords(input.planets);
  const stars = prepareStars(input.stars);
  attachSimbad(records, stars);

  const gaiaById = new Map<string, number[]>();
  stars.forEach((star, index) => {
    if (star.source !== 'gaia' || !star.key.gaiaDr3Id) return;
    const group = gaiaById.get(star.key.gaiaDr3Id);
    if (group) group.push(index);
    else gaiaById.set(star.key.gaiaDr3Id, [index]);
  });

  const clusters = clusterRecords(records, stats);
  const usedIds = new Set<string>();
  const planets = clusters.map((cluster) => {
    const starIndices = new Set<number>();
    for (const memberIndex of cluster.members) {
      const member = records[memberIndex] as WorkRecord;
      for (const starIndex of member.simbadStars) starIndices.add(starIndex);
      const gaiaId = member.record.extra.gaiaDr3Id;
      if (gaiaId !== undefined) {
        for (const starIndex of gaiaById.get(gaiaId) ?? []) starIndices.add(starIndex);
      }
    }
    const attachedStars = [...starIndices]
      .sort((a, b) => a - b)
      .map((index) => stars[index] as StarRecord);
    return buildPlanetRecord(cluster, records, attachedStars, usedIds);
  });

  stats.uniquePlanets = planets.length;
  stats.mergedClusters = clusters.filter((cluster) => cluster.members.length >= 2).length;
  return { planets, stats };
}
