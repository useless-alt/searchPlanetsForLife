/** Слияние и дедупликация: NASA -> Exo-MerCat -> Exoplanet.eu, затем Gaia/SIMBAD. */

import { CONSENSUS_TOLERANCE, FIELD_PRIORITY, SOURCE_CONFIG } from '@/config';
import type {
  Candidate,
  DataTier,
  FieldKey,
  FieldValue,
  PlanetEntity,
  PlanetStatus,
  SourceId,
} from '@/types';
import { JUPITER_MASS_TO_EARTH, JUPITER_RADIUS_TO_EARTH, median, num } from '../calc/num';
import { defaultField, solvePlanet } from '../calc/solver';
import {
  angularSeparationArcsec,
  hostKey,
  normName,
  planetLetter,
  splitAliases,
} from './names';
import { pickNum, pickStr, type Row } from '../sources/parser';

const FIELD_KEYS: FieldKey[] = ['rade', 'masse', 'orbper', 'orbsmax', 'ecc', 'insol', 'teff', 'rad', 'mass', 'lum', 'spectype', 'dist', 'ra', 'dec'];

const COORD_STEP = 0.01;
const MAX_SEPARATION_ARCSEC = 15;

type CandidateMap = Map<string, Map<FieldKey, Candidate[]>>;

function emptyFields(): Record<FieldKey, FieldValue> {
  return Object.fromEntries(FIELD_KEYS.map((k) => [k, defaultField()])) as Record<FieldKey, FieldValue>;
}

function priorityIndex(key: FieldKey, source: SourceId): number {
  const order = FIELD_PRIORITY[key] ?? [];
  const idx = order.indexOf(source);
  return idx >= 0 ? idx : order.length + 1;
}

function withinTolerance(key: FieldKey, value: number, reference: number): boolean {
  const tol = CONSENSUS_TOLERANCE[key];
  if (!tol) return true;
  if (tol.abs !== undefined) return Math.abs(value - reference) <= tol.abs;
  if (reference === 0) return value === 0;
  return Math.abs(value - reference) / Math.abs(reference) <= tol.rel;
}

export interface MergeOptions {
  now: string;
}

export class Merger {
  readonly entities: PlanetEntity[] = [];
  private readonly byId = new Map<string, PlanetEntity>();
  private readonly candidates: CandidateMap = new Map();
  private readonly nameIndex = new Map<string, string>();
  private readonly hostLetterIndex = new Map<string, string>();
  private readonly coordGrid = new Map<string, string[]>();
  private readonly gaiaIndex = new Map<string, string>();
  private readonly ticIndex = new Map<string, string>();
  private readonly crossLinks = new Map<string, string>();
  private readonly coords = new Map<string, { ra: number; dec: number }>();
  private readonly warnings: string[] = [];
  private counter = 0;
  private readonly now: string;

  constructor(options: MergeOptions) {
    this.now = options.now;
  }

  get dedupWarnings(): string[] {
    return [...this.warnings];
  }

  private gridKey(ra: number, dec: number): string {
    return `${Math.floor(ra / COORD_STEP)}:${Math.floor(dec / COORD_STEP)}`;
  }

  private registerCoords(id: string, ra: number | null, dec: number | null): void {
    if (ra === null || dec === null) return;
    if (!Number.isFinite(ra) || !Number.isFinite(dec)) return;
    const existing = this.coords.get(id);
    if (existing) return;
    this.coords.set(id, { ra, dec });
    const key = this.gridKey(ra, dec);
    const list = this.coordGrid.get(key) ?? [];
    if (!list.includes(id)) list.push(id);
    this.coordGrid.set(key, list);
  }

  private addName(id: string, name: string): void {
    const entity = this.byId.get(id);
    if (!entity || !name) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    if (!entity.names.includes(trimmed)) entity.names.push(trimmed);
    const key = normName(trimmed);
    if (key && !this.nameIndex.has(key)) this.nameIndex.set(key, id);
  }

