import type { SourceRecord, StarRecord } from '../types/sources';

/**
 * Детерминированный тестовый каталог (задача 27a).
 *
 * Набор нужен трём вещам сразу: unit-тестам слияния и решателя, заглушке
 * API для скриншотов (`scripts/build-fixture-catalog.ts`) и e2e-тестам
 * (задача 27d). Поэтому данные не случайны «на глаз», а воспроизводятся
 * от одного зерна: `mulberry32(20261114)`.
 *
 * Состав — 82 записи планет: 80 уникальных планет и тройной дубль
 * (`dup`), который даёт 2 лишние записи. Каждая запись — обычный
 * `SourceRecord` из задачи 8, то есть проходит настоящий конвейер
 * `mergeCatalog` → `solveCatalog`, а не подставленные готовые результаты.
 *
 * Почему у синтетических планет есть масса и большая полуось, хотя в
 * постановке перечислены только пять величин: без них решатель не набирает
 * k ≥ 3, все 52 планеты уходят в кандидаты, и таблица Топ-50 оказывается
 * пустой — на таком наборе нельзя ни проверить интерфейс, ни снять кадры.
 * Обе величины выводятся из того же зерна и в разумных физических
 * диапазонах (масса растёт с радиусом, большая полуось — 0.02…4 а.е.).
 *
 * Звёздных записей нет намеренно: звёздные параметры в наборе лежат в
 * планетных записях (как в NASA Exoplanet Archive), а слияние проверяется
 * ровно в той форме, в которой его получает сервер. Пустой массив звёзд —
 * допустимый вход `mergeCatalog`.
 */

/** Зерно генератора: фиксировано, чтобы набор не менялся между запусками. */
export const DATASET_SEED = 20261114;

/** Время получения данных во всех записях. */
const FETCHED_AT = '2026-11-14T08:00:00.000Z';

/** Источники набора (п. 5, 5.1). */
const NASA = 'nasa' as const;
const EU = 'exoplanet_eu' as const;
const EMC = 'exomercat' as const;

/** Генератор псевдослучайных чисел mulberry32. */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;

  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);

    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/** Стабильный slug имени (повторяет `apps/server/src/merge/ids.ts`, U17). */
function slug(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9._-]/g, '');
}

/** Долгое имя планеты: 48 символов плюс буква компонента. */
const LONG_PLANET = 'Very-Long-Planet-Name-For-Truncation-TestABCDE';

/** Долгое имя системы: 40 символов. */
const LONG_HOST = 'Long-System-Name-For-Truncation-TestsABC';

/** Координаты и расстояние планеты. */
interface Coordinates {
  /** Прямое восхождение [°]. */
  ra: number;
  /** Склонение [°]. */
  dec: number;
  /** Расстояние [пк]. */
  dist: number;
}

/** Описание синтетической планеты до превращения в записи источников. */
interface PlanetSpec {
  /** Отображаемое имя. */
  name: string;
  /** Имя родительской звезды; null — звезда неизвестна. */
  hostname: string | null;
  /** Буква компонента. */
  letter: string | null;
  /** Сырые параметры. */
  params: Record<string, number>;
  /** Источники, в которых есть запись. */
  sources: readonly ('nasa' | 'exoplanet_eu' | 'exomercat')[];
  /** Альтернативные имена (для дубля Exoplanet.eu — `eu_name`). */
  aliases?: string[];
  /** Планета без координат. */
  noCoords?: boolean;
}

/** Запись источника из описания планеты. */
function makeRecord(
  source: 'nasa' | 'exoplanet_eu' | 'exomercat',
  spec: PlanetSpec,
  coords: Coordinates | null,
  name = spec.name,
): SourceRecord {
  return {
    source,
    fetchedAt: FETCHED_AT,
    fromBackup: false,
    planetName: name,
    aliases: [...(spec.aliases ?? [])],
    hostname: spec.hostname,
    letter: spec.letter,
    hostAliases: [],
    ra: coords?.ra ?? null,
    dec: coords?.dec ?? null,
    params: { ...spec.params },
    extra: {},
  };
}

