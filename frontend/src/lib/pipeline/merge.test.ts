// TEST FIXTURE: данные в этом файле используются только тестами.
import { describe, expect, it } from 'vitest';
import { JUPITER_MASS_TO_EARTH, JUPITER_RADIUS_TO_EARTH } from '../calc/num';
import { gazetteer, mergeSources } from './merge';
import type { Row } from '../sources/parser';

const NOW = '2026-11-14T00:00:00.000Z';

function merge(rows: {
  nasa?: Row[];
  exomercat?: Row[];
  eu?: Row[];
  gaia?: Row[];
  simbad?: Row[];
}) {
  return mergeSources({
    nasa: rows.nasa ?? [],
    exomercat: rows.exomercat ?? [],
    exoplanetEu: rows.eu ?? [],
    gaia: new Map((rows.gaia ?? []).map((r) => [String(r.source_id), r])),
    simbad: new Map((rows.simbad ?? []).map((r) => [String(r.query_id), r])),
    now: NOW,
  });
}

const nasaTrappist = {
  pl_name: 'TRAPPIST-1 e',
  hostname: 'TRAPPIST-1',
  pl_letter: 'e',
  pl_controv_flag: 0,
  pl_rade: 0.92,
  pl_bmasse: 0.772,
  pl_bmassprov: 'Mass',
  pl_orbper: 6.0996,
  pl_orbsmax: 0.02925,
  pl_orbeccen: 0.005,
  pl_insol: 0.646,
  st_teff: 2566,
  st_rad: 0.1192,
  st_mass: 0.0898,
  st_lum: -3.2573,
  st_spectype: 'M8V',
  sy_dist: 12.47,
  ra: 346.6225,
  dec: -5.0414,
  gaia_dr3_id: 'Gaia DR3 4567890123456789',
  tic_id: 'TIC 278892590',
};

const exomercatTrappist = {
  exomercat_name: 'TRAPPIST-1 e',
  nasa_name: 'TRAPPIST-1 e',
  eu_name: 'TRAPPIST-1 e',
  host: 'TRAPPIST-1',
  letter: 'e',
  main_id_ra: 346.6225,
  main_id_dec: -5.0414,
  p: 6.0996,
  a: 0.02925,
  e: 0.005,
  r: 0.92 / JUPITER_RADIUS_TO_EARTH,
  mass: 0.772 / JUPITER_MASS_TO_EARTH,
  status: 'confirmed',
};

const euTrappist = {
  target_name: 'TRAPPIST-1 e',
  star_name: 'TRAPPIST-1',
  ra: 346.6225,
  dec: -5.0414,
  orbital_period: 6.0996,
  semi_major_axis: 0.02925,
  eccentricity: 0.005,
  radius: 0.92 / JUPITER_RADIUS_TO_EARTH,
  mass: 0.772 / JUPITER_MASS_TO_EARTH,
  star_teff: 2566,
  star_radius: 0.1192,
  star_mass: 0.0898,
  star_distance: 12.47,
  star_spec_type: 'M8V',
  publication_status: 'Confirmed',
};