  private addCandidate(
    id: string,
    key: FieldKey,
    value: unknown,
    source: SourceId,
    tier: DataTier,
    isMinMass = false,
  ): void {
    if (value === null || value === undefined) return;
    if (typeof value === 'string' && value.trim() === '') return;
    const numeric = typeof value === 'number' ? num(value) : null;
    const finalValue = numeric !== null ? numeric : String(value);
    if (typeof finalValue === 'number' && !Number.isFinite(finalValue)) return;

    let perEntity = this.candidates.get(id);
    if (!perEntity) {
      perEntity = new Map();
      this.candidates.set(id, perEntity);
    }
    const list = perEntity.get(key) ?? [];
    const duplicate = list.some((c) => c.source === source && c.value === finalValue);
    if (!duplicate) {
      list.push({ value: finalValue, source, fetchedAt: this.now, tier, isMinMass: isMinMass || undefined });
      perEntity.set(key, list);
    }
  }

  private createEntity(init: {
    name: string;
    host: string | null;
    letter: string | null;
    status: PlanetStatus;
    source: SourceId;
    gaiaDr3Id?: string | null;
    ticId?: string | null;
    exomastName?: string | null;
    contested?: boolean;
  }): PlanetEntity {
    const id = `e${this.counter++}`;
    const entity: PlanetEntity = {
      id,
      names: [],
      sources: [init.source],
      status: init.status,
      contested: init.contested ?? false,
      hostName: init.host,
      letter: init.letter,
      gaiaDr3Id: init.gaiaDr3Id ?? null,
      ticId: init.ticId ?? null,
      exomastName: init.exomastName ?? null,
      fields: emptyFields(),
      dedupWarnings: [],
      computed: {} as PlanetEntity['computed'],
    };
    this.entities.push(entity);
    this.byId.set(id, entity);
    this.addName(id, init.name);
    if (init.host && init.letter) {
      this.hostLetterIndex.set(`${normName(init.host)}:${init.letter}`, id);
    }
    if (entity.gaiaDr3Id) this.gaiaIndex.set(entity.gaiaDr3Id, id);
    if (entity.ticId) this.ticIndex.set(entity.ticId, id);
    return entity;
  }

  private addSource(entity: PlanetEntity, source: SourceId): void {
    if (!entity.sources.includes(source)) entity.sources.push(source);
  }

  private mergeStatus(entity: PlanetEntity, status: PlanetStatus): void {
    if (status === 'confirmed') entity.status = 'confirmed';
    else if (status === 'candidate' && entity.status === 'unknown') entity.status = 'candidate';
  }

  private matchByName(name: string): PlanetEntity | null {
    const id = this.nameIndex.get(normName(name));
    return id ? this.byId.get(id) ?? null : null;
  }

  private matchByHostLetter(host: string | null, letter: string | null): PlanetEntity | null {
    if (!host || !letter) return null;
    const id = this.hostLetterIndex.get(`${normName(host)}:${letter}`);
    return id ? this.byId.get(id) ?? null : null;
  }