/** Параметры звезды солнечного типа. */
const SOLAR = { st_teff: 5772, st_rad: 1, st_mass: 1 } as const;

/** Фиксированные планеты набора в порядке постановки (28 уникальных). */
const FIXED: PlanetSpec[] = [
  {
    name: 'Earth-analog b',
    hostname: 'Earth-analog',
    letter: 'b',
    sources: [NASA],
    params: {
      pl_rade: 1,
      pl_bmasse: 1,
      pl_orbsmax: 1,
      pl_orbper: 365.25,
      pl_orbeccen: 0.0167,
      st_teff: 5772,
      st_rad: 1,
      st_mass: 1,
      sy_dist: 10,
    },
  },
  {
    name: 'Trappist-analog d',
    hostname: 'Trappist-analog',
    letter: 'd',
    sources: [NASA],
    params: {
      pl_rade: 0.77,
      pl_orbper: 4.049,
      pl_orbeccen: 0,
      st_mass: 0.0898,
      st_teff: 2566,
      st_rad: 0.119,
    },
  },
  {
    name: 'Radius-only b',
    hostname: 'Radius-only',
    letter: 'b',
    sources: [NASA],
    params: { pl_rade: 1.4, pl_orbper: 30, ...SOLAR },
  },
  {
    name: 'Mass-only b',
    hostname: 'Mass-only',
    letter: 'b',
    sources: [NASA],
    params: { pl_bmasse: 5, pl_orbper: 60, ...SOLAR },
  },
  {
    name: 'Insufficient b',
    hostname: 'Insufficient',
    letter: 'b',
    sources: [NASA],
    params: { pl_orbper: 200, ...SOLAR },
  },
  {
    name: 'Starless b',
    hostname: null,
    letter: 'b',
    sources: [NASA],
    params: { pl_rade: 1.1, pl_bmasse: 1.3, pl_orbsmax: 0.1 },
  },
  {
    name: 'Eccentric b',
    hostname: 'Eccentric',
    letter: 'b',
    sources: [NASA],
    params: {
      pl_orbeccen: 0.9,
      pl_orbsmax: 1,
      pl_orbper: 365.25,
      pl_rade: 1.1,
      pl_bmasse: 1.5,
      ...SOLAR,
    },
  },
  {
    name: 'Mininep b',
    hostname: 'Mininep',
    letter: 'b',
    sources: [NASA],
    params: {
      pl_rade: 2.5,
      pl_bmasse: 7,
      pl_orbsmax: 0.1,
      pl_orbper: 10,
      ...SOLAR,
    },
  },
  {
    name: 'Gasgiant b',
    hostname: 'Gasgiant',
    letter: 'b',
    sources: [NASA],
    params: {
      pl_rade: 11,
      pl_bmasse: 300,
      pl_orbsmax: 0.05,
      pl_orbper: 3,
      ...SOLAR,
    },
  },
  {
    name: 'Lava b',
    hostname: 'Lava',
    letter: 'b',
    sources: [NASA],
    params: {
      pl_rade: 1.3,
      pl_bmasse: 3,
      pl_orbsmax: 0.01,
      pl_orbper: 0.8,
      st_teff: 5500,
    },
  },
  {
    name: 'Ice b',
    hostname: 'Ice',
    letter: 'b',
    sources: [NASA],
    params: { pl_rade: 1, pl_bmasse: 1.2, pl_orbsmax: 2.2, ...SOLAR },
  },
  {
    name: 'Desert b',
    hostname: 'Desert',
    letter: 'b',
    sources: [NASA],
    params: { pl_rade: 1.1, pl_bmasse: 1.4, pl_orbsmax: 0.6, ...SOLAR },
  },
  {
    name: 'Mdwarf-locked b',
    hostname: 'Mdwarf-locked',
    letter: 'b',
    sources: [NASA],
    params: {
      pl_orbper: 4,
      st_teff: 3200,
      st_rad: 0.2,
      st_mass: 0.15,
      pl_rade: 1,
      pl_bmasse: 1,
    },
  },
  {
    name: 'Nocoords b',
    hostname: 'Nocoords',
    letter: 'b',
    sources: [NASA],
    noCoords: true,
    params: {
      pl_rade: 1.2,
      pl_bmasse: 2,
      pl_orbsmax: 1,
      pl_orbper: 365,
      ...SOLAR,
    },
  },
  {
    name: `${LONG_PLANET} b`,
    hostname: LONG_HOST,
    letter: 'b',
    sources: [NASA],
    params: { pl_rade: 1.5, pl_bmasse: 3, pl_orbsmax: 1, pl_orbper: 365, ...SOLAR },
  },
  {
    // Тройной дубль: NASA, Exoplanet.eu (eu_name) и Exo-MerCat.
    name: 'NASA Dup-9999 b',
    hostname: 'Dup-9999',
    letter: 'b',
    sources: [NASA, EU, EMC],
    aliases: ['Dup-9999b'],
    params: {
      pl_rade: 1.6,
      pl_bmasse: 2.5,
      pl_orbsmax: 0.9,
      pl_orbper: 300,
      pl_orbeccen: 0.1,
      ...SOLAR,
    },
  },
];

