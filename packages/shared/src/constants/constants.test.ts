import { describe, expect, it } from 'vitest';

import { DEFAULT_FILTERS, DEFAULT_SETTINGS } from '../types/settings';
import { PROVENANCE_ORDER } from '../types/provenance';

import {
  AU_KM,
  BACKUP_LATEST_FILENAME,
  BACKUP_MIN_VERSIONS,
  BACKUP_SCHEMA_VERSION,
  BACKUP_VERSION_PATTERN,
  CHEN_M_BREAKPOINT,
  CHEN_M_MAX,
  CHEN_R_BREAKPOINT,
  DAYS_PER_YEAR,
  EARTH_MASS_KG,
  EARTH_RADIUS_KM,
  ESI_REFERENCE,
  ESI_WEIGHT,
  F_HZ_EARTH_REFERENCE,
  GREENHOUSE_DELTA_K,
  K_MIN,
  KELVIN_TO_CELSIUS_OFFSET,
  KOPPA_COEFFICIENTS,
  P_ECC_FORMULA,
  P_STAR_M,
  P_STAR_OTHER,
  PC_TO_KM,
  PC_TO_LY,
  Q_BADGE_LABELS,
  Q_BADGE_THRESHOLDS,
  Q_BASE,
  Q_E_ASSUMED_PERIOD_EXEMPT_DAYS,
  Q_FLOOR,
  Q_PENALTY_E_ASSUMED,
  Q_PENALTY_EXCLUDED_SUBINDEX,
  Q_PENALTY_LEVEL_B,
  Q_SLIDER_MAX,
  Q_SLIDER_MIN,
  RHO_EARTH,
  ROCKY_K,
  ROCKY_R_CUTOFF,
  SOURCES,
  SOURCE_PRIORITY,
  SPECTRAL_THRESHOLDS,
  STAR_TEFF_M_CLASS,
  SUN_TEFF_K,
  T_EQ_COEFF,
  T_STAR_REF,
} from './index';

describe('коэффициенты Коппарапу (п. 2.3)', () => {
  it('консервативная внутренняя граница', () => {
    expect(KOPPA_COEFFICIENTS.conservative.inner).toEqual({
      S_sun: 1.107,
      a: 1.332e-4,
      b: 1.58e-8,
      c: -8.308e-12,
      d: -1.931e-15,
    });
  });

  it('консервативная внешняя граница', () => {
    expect(KOPPA_COEFFICIENTS.conservative.outer).toEqual({
      S_sun: 0.356,
      a: 6.171e-5,
      b: 1.698e-9,
      c: -3.198e-12,
      d: -5.575e-16,
    });
  });

  it('оптимистичная внутренняя граница', () => {
    expect(KOPPA_COEFFICIENTS.optimistic.inner).toEqual({
      S_sun: 1.776,
      a: 2.136e-4,
      b: 2.533e-8,
      c: -1.332e-11,
      d: -3.097e-15,
    });
  });

  it('оптимистичная внешняя граница', () => {
    expect(KOPPA_COEFFICIENTS.optimistic.outer).toEqual({
      S_sun: 0.32,
      a: 5.547e-5,
      b: 1.526e-9,
      c: -2.874e-12,
      d: -5.011e-16,
    });
  });

  it('опорная температура звезды и контрольное F_HZ Земли', () => {
    expect(T_STAR_REF).toBe(5780);
    expect(F_HZ_EARTH_REFERENCE).toBe(0.74);
  });
});

describe('субиндексы ESI (п. 2.1)', () => {
  it('веса w_i: {0.57, 1.07, 0.70, 1.07, 5.58}', () => {
    expect(Object.values(ESI_WEIGHT)).toEqual([0.57, 1.07, 0.7, 1.07, 5.58]);
  });

  it('эталоны x_i0: {1.0, 5.51, 1.0, 1.0, 288}', () => {
    expect(Object.values(ESI_REFERENCE)).toEqual([1.0, 5.51, 1.0, 1.0, 288]);
  });

  it('соответствие ключей эталона и веса', () => {
    expect(Object.keys(ESI_WEIGHT)).toEqual(Object.keys(ESI_REFERENCE));
    expect(Object.keys(ESI_REFERENCE)).toEqual(['R', 'rho', 'v_e', 'S', 'T_s']);
  });
});

describe('реестр источников (п. 5, 5.1)', () => {
  it('ровно 6 источников', () => {
    expect(SOURCES).toHaveLength(6);
  });

  it('ранги 1..6 без повторов', () => {
    const ranks = SOURCES.map((source) => source.rank).sort((a, b) => a - b);
    expect(ranks).toEqual([1, 2, 3, 4, 5, 6]);
    expect(new Set(SOURCES.map((source) => source.rank)).size).toBe(6);
  });

  it('эндпоинт SIMBAD содержит simbad.cfa.harvard.edu', () => {
    const simbad = SOURCES.find((source) => source.id === 'simbad');
    expect(simbad).toBeDefined();
    expect(simbad?.endpoint).toContain('simbad.cfa.harvard.edu');
  });

  it('таблицы каталогов указаны у NASA, Exoplanet.eu и Exo-MerCat', () => {
    expect(SOURCES.find((source) => source.id === 'nasa')?.table).toBe('pscomppars');
    expect(SOURCES.find((source) => source.id === 'exoplanet_eu')?.table).toBe(
      'exoplanet.epn_core',
    );
    expect(SOURCES.find((source) => source.id === 'exomercat')?.table).toBe('exomercat.exomercat');
  });

  it('приоритет источников совпадает с порядком рангов', () => {
    expect(SOURCE_PRIORITY).toEqual([
      'gaia',
      'exomast',
      'nasa',
      'exoplanet_eu',
      'simbad',
      'exomercat',
    ]);
  });
});