describe('дедупликация каталогов', () => {
  it('склеивает NASA, Exo-MerCat и Exoplanet.eu в одну сущность по S0-связям', () => {
    const { entities, warnings } = merge({
      nasa: [nasaTrappist],
      exomercat: [exomercatTrappist],
      eu: [euTrappist],
    });
    expect(entities).toHaveLength(1);
    const [e] = entities;
    expect(e.names[0]).toBe('TRAPPIST-1 e');
    expect(e.sources.sort()).toEqual(['exomercat', 'exoplanet_eu', 'nasa']);
    expect(e.status).toBe('confirmed');
    expect(e.fields.rade.value).toBeCloseTo(0.92, 3);
    expect(e.fields.rade.source).toBe('nasa');
    expect(e.fields.masse.value).toBeCloseTo(0.772, 3);
    expect(e.fields.teff.value).toBe(2566);
    expect(e.fields.dist.value).toBeCloseTo(12.47, 2);
    expect(e.computed.radiusUsed).toBeCloseTo(0.92, 3);
    expect(e.computed.insufficientData).toBe(false);
    expect(warnings).toEqual([]);
  });

  it('склеивает Exo-MerCat и Exoplanet.eu через eu_name', () => {
    const { entities } = merge({
      exomercat: [exomercatTrappist],
      eu: [{ ...euTrappist, target_name: 'TRAPPIST-1 e', star_name: 'TRAPPIST-1' }],
    });
    expect(entities).toHaveLength(1);
    expect(entities[0].sources.sort()).toEqual(['exomercat', 'exoplanet_eu']);
    expect(entities[0].names).toContain('TRAPPIST-1 e');
  });

  it('склеивает по host+letter без явной ссылки', () => {
    const { entities } = merge({
      nasa: [
        {
          pl_name: 'Kepler-452 b',
          hostname: 'Kepler-452',
          pl_letter: 'b',
          pl_rade: 1.63,
          pl_bmasse: 5,
          pl_orbper: 384.84,
          st_teff: 5757,
          st_lum: 0.0453,
          sy_dist: 550,
          ra: 294.2167,
          dec: 44.2775,
        },
      ],
      eu: [
        {
          target_name: 'Kepler-452 b',
          star_name: 'Kepler-452',
          ra: 294.2167,
          dec: 44.2775,
          orbital_period: 384.84,
          radius: 1.63 / JUPITER_RADIUS_TO_EARTH,
          publication_status: 'Confirmed',
        },
      ],
    });
    expect(entities).toHaveLength(1);
    expect(entities[0].sources.sort()).toEqual(['exoplanet_eu', 'nasa']);
  });

  it('склеивает по координатам и периоду (S3), если имя и host различаются', () => {
    const { entities } = merge({
      nasa: [
        {
          pl_name: 'K2-18 b',
          hostname: 'K2-18',
          pl_letter: 'b',
          pl_rade: 2.61,
          pl_bmasse: 8.63,
          pl_orbper: 32.94,
          ra: 172.56,
          dec: 7.59,
          sy_dist: 38.1,
        },
      ],
      eu: [
        {
          target_name: 'EPIC 201912552 b',
          star_name: 'EPIC 201912552',
          ra: 172.5601,
          dec: 7.5902,
          orbital_period: 32.94,
          semi_major_axis: 0.1429,
          publication_status: 'Confirmed',
        },
      ],
    });
    expect(entities).toHaveLength(1);
    expect(entities[0].names).toContain('EPIC 201912552 b');
    expect(entities[0].sources.sort()).toEqual(['exoplanet_eu', 'nasa']);
  });

  it('не склеивает планеты разных систем с близкими именами', () => {
    const { entities } = merge({
      nasa: [
        { ...nasaTrappist, pl_name: 'TRAPPIST-1 e', hostname: 'TRAPPIST-1', ra: 346.62, dec: -5.04 },
        {
          ...nasaTrappist,
          pl_name: 'TRAPPIST-1 f',
          hostname: 'TRAPPIST-1',
          pl_letter: 'f',
          pl_orbper: 9.206,
          ra: 346.63,
          dec: -5.05,
        },
      ],
    });
    expect(entities).toHaveLength(2);
  });
});