// Планеты строгого режима: все семь полей STRICT_REQUIRED_RAW измерены.
const STRICT: PlanetSpec[] = [];

for (let index = 1; index <= 12; index += 1) {
  const number = String(index).padStart(2, '0');

  STRICT.push({
    name: `Strict-ok-${number} b`,
    hostname: `Strict-ok-${number}`,
    letter: 'b',
    sources: [NASA],
    params: {
      pl_rade: 0.8 + index * 0.05,
      pl_bmasse: 1 + index * 0.15,
      pl_insol: 0.9 + index * 0.05,
      pl_orbsmax: 1.05,
      pl_orbeccen: 0.05,
      st_teff: 5780,
      st_rad: 1,
      st_mass: 1,
      st_lum: 0,
    },
  });
}

/** Сколько синтетических планет добавляется до 80 уникальных. */
const SYNTH_COUNT = 80 - FIXED.length - STRICT.length;

/** Источники синтетических планет: 4 только Exo-MerCat, 6 только Exoplanet.eu. */
function synthSources(index: number): PlanetSpec['sources'] {
  if (index > SYNTH_COUNT - 6) return [EU];
  if (index > SYNTH_COUNT - 10) return [EMC];

  return [NASA];
}

/**
 * Собирает 82 записи планет и пустой список звёздных записей.
 *
 * Функция чистая и детерминированная: каждый вызов возвращает новые объекты
 * с одинаковыми значениями.
 */