describe('умолчания настроек (U10)', () => {
  it('все четыре штрафа включены', () => {
    expect(DEFAULT_SETTINGS.penalties).toEqual({
      rocky: true,
      ecc: true,
      star: true,
      qdata: true,
    });
  });

  it('минимальный Q_data равен 0.75', () => {
    expect(DEFAULT_SETTINGS.qMin).toBe(0.75);
  });

  it('режим adaptive и консервативные границы', () => {
    expect(DEFAULT_SETTINGS.mode).toBe('adaptive');
    expect(DEFAULT_SETTINGS.hzBounds).toBe('conservative');
  });
});

describe('умолчания фильтров', () => {
  it('без ограничений по классам и диапазонам', () => {
    expect(DEFAULT_FILTERS.spectralClasses).toEqual([]);
    expect(DEFAULT_FILTERS.radius).toEqual({ min: null, max: null });
    expect(DEFAULT_FILTERS.T_s).toEqual({ min: null, max: null });
    expect(DEFAULT_FILTERS.e).toEqual({ min: null, max: null });
  });

  it('кандидаты и «Земля (эталон)» выключены, поиск пуст', () => {
    expect(DEFAULT_FILTERS.includeCandidates).toBe(false);
    expect(DEFAULT_FILTERS.earthReference).toBe(false);
    expect(DEFAULT_FILTERS.search).toBe('');
  });
});

describe('пороги спектральных классов (U9)', () => {
  it('границы по эффективной температуре', () => {
    expect(SPECTRAL_THRESHOLDS).toEqual([
      { cls: 'O', minTeff: 30000 },
      { cls: 'B', minTeff: 10000 },
      { cls: 'A', minTeff: 7500 },
      { cls: 'F', minTeff: 6000 },
      { cls: 'G', minTeff: 5200 },
      { cls: 'K', minTeff: 3900 },
      { cls: 'M', minTeff: 0 },
    ]);
  });
});

describe('коэффициент достоверности Q_data (п. 2.5)', () => {
  it('штрафы и пороги', () => {
    expect(Q_BASE).toBe(1.0);
    expect(Q_PENALTY_LEVEL_B).toBe(0.1);
    expect(Q_PENALTY_E_ASSUMED).toBe(0.05);
    expect(Q_PENALTY_EXCLUDED_SUBINDEX).toBe(0.05);
    expect(Q_FLOOR).toBe(0.75);
    expect(Q_E_ASSUMED_PERIOD_EXEMPT_DAYS).toBe(10);
    expect(Q_BADGE_THRESHOLDS).toEqual({ high: 0.95, medium: 0.85 });
    expect(Q_BADGE_LABELS.high).toBe('Высокая');
    expect(Q_BADGE_LABELS.medium).toBe('Средняя');
    expect(Q_BADGE_LABELS.low).toBe('Оценочная');
    expect(Q_SLIDER_MIN).toBe(0.75);
    expect(Q_SLIDER_MAX).toBe(1.0);
  });
});

describe('штрафы (п. 2.4)', () => {
  it('порог каменистости, класс M и формула эксцентриситета', () => {
    expect(ROCKY_K).toBe(5);
    expect(ROCKY_R_CUTOFF).toBe(1.65);
    expect(STAR_TEFF_M_CLASS).toBe(3900);
    expect(P_STAR_M).toBe(0.85);
    expect(P_STAR_OTHER).toBe(1.0);
    expect(P_ECC_FORMULA).toBe('1 - e^2');
  });
});

describe('константы решателя (п. 1)', () => {
  it('физические константы', () => {
    expect(SUN_TEFF_K).toBe(5772);
    expect(DAYS_PER_YEAR).toBe(365.25);
    expect(T_EQ_COEFF).toBe(255);
    expect(GREENHOUSE_DELTA_K).toBe(33);
    expect(RHO_EARTH).toBe(5.51);
    expect(K_MIN).toBe(3);
  });

  it('границы Чен — Киппинг', () => {
    expect(CHEN_R_BREAKPOINT).toBe(1.23);
    expect(CHEN_M_BREAKPOINT).toBe(2.04);
    expect(CHEN_M_MAX).toBe(132);
  });
});

describe('хранилище резервных копий (п. 8.1–8.2)', () => {
  it('имена файлов и версии', () => {
    expect(BACKUP_LATEST_FILENAME).toBe('latest.json');
    expect(BACKUP_VERSION_PATTERN).toBe('YYYYMMDD_HHMMSS');
    expect(BACKUP_MIN_VERSIONS).toBe(5);
    expect(BACKUP_SCHEMA_VERSION).toBe(1);
  });
});

describe('единицы измерения (п. 11.7)', () => {
  it('справочные величины', () => {
    expect(EARTH_RADIUS_KM).toBe(6371);
    expect(EARTH_MASS_KG).toBe(5.97e24);
    expect(KELVIN_TO_CELSIUS_OFFSET).toBe(273);
    expect(PC_TO_LY).toBe(3.26);
    expect(PC_TO_KM).toBe(3.09e13);
    expect(AU_KM).toBe(1.5e8);
  });
});

describe('происхождение значения', () => {
  it('порядок «хуже — лучше»', () => {
    expect(PROVENANCE_ORDER).toEqual({ measured: 0, physics: 1, model: 2, estimate: 3 });
  });
});
