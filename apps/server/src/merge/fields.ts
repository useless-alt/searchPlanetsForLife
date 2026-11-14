import {
  ALT_REL_EPS,
  PLANET_PARAM_KEYS,
  PLANET_PARAM_PRIORITY,
  STAR_FIELD_KEYS,
  STAR_PARAM_PRIORITY,
  nullParam,
  type ParamValue,
  type RawParamKey,
  type SourceId,
  type SourceRecord,
  type StarRecord,
} from '@exo/shared';

import { relativeDifference } from './spatial';

interface FieldEntry {
  kind: 'planet' | 'star';
  source: SourceId;
  date: string;
  fromBackup: boolean;
  ra: number | null;
  dec: number | null;
  params: Partial<Record<RawParamKey, number>>;
  paramCount: number;
}

interface Candidate {
  source: SourceId;
  value: number;
  date: string;
  fromBackup: boolean;
}

const PLANET_KEY_SET: ReadonlySet<RawParamKey> = new Set(PLANET_PARAM_KEYS);
const ALL_PARAM_KEYS: readonly RawParamKey[] = [...PLANET_PARAM_KEYS, ...STAR_FIELD_KEYS];

function fromPlanet(record: SourceRecord): FieldEntry {
  return {
    kind: 'planet',
    source: record.source,
    date: record.fetchedAt,
    fromBackup: record.fromBackup,
    ra: record.ra,
    dec: record.dec,
    params: record.params,
    paramCount: Object.values(record.params).filter(
      (value) => typeof value === 'number' && Number.isFinite(value),
    ).length,
  };
}

function fromStar(record: StarRecord): FieldEntry {
  return {
    kind: 'star',
    source: record.source,
    date: record.fetchedAt,
    fromBackup: record.fromBackup,
    ra: record.ra,
    dec: record.dec,
    params: record.params,
    paramCount: Object.values(record.params).filter(
      (value) => typeof value === 'number' && Number.isFinite(value),
    ).length,
  };
}

/** Основная запись источника — с наибольшим числом непустых params (п. 7.3). */
function primaryFirst(entries: readonly FieldEntry[]): FieldEntry[] {
  let primary = 0;
  for (let index = 1; index < entries.length; index += 1) {
    if ((entries[index] as FieldEntry).paramCount > (entries[primary] as FieldEntry).paramCount) {
      primary = index;
    }
  }
  if (primary === 0) return [...entries];
  return [
    entries[primary] as FieldEntry,
    ...entries.slice(0, primary),
    ...entries.slice(primary + 1),
  ];
}

function groupEntries(entries: readonly FieldEntry[]): Map<SourceId, FieldEntry[]> {
  const groups = new Map<SourceId, FieldEntry[]>();
  for (const entry of entries) {
    const group = groups.get(entry.source);
    if (group) group.push(entry);
    else groups.set(entry.source, [entry]);
  }
  for (const [source, group] of groups) groups.set(source, primaryFirst(group));
  return groups;
}

function valueFor(entry: FieldEntry, key: RawParamKey): number | null {
  if (key === 'ra') return entry.ra !== null && Number.isFinite(entry.ra) ? entry.ra : null;
  if (key === 'dec') return entry.dec !== null && Number.isFinite(entry.dec) ? entry.dec : null;
  const value = entry.params[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * Сливает параметры кластера по приоритетам источников (п. 7.3).
 *
 * Внутри источника первой идёт основная запись; значения остальных записей
 * становятся alternatives. Совпадающие с победителем значения отбрасываются.
 */
export function mergeFields(
  records: readonly SourceRecord[],
  stars: readonly StarRecord[],
): Record<RawParamKey, ParamValue> {
  const planetGroups = groupEntries(records.map(fromPlanet));
  const fieldGroups = groupEntries([...records.map(fromPlanet), ...stars.map(fromStar)]);

  const result = {} as Record<RawParamKey, ParamValue>;
  for (const key of ALL_PARAM_KEYS) {
    const planetField = PLANET_KEY_SET.has(key);
    const groups = planetField ? planetGroups : fieldGroups;
    const priority = planetField ? PLANET_PARAM_PRIORITY : STAR_PARAM_PRIORITY;
    const candidates: Candidate[] = [];

    for (const source of priority) {
      for (const entry of groups.get(source) ?? []) {
        const value = valueFor(entry, key);
        if (value === null) continue;
        candidates.push({
          source,
          value,
          date: entry.date,
          fromBackup: entry.fromBackup,
        });
      }
    }

    const [winner, ...others] = candidates;
    if (!winner) {
      result[key] = nullParam();
      continue;
    }

    result[key] = {
      value: winner.value,
      provenance: 'measured',
      source: winner.source,
      sourceDate: winner.date,
      fromBackup: winner.fromBackup,
      alternatives: others
        .filter((candidate) => relativeDifference(winner.value, candidate.value) > ALT_REL_EPS)
        .map((candidate) => ({
          source: candidate.source,
          value: candidate.value,
          sourceDate: candidate.date,
        })),
    };
  }
  return result;
}