describe('консенсус и приоритеты', () => {
  it('при двух кандидатах оставляет приоритетный и помечает конфликт', () => {
    const { entities } = merge({
      nasa: [{ ...nasaTrappist, pl_rade: 1.0 }],
      eu: [
        {
          ...euTrappist,
          radius: 2.0 / JUPITER_RADIUS_TO_EARTH,
        },
      ],
    });
    const radius = entities[0].fields.rade;
    expect(radius.value).toBeCloseTo(1.0, 6);
    expect(radius.source).toBe('nasa');
    expect(radius.conflict).toBe(true);
    expect(radius.alternatives).toHaveLength(1);
    expect(radius.alternatives[0].value).toBeCloseTo(2.0, 4);
  });

  it('не помечает конфликт в пределах допуска', () => {
    const { entities } = merge({
      nasa: [{ ...nasaTrappist, pl_rade: 1.0 }],
      eu: [
        {
          ...euTrappist,
          radius: 1.1 / JUPITER_RADIUS_TO_EARTH,
        },
      ],
    });
    expect(entities[0].fields.rade.conflict).toBe(false);
  });

  it('Gaia перекрывает NASA для параметров звезды', () => {
    const { entities } = merge({
      nasa: [nasaTrappist],
      gaia: [
        {
          source_id: '4567890123456789',
          teff_gspphot: 2600,
          radius_gspphot: 0.12,
          mass_flame: 0.09,
          lum_flame: 0.00056,
          parallax: 20,
          parallax_over_error: 30,
        },
      ],
    });
    expect(entities).toHaveLength(1);
    expect(entities[0].sources).toContain('gaia');
    expect(entities[0].fields.teff.source).toBe('gaia');
    expect(entities[0].fields.teff.value).toBe(2600);
    expect(entities[0].fields.dist.source).toBe('nasa');
  });

  it('SIMBAD даёт спектральный тип приоритетнее NASA', () => {
    const { entities } = merge({
      nasa: [nasaTrappist],
      simbad: [
        {
          query_id: 'Gaia DR3 4567890123456789',
          main_id: 'TRAPPIST-1',
          sp_type: 'M8.0V',
          plx_value: 80.2,
          ra: 346.6225,
          dec: -5.0414,
        },
      ],
    });
    expect(entities[0].sources).toContain('simbad');
    expect(entities[0].fields.spectype.value).toBe('M8.0V');
    expect(entities[0].fields.spectype.source).toBe('simbad');
  });

  it('M·sin(i) проигрывает истинной массе и блокирует строгий режим', () => {
    const nasaMsini = { ...nasaTrappist, pl_bmassprov: 'Msini', pl_bmasse: 0.772 };
    const withTrueMass = merge({
      nasa: [nasaMsini],
      exomercat: [exomercatTrappist],
    });
    expect(withTrueMass.entities[0].fields.masse.isMinMass).toBeFalsy();
    expect(withTrueMass.entities[0].fields.masse.source).toBe('exomercat');

    const onlyMsini = merge({ nasa: [nasaMsini] });
    expect(onlyMsini.entities[0].fields.masse.isMinMass).toBe(true);
    expect(onlyMsini.entities[0].computed.massUsed).toBeCloseTo(0.772, 4);
  });

  it('игнорирует NaN, пустые строки и нечисловые значения', () => {
    const { entities } = merge({
      nasa: [
        {
          pl_name: 'Bad Data b',
          hostname: 'Bad Data',
          pl_letter: 'b',
          pl_rade: 'NaN',
          pl_bmasse: '',
          pl_orbper: 'null',
          st_teff: 5000,
          ra: 'not-a-number',
          dec: 10,
        },
      ],
    });
    const e = entities[0];
    expect(e.fields.rade.value).toBeNull();
    expect(e.fields.masse.value).toBeNull();
    expect(e.fields.orbper.value).toBeNull();
    expect(e.fields.teff.value).toBe(5000);
    expect(e.fields.ra.value).toBeNull();
    expect(e.fields.dec.value).toBe(10);
  });
});

describe('кандидаты и статусы', () => {
  it('скрывает кандидатов по умолчанию, но сохраняет в базе', () => {
    const { entities } = merge({
      exomercat: [
        {
          exomercat_name: 'K2-999 c',
          host: 'K2-999',
          letter: 'c',
          status: 'candidate',
          p: 12,
          a: 0.1,
        },
      ],
    });
    expect(entities[0].status).toBe('candidate');
    expect(entities[0].names[0]).toBe('K2-999 c');
  });

  it('помечает спорные планеты из NASA', () => {
    const { entities } = merge({
      nasa: [{ ...nasaTrappist, pl_controv_flag: 1 }],
    });
    expect(entities[0].contested).toBe(true);
  });
});

describe('gazetteer', () => {
  it('собирает Gaia DR3 и TIC идентификаторы', () => {
    const { gaiaIds, simbadIds } = gazetteer([
      { gaia_dr3_id: 'Gaia DR3 111', tic_id: 'TIC 222' },
      { gaia_dr3_id: 'Gaia DR3 111', tic_id: null },
      {},
    ]);
    expect(gaiaIds).toEqual(['Gaia DR3 111']);
    expect(simbadIds.sort()).toEqual(['Gaia DR3 111', 'TIC 222'].sort());
  });
});