  private matchByCoords(
    ra: number | null,
    dec: number | null,
    letter: string | null,
    period: number | null,
    axis: number | null,
  ): { entity: PlanetEntity | null; ambiguous: boolean } {
    if (ra === null || dec === null) return { entity: null, ambiguous: false };
    const cx = Math.floor(ra / COORD_STEP);
    const cy = Math.floor(dec / COORD_STEP);
    const found: { entity: PlanetEntity; sep: number; periodDiff: number }[] = [];

    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        for (const id of this.coordGrid.get(`${cx + dx}:${cy + dy}`) ?? []) {
          const point = this.coords.get(id);
          const entity = this.byId.get(id);
          if (!point || !entity) continue;
          const sep = angularSeparationArcsec(ra, dec, point.ra, point.dec);
          if (sep > MAX_SEPARATION_ARCSEC) continue;

          const sameLetter = Boolean(letter && entity.letter && letter === entity.letter);
          const entityPeriod = this.firstNumeric(id, 'orbper');
          const entityAxis = this.firstNumeric(id, 'orbsmax');
          const periodClose =
            period !== null && entityPeriod !== null && entityPeriod > 0
              ? Math.abs(period - entityPeriod) / entityPeriod <= 0.015
              : false;
          const axisClose =
            axis !== null && entityAxis !== null && entityAxis > 0
              ? Math.abs(axis - entityAxis) / entityAxis <= 0.03
              : false;
          if (!sameLetter && !periodClose && !axisClose) continue;

          const periodDiff =
            period !== null && entityPeriod !== null ? Math.abs(period - entityPeriod) / Math.max(period, entityPeriod) : 1;
          found.push({ entity, sep, periodDiff });
        }
      }
    }

    if (found.length === 0) return { entity: null, ambiguous: false };
    if (found.length === 1) return { entity: found[0].entity, ambiguous: false };
    const sorted = [...found].sort((a, b) => a.periodDiff - b.periodDiff);
    if (sorted[0].periodDiff < 1 && sorted[0].periodDiff !== sorted[1].periodDiff) {
      return { entity: sorted[0].entity, ambiguous: false };
    }
    return { entity: null, ambiguous: true };
  }

  private firstNumeric(id: string, key: FieldKey): number | null {
    const list = this.candidates.get(id)?.get(key) ?? [];
    for (const c of list) {
      if (typeof c.value === 'number' && Number.isFinite(c.value)) return c.value;
    }
    return null;
  }

  /** Этап A: NASA. */
  addNasa(rows: Row[]): void {
    for (const row of rows) {
      const name = pickStr(row, 'pl_name');
      if (!name) continue;

      const host = pickStr(row, 'hostname');
      const letter = pickStr(row, 'pl_letter') ?? planetLetter(name);
      const gaia = pickStr(row, 'gaia_dr3_id');
      const tic = pickStr(row, 'tic_id');
      const contested = num(row['pl_controv_flag']) === 1;

      const entity = this.createEntity({
        name,
        host,
        letter,
        status: 'confirmed',
        source: 'nasa',
        gaiaDr3Id: gaia,
        ticId: tic,
        exomastName: name,
        contested,
      });

      const ra = pickNum(row, 'ra');
      const dec = pickNum(row, 'dec');
      this.registerCoords(entity.id, ra, dec);

      const bmassProv = pickStr(row, 'pl_bmassprov')?.toLowerCase() ?? '';
      const isMinMass = bmassProv.includes('sin');

      const stLum = pickNum(row, 'st_lum');
      this.addCandidate(entity.id, 'rade', pickNum(row, 'pl_rade'), 'nasa', 'live');
      this.addCandidate(entity.id, 'masse', pickNum(row, 'pl_bmasse'), 'nasa', 'live', isMinMass);
      this.addCandidate(entity.id, 'orbper', pickNum(row, 'pl_orbper'), 'nasa', 'live');
      this.addCandidate(entity.id, 'orbsmax', pickNum(row, 'pl_orbsmax'), 'nasa', 'live');
      this.addCandidate(entity.id, 'ecc', pickNum(row, 'pl_orbeccen'), 'nasa', 'live');
      this.addCandidate(entity.id, 'insol', pickNum(row, 'pl_insol'), 'nasa', 'live');
      this.addCandidate(entity.id, 'teff', pickNum(row, 'st_teff'), 'nasa', 'live');
      this.addCandidate(entity.id, 'rad', pickNum(row, 'st_rad'), 'nasa', 'live');
      this.addCandidate(entity.id, 'mass', pickNum(row, 'st_mass'), 'nasa', 'live');
      if (stLum !== null) this.addCandidate(entity.id, 'lum', Math.pow(10, stLum), 'nasa', 'live');
      this.addCandidate(entity.id, 'spectype', pickStr(row, 'st_spectype'), 'nasa', 'live');
      this.addCandidate(entity.id, 'dist', pickNum(row, 'sy_dist'), 'nasa', 'live');
      this.addCandidate(entity.id, 'ra', ra, 'nasa', 'live');
      this.addCandidate(entity.id, 'dec', dec, 'nasa', 'live');
    }
  }

  /** Этап B1: Exo-MerCat. */
  addExomercat(rows: Row[]): void {
    for (const row of rows) {
      const name = pickStr(row, 'exomercat_name', 'name');
      if (!name) continue;

      const nasaName = pickStr(row, 'nasa_name');
      const euName = pickStr(row, 'eu_name');
      const host = pickStr(row, 'host');
      const letter = pickStr(row, 'letter') ?? planetLetter(name);
      const ra = pickNum(row, 'main_id_ra');
      const dec = pickNum(row, 'main_id_dec');
      const period = pickNum(row, 'p');
      const axis = pickNum(row, 'a');

      // S0: явная связь через nasa_name
      let entity = nasaName ? this.matchByName(nasaName) : null;
      if (!entity && euName) {
        const linkedId = this.crossLinks.get(normName(euName));
        if (linkedId) entity = this.byId.get(linkedId) ?? null;
      }
      // S1
      if (!entity) entity = this.matchByName(name);
      // S2
      if (!entity) entity = this.matchByHostLetter(host, letter);
      // S3
      let ambiguous = false;
      if (!entity) {
        const match = this.matchByCoords(ra, dec, letter, period, axis);
        entity = match.entity;
        ambiguous = match.ambiguous;
      }
      if (ambiguous) {
        this.warnings.push(`Exo-MerCat «${name}»: координатное совпадение неоднозначно — запись не склеена`);
      }

      if (!entity) {
        const statusRaw = (pickStr(row, 'status') ?? '').toLowerCase();
        const status: PlanetStatus =
          statusRaw.includes('confirm') ? 'confirmed' : statusRaw.includes('candidate') || statusRaw.includes('false') ? 'candidate' : 'unknown';
        entity = this.createEntity({ name, host, letter, status, source: 'exomercat', exomastName: name });
      } else {
        this.addSource(entity, 'exomercat');
      }

      this.addName(entity.id, name);
      if (nasaName) this.addName(entity.id, nasaName);
      if (euName) {
        this.addName(entity.id, euName);
        this.crossLinks.set(normName(euName), entity.id);
      }
      this.registerCoords(entity.id, ra, dec);

      const massJup = pickNum(row, 'mass');
      const msiniJup = pickNum(row, 'msini');
      if (massJup !== null) {
        this.addCandidate(entity.id, 'masse', massJup * JUPITER_MASS_TO_EARTH, 'exomercat', 'live');
      } else if (msiniJup !== null) {
        this.addCandidate(entity.id, 'masse', msiniJup * JUPITER_MASS_TO_EARTH, 'exomercat', 'live', true);
      }
      const radiusJup = pickNum(row, 'r');
      if (radiusJup !== null) this.addCandidate(entity.id, 'rade', radiusJup * JUPITER_RADIUS_TO_EARTH, 'exomercat', 'live');
      this.addCandidate(entity.id, 'orbper', period, 'exomercat', 'live');
      this.addCandidate(entity.id, 'orbsmax', axis, 'exomercat', 'live');
      this.addCandidate(entity.id, 'ecc', pickNum(row, 'e'), 'exomercat', 'live');
      this.addCandidate(entity.id, 'ra', ra, 'exomercat', 'live');
      this.addCandidate(entity.id, 'dec', dec, 'exomercat', 'live');
    }
  }

  /** Этап B2: Exoplanet.eu. */
  addExoplanetEu(rows: Row[]): void {
    for (const row of rows) {
      const name = pickStr(row, 'target_name', 'granule_uid');
      if (!name) continue;
      const aliases = splitAliases(pickStr(row, 'alt_target_name'));
      const host = pickStr(row, 'star_name');
      const letter = planetLetter(name);
      const ra = pickNum(row, 'ra');
      const dec = pickNum(row, 'dec');
      const period = pickNum(row, 'orbital_period', 'period');
      const axis = pickNum(row, 'semi_major_axis');

      // S0: связь из Exo-MerCat
      let entity: PlanetEntity | null = null;
      for (const candidateName of [name, ...aliases]) {
        const linked = this.crossLinks.get(normName(candidateName));
        if (linked) {
          entity = this.byId.get(linked) ?? null;
          break;
        }
      }
      // S1
      if (!entity) {
        for (const candidateName of [name, ...aliases]) {
          entity = this.matchByName(candidateName);
          if (entity) break;
        }
      }
      // S2
      if (!entity) entity = this.matchByHostLetter(host, letter);

      let ambiguous = false;
      if (!entity) {
        const match = this.matchByCoords(ra, dec, letter, period, axis);
        entity = match.entity;
        ambiguous = match.ambiguous;
      }
      if (ambiguous) {
        this.warnings.push(`Exoplanet.eu «${name}»: координатное совпадение неоднозначно — запись не склеена`);
      }

      if (!entity) {
        const pub = (pickStr(row, 'publication_status') ?? '').toLowerCase();
        const status: PlanetStatus = pub.includes('confirm') ? 'confirmed' : pub.includes('candidate') || pub.includes('false') || pub.includes('retract') ? 'candidate' : 'unknown';
        entity = this.createEntity({ name, host, letter, status, source: 'exoplanet_eu', exomastName: name });
      } else {
        this.addSource(entity, 'exoplanet_eu');
      }

      for (const alias of [name, ...aliases]) this.addName(entity.id, alias);
      this.registerCoords(entity.id, ra, dec);

      const massJup = pickNum(row, 'mass');
      const msiniJup = pickNum(row, 'mass_sin_i');
      if (massJup !== null) this.addCandidate(entity.id, 'masse', massJup * JUPITER_MASS_TO_EARTH, 'exoplanet_eu', 'live');
      else if (msiniJup !== null) this.addCandidate(entity.id, 'masse', msiniJup * JUPITER_MASS_TO_EARTH, 'exoplanet_eu', 'live', true);

      const radiusJup = pickNum(row, 'radius');
      if (radiusJup !== null) this.addCandidate(entity.id, 'rade', radiusJup * JUPITER_RADIUS_TO_EARTH, 'exoplanet_eu', 'live');

      this.addCandidate(entity.id, 'orbper', period, 'exoplanet_eu', 'live');
      this.addCandidate(entity.id, 'orbsmax', axis, 'exoplanet_eu', 'live');
      this.addCandidate(entity.id, 'ecc', pickNum(row, 'eccentricity'), 'exoplanet_eu', 'live');
      this.addCandidate(entity.id, 'teff', pickNum(row, 'star_teff'), 'exoplanet_eu', 'live');
      this.addCandidate(entity.id, 'rad', pickNum(row, 'star_radius'), 'exoplanet_eu', 'live');
      this.addCandidate(entity.id, 'mass', pickNum(row, 'star_mass'), 'exoplanet_eu', 'live');
      this.addCandidate(entity.id, 'spectype', pickStr(row, 'star_spec_type', 'star_sp_type'), 'exoplanet_eu', 'live');
      this.addCandidate(entity.id, 'dist', pickNum(row, 'star_distance', 'distance'), 'exoplanet_eu', 'live');
      this.addCandidate(entity.id, 'ra', ra, 'exoplanet_eu', 'live');
      this.addCandidate(entity.id, 'dec', dec, 'exoplanet_eu', 'live');
    }
  }

  /** Этап C: Gaia по source_id из NASA. */
  addGaia(rows: Map<string, Row>): void {
    for (const entity of this.entities) {
      if (!entity.gaiaDr3Id) continue;
      const key = String(Number(entity.gaiaDr3Id.replace(/^Gaia DR3\s*/i, '').trim()));
      const row = rows.get(key);
      if (!row) continue;
      this.addSource(entity, 'gaia');
      this.addCandidate(entity.id, 'teff', pickNum(row, 'teff_gspphot'), 'gaia', 'live');
      this.addCandidate(entity.id, 'rad', pickNum(row, 'radius_gspphot', 'radius_flame'), 'gaia', 'live');
      this.addCandidate(entity.id, 'mass', pickNum(row, 'mass_flame'), 'gaia', 'live');
      this.addCandidate(entity.id, 'lum', pickNum(row, 'lum_flame'), 'gaia', 'live');
      const plx = pickNum(row, 'parallax');
      const plxErr = pickNum(row, 'parallax_over_error');
      if (plx !== null && plx > 0 && (plxErr === null || plxErr >= 5)) {
        this.addCandidate(entity.id, 'dist', 1000 / plx, 'gaia', 'live');
      }
    }
  }

  /** Этап C: SIMBAD по точным идентификаторам. */
  addSimbad(rows: Map<string, Row>): void {
    for (const entity of this.entities) {
      const keys = [entity.gaiaDr3Id, entity.ticId].filter((v): v is string => Boolean(v));
      let row: Row | undefined;
      for (const key of keys) {
        row = rows.get(key);
        if (row) break;
      }
      if (!row) continue;
      this.addSource(entity, 'simbad');
      this.addCandidate(entity.id, 'spectype', pickStr(row, 'sp_type'), 'simbad', 'live');
      const plx = pickNum(row, 'plx_value');
      if (plx !== null && plx > 0) this.addCandidate(entity.id, 'dist', 1000 / plx, 'simbad', 'live');
      this.addCandidate(entity.id, 'ra', pickNum(row, 'ra'), 'simbad', 'live');
      this.addCandidate(entity.id, 'dec', pickNum(row, 'dec'), 'simbad', 'live');
    }
  }

  private resolveField(entity: PlanetEntity, key: FieldKey): FieldValue {
    const list = this.candidates.get(entity.id)?.get(key) ?? [];
    if (list.length === 0) return defaultField();

    const sorted = [...list].sort((a, b) => {
      if (key === 'masse' && Boolean(a.isMinMass) !== Boolean(b.isMinMass)) {
        return a.isMinMass ? 1 : -1;
      }
      return priorityIndex(key, a.source) - priorityIndex(key, b.source);
    });

    const numericValues = sorted.filter((c) => typeof c.value === 'number').map((c) => c.value as number);
    const chosen = sorted[0];
    let chosenFinal = chosen;
    let conflict = false;

    if (numericValues.length >= 2 && typeof chosen.value === 'number') {
      const med = median(numericValues);
      if (med !== null && !withinTolerance(key, chosen.value, med)) {
        if (sorted.length === 2) {
          conflict = true;
        } else {
          const nearest = [...sorted].sort(
            (a, b) => Math.abs((a.value as number) - med) - Math.abs((b.value as number) - med),
          )[0];
          chosenFinal = nearest;
          conflict = nearest.source !== chosen.source;
        }
      } else if (med !== null) {
        const spread = Math.max(...numericValues) - Math.min(...numericValues);
        const tol = CONSENSUS_TOLERANCE[key];
        const allowed = tol?.abs ?? (med !== 0 ? Math.abs(med) * (tol?.rel ?? 0) : 0);
        if (allowed > 0 && spread > allowed) conflict = true;
      }
    }

    const alternatives = sorted.filter((c) => c !== chosenFinal);
    return {
      value: chosenFinal.value,
      origin: 'measured',
      source: chosenFinal.source,
      fetchedAt: chosenFinal.fetchedAt,
      tier: chosenFinal.tier,
      conflict,
      alternatives,
      isMinMass: chosenFinal.isMinMass,
    };
  }

  /** Финализация: резолв полей, расчёт индексов, сортировка имён. */
  finalize(): PlanetEntity[] {
    for (const entity of this.entities) {
      const fields = emptyFields();
      for (const key of FIELD_KEYS) fields[key] = this.resolveField(entity, key);
      entity.fields = fields;
      const conservative = solvePlanet(fields, { hzBound: 'conservative' });
      const optimistic = solvePlanet(fields, { hzBound: 'optimistic' });
      entity.computed = {
        ...conservative,
        fHzOpt: optimistic.fHz,
        hzdOpt: optimistic.hzd,
        dInOpt: optimistic.dIn,
        dOutOpt: optimistic.dOut,
        hzOptValid: optimistic.hzValid,
        qDataAdaptiveOpt: optimistic.qDataAdaptive,
        availableSubindexesOpt: optimistic.availableSubindexes,
      };
    }
    return this.entities;
  }
}

export function mergeSources(input: {
  nasa: Row[];
  exomercat: Row[];
  exoplanetEu: Row[];
  gaia: Map<string, Row>;
  simbad: Map<string, Row>;
  now: string;
}): { entities: PlanetEntity[]; warnings: string[] } {
  const merger = new Merger({ now: input.now });
  merger.addNasa(input.nasa);
  merger.addExomercat(input.exomercat);
  merger.addExoplanetEu(input.exoplanetEu);
  merger.addGaia(input.gaia);
  merger.addSimbad(input.simbad);
  const entities = merger.finalize();
  return { entities, warnings: merger.dedupWarnings };
}

export function gazetteer(rows: Row[]): { gaiaIds: string[]; simbadIds: string[] } {
  const gaia = new Set<string>();
  const simbad = new Set<string>();
  for (const row of rows) {
    const gaiaId = pickStr(row, 'gaia_dr3_id');
    if (gaiaId) {
      gaia.add(gaiaId);
      simbad.add(gaiaId);
    }
    const tic = pickStr(row, 'tic_id');
    if (tic) simbad.add(tic);
  }
  return { gaiaIds: [...gaia], simbadIds: [...simbad] };
}

export { SOURCE_CONFIG };
