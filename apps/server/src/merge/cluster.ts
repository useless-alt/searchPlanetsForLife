import {
  COORD_TOLERANCE_ARCSEC,
  PERIOD_REL_TOL,
  PERIOD_VETO_REL,
  SMA_REL_TOL,
  type MergeRule,
  type MergeStats,
  type SourceId,
  type SourceRecord,
} from '@exo/shared';

import { normalizeLetter } from './normalize';
import { angularSeparationArcsec, findSpatialPairs, relativeDifference } from './spatial';

/** Запись, подготовленная mergeCatalog для кластеризации. */
export interface ClusterRecord {
  record: SourceRecord;
  normalizedName: string | null;
  letter: string | null;
  nameKeys: ReadonlySet<string>;
  hostKeys: ReadonlySet<string>;
}

/** Один кластер: индексы записей в отсортированном входе. */
export interface RecordCluster {
  members: number[];
  rejected: boolean;
}

interface DisjointSet {
  parent: number[];
  size: number[];
  sourceNames: Array<Map<SourceId, string | null>>;
  rejected: boolean[];
}

function find(set: DisjointSet, value: number): number {
  let root = value;
  while (set.parent[root] !== root) root = set.parent[root] as number;
  let current = value;
  while (current !== root) {
    const next = set.parent[current] as number;
    set.parent[current] = root;
    current = next;
  }
  return root;
}

function createDisjointSet(records: readonly ClusterRecord[]): DisjointSet {
  return {
    parent: records.map((_, index) => index),
    size: records.map(() => 1),
    sourceNames: records.map((record) => new Map([[record.record.source, record.normalizedName]])),
    rejected: records.map(() => false),
  };
}

function hasSourceConflict(set: DisjointSet, a: number, b: number): boolean {
  const namesA = set.sourceNames[a] as Map<SourceId, string | null>;
  const namesB = set.sourceNames[b] as Map<SourceId, string | null>;
  for (const [source, name] of namesA) {
    if (namesB.has(source) && namesB.get(source) !== name) return true;
  }
  return false;
}

function joinRoots(set: DisjointSet, a: number, b: number): void {
  let target = a;
  let absorbed = b;
  if ((set.size[a] as number) < (set.size[b] as number)) {
    target = b;
    absorbed = a;
  }

  set.parent[absorbed] = target;
  set.size[target] = (set.size[target] as number) + (set.size[absorbed] as number);
  const targetNames = set.sourceNames[target] as Map<SourceId, string | null>;
  for (const [source, name] of set.sourceNames[absorbed] as Map<SourceId, string | null>) {
    targetNames.set(source, name);
  }
  set.rejected[target] = (set.rejected[target] || set.rejected[absorbed]) as boolean;
}

/** Пары в порядке нормализованного ключа, без повторов между разными ключами. */
function forEachKeyedPair(
  groups: ReadonlyMap<string, number[]>,
  visit: (a: number, b: number) => void,
): void {
  const seen = new Set<string>();
  const keys = [...groups.keys()].sort();
  for (const key of keys) {
    const indices = groups.get(key) as number[];
    for (let left = 0; left < indices.length; left += 1) {
      for (let right = left + 1; right < indices.length; right += 1) {
        const a = indices[left] as number;
        const b = indices[right] as number;
        const pairKey = `${a}:${b}`;
        if (seen.has(pairKey)) continue;
        seen.add(pairKey);
        visit(a, b);
      }
    }
  }
}

function groupsByName(records: readonly ClusterRecord[]): Map<string, number[]> {
  const groups = new Map<string, number[]>();
  records.forEach((record, index) => {
    for (const key of record.nameKeys) {
      const group = groups.get(key);
      if (group) group.push(index);
      else groups.set(key, [index]);
    }
  });
  return groups;
}

function groupsByHostAndLetter(records: readonly ClusterRecord[]): Map<string, number[]> {
  const groups = new Map<string, number[]>();
  records.forEach((record, index) => {
    const letter = normalizeLetter(record.letter);
    if (letter === null) return;
    for (const key of record.hostKeys) {
      const groupKey = `${key}\u0000${letter}`;
      const group = groups.get(groupKey);
      if (group) group.push(index);
      else groups.set(groupKey, [index]);
    }
  });
  return groups;
}

function separation(a: SourceRecord, b: SourceRecord): number | null {
  if (a.ra === null || a.dec === null || b.ra === null || b.dec === null) return null;
  return angularSeparationArcsec({ ra: a.ra, dec: a.dec }, { ra: b.ra, dec: b.dec });
}