export function buildDatasetRecords(): { planets: SourceRecord[]; stars: StarRecord[] } {
  const random = mulberry32(DATASET_SEED);

  // Координаты и расстояния разыгрываются первыми и в фиксированном порядке:
  // так добавление нового поля в описание планеты не сдвигает поток.
  const coordinates: Coordinates[] = [];
  for (let index = 0; index < 80; index += 1) {
    const ra = random() * 360;
    const dec = (Math.asin(random() * 2 - 1) * 180) / Math.PI;
    const dist = 5 * 400 ** random();
    coordinates.push({ ra, dec, dist });
  }

  const specs: PlanetSpec[] = [
    ...FIXED.map((spec) => ({ ...spec, params: { ...spec.params } })),
    ...STRICT.map((spec) => ({ ...spec, params: { ...spec.params } })),
  ];

  for (let index = 1; index <= SYNTH_COUNT; index += 1) {
    const number = String(index).padStart(3, '0');
    // Радиус смещён к малым значениям: у газовых гигантов штраф P_rocky
    // практически обнуляет балл, и таблица Топ-50 остаётся пустой.
    const radius = 0.5 + 13.5 * random() ** 4;
    const orbitPeriod = 0.5 + 799.5 * random();
    const eccentricity = 0.6 * random();
    const teff = 2500 + 5000 * random();
    const starMass = 0.08 + 1.5 * random();
    const massFactor = 0.35 + 0.9 * random();
    // Целевой поток у планеты: синтетические миры — кандидаты в зоне
    // обитаемости (0.4…1.7 S⊕). Вне этого коридора F_HZ = 0, весь балл
    // обнуляется, и таблица Топ-50 остаётся полупустой.
    const fluxTarget = 0.4 + 1.3 * random();
    const semiMajor = (starMass * (orbitPeriod / 365.25) ** 2) ** (1 / 3);
    const requiredRadius = Math.sqrt(fluxTarget) * semiMajor * (5772 / teff) ** 2;
    const starRadius = Math.min(2, Math.max(0.1, requiredRadius));
    const mass = Math.min(320, Math.max(0.3, radius ** 2 * massFactor));

    specs.push({
      name: `Synth-${number} b`,
      hostname: `Synth-${number}`,
      letter: 'b',
      sources: synthSources(index),
      params: {
        pl_rade: radius,
        pl_bmasse: mass,
        pl_orbsmax: semiMajor,
        pl_orbper: orbitPeriod,
        pl_orbeccen: eccentricity,
        st_teff: teff,
        st_rad: starRadius,
        st_mass: starMass,
      },
    });
  }

  const planets: SourceRecord[] = [];

  specs.forEach((spec, index) => {
    const coords = spec.noCoords === true ? null : (coordinates[index] ?? null);

    if (coords !== null && spec.params.sy_dist === undefined) {
      spec.params.sy_dist = Number(coords.dist.toFixed(4));
    }

    if (spec.sources.length === 1) {
      planets.push(makeRecord(spec.sources[0] ?? NASA, spec, coords));
      return;
    }

    // Дубль: у Exoplanet.eu другое написание имени (eu_name), у Exo-MerCat —
    // то же имя, что у NASA.
    for (const source of spec.sources) {
      const name = source === EU ? 'Exoplanet.eu Dup-9999b' : spec.name;
      planets.push(makeRecord(source, spec, coords, name));
    }
  });

  return { planets, stars: [] };
}

/**
 * Идентификаторы фиксированных планет набора: ключ → стабильный ID (U17).
 *
 * ID — slug канонического имени, то есть имени записи NASA: ровно то, что
 * вернёт `mergeCatalog`. Тесты и заглушки API используют эту карту вместо
 * повторения строковых литералов.
 */
export const DATASET_IDS = Object.freeze({
  earthAnalog: slug('Earth-analog b'),
  trappistAnalog: slug('Trappist-analog d'),
  radiusOnly: slug('Radius-only b'),
  massOnly: slug('Mass-only b'),
  insufficient: slug('Insufficient b'),
  starless: slug('Starless b'),
  eccentric: slug('Eccentric b'),
  miniNeptune: slug('Mininep b'),
  gasGiant: slug('Gasgiant b'),
  lava: slug('Lava b'),
  ice: slug('Ice b'),
  desert: slug('Desert b'),
  mdwarfLocked: slug('Mdwarf-locked b'),
  noCoords: slug('Nocoords b'),
  longName: slug(`${LONG_PLANET} b`),
  dup: slug('NASA Dup-9999 b'),
  strictOk01: slug('Strict-ok-01 b'),
  strictOk02: slug('Strict-ok-02 b'),
  strictOk03: slug('Strict-ok-03 b'),
  strictOk04: slug('Strict-ok-04 b'),
  strictOk05: slug('Strict-ok-05 b'),
  strictOk06: slug('Strict-ok-06 b'),
  strictOk07: slug('Strict-ok-07 b'),
  strictOk08: slug('Strict-ok-08 b'),
  strictOk09: slug('Strict-ok-09 b'),
  strictOk10: slug('Strict-ok-10 b'),
  strictOk11: slug('Strict-ok-11 b'),
  strictOk12: slug('Strict-ok-12 b'),
} as const);

/** Ключ фиксированной планеты набора. */
export type DatasetKey = keyof typeof DATASET_IDS;