function finiteParam(record: SourceRecord, key: 'pl_orbper' | 'pl_orbsmax'): number | null {
  const value = record.params[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * Кластеризует записи правилами R1 → R4 (п. 7.2).
 *
 * Объединение отклоняется, если в обоих кластерах один источник представлен
 * разными normalizeName(planetName). Счётчики stats изменяются по месту.
 */
export function clusterRecords(
  records: readonly ClusterRecord[],
  stats: MergeStats,
): RecordCluster[] {
  const set = createDisjointSet(records);

  const union = (a: number, b: number, rule: MergeRule): void => {
    const rootA = find(set, a);
    const rootB = find(set, b);
    if (rootA === rootB) return;

    if (hasSourceConflict(set, rootA, rootB)) {
      set.rejected[rootA] = true;
      set.rejected[rootB] = true;
      stats.rejectedUnions += 1;
      return;
    }

    const recordA = records[a] as ClusterRecord;
    const recordB = records[b] as ClusterRecord;
    const sameSourceDuplicate =
      recordA.record.source === recordB.record.source &&
      recordA.normalizedName === recordB.normalizedName;

    joinRoots(set, rootA, rootB);
    stats.ruleCounts[rule] += 1;
    if (sameSourceDuplicate) stats.sameSourceDuplicates += 1;
  };

  // R1 — пересечение имён и алиасов.
  forEachKeyedPair(groupsByName(records), (a, b) => union(a, b, 'R1'));

  // R2 — общий ключ хоста и совпадающая непустая буква.
  forEachKeyedPair(groupsByHostAndLetter(records), (a, b) => union(a, b, 'R2'));

  const spatialPairs = findSpatialPairs(records.map(({ record }) => record));

  // R3 — координаты и буква, с вето при расхождении периодов более чем на 10 %.
  for (const [a, b] of spatialPairs) {
    if (find(set, a) === find(set, b)) continue;
    const recordA = (records[a] as ClusterRecord).record;
    const recordB = (records[b] as ClusterRecord).record;
    const letterA = normalizeLetter(recordA.letter);
    const letterB = normalizeLetter(recordB.letter);
    if (letterA === null || letterA !== letterB) continue;

    const distance = separation(recordA, recordB);
    if (distance === null || distance > COORD_TOLERANCE_ARCSEC) continue;

    const periodA = finiteParam(recordA, 'pl_orbper');
    const periodB = finiteParam(recordB, 'pl_orbper');
    if (
      periodA !== null &&
      periodB !== null &&
      relativeDifference(periodA, periodB) > PERIOD_VETO_REL
    ) {
      stats.vetoed += 1;
      continue;
    }
    union(a, b, 'R3');
  }

  // R4 — дополнительный признак: период либо большая полуось, если буквы нет.
  for (const [a, b] of spatialPairs) {
    if (find(set, a) === find(set, b)) continue;
    const recordA = (records[a] as ClusterRecord).record;
    const recordB = (records[b] as ClusterRecord).record;
    if (normalizeLetter(recordA.letter) !== null && normalizeLetter(recordB.letter) !== null) {
      continue;
    }

    const distance = separation(recordA, recordB);
    if (distance === null || distance > COORD_TOLERANCE_ARCSEC) continue;

    const periodA = finiteParam(recordA, 'pl_orbper');
    const periodB = finiteParam(recordB, 'pl_orbper');
    if (periodA !== null && periodB !== null) {
      if (relativeDifference(periodA, periodB) <= PERIOD_REL_TOL) union(a, b, 'R4');
      continue;
    }
    if (periodA !== null || periodB !== null) continue;

    const smaA = finiteParam(recordA, 'pl_orbsmax');
    const smaB = finiteParam(recordB, 'pl_orbsmax');
    if (smaA !== null && smaB !== null && relativeDifference(smaA, smaB) <= SMA_REL_TOL) {
      union(a, b, 'R4');
    }
  }

  const byRoot = new Map<number, RecordCluster>();
  records.forEach((_, index) => {
    const root = find(set, index);
    const cluster = byRoot.get(root);
    if (cluster) cluster.members.push(index);
    else byRoot.set(root, { members: [index], rejected: set.rejected[root] as boolean });
  });

  return [...byRoot.values()].sort((a, b) => (a.members[0] as number) - (b.members[0] as number));
}
