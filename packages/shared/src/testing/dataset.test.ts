import { describe, expect, it } from 'vitest';

import { DATASET_IDS, DATASET_SEED, buildDatasetRecords } from './dataset';

/**
 * Тест тестового набора данных (задача 27a).
 *
 * Проверяет форму набора до слияния: 82 записи, 80 уникальных имён,
 * детерминированность и согласованность карты `DATASET_IDS`.
 * Поведение слияния и решателя проверяет
 * `apps/server/src/merge/dataset.test.ts` — там настоящий конвейер.
 */

describe('тестовый набор данных', () => {
  it('содержит 82 записи планет и не содержит звёздных записей', () => {
    const { planets, stars } = buildDatasetRecords();

    expect(planets).toHaveLength(82);
    expect(stars).toHaveLength(0);
  });

  it('называет дубль по-разному в трёх источниках: 81 уникальное имя на 82 записи', () => {
    const { planets } = buildDatasetRecords();
    const names = new Set(planets.map((record) => record.planetName));

    // Дубль назван по-разному в источнике Exoplanet.eu, поэтому уникальных
    // имён 81; 80 уникальных планет получается только слиянием.
    expect(names.size).toBe(81);
  });

  it('не меняет результат при повторных вызовах', () => {
    const first = buildDatasetRecords();
    const second = buildDatasetRecords();

    expect(second.planets).toEqual(first.planets);
    expect(second.stars).toEqual(first.stars);
    expect(DATASET_SEED).toBe(20261114);
  });

  it('раскладывает источники по постановке: 4 только Exo-MerCat, 6 только Exoplanet.eu', () => {
    const { planets } = buildDatasetRecords();
    const emc = planets.filter((record) => record.source === 'exomercat');
    const eu = planets.filter((record) => record.source === 'exoplanet_eu');
    const dup = planets.filter((record) => record.planetName.includes('Dup-9999'));

    expect(emc).toHaveLength(5); // 4 синтетические + дубль
    expect(eu).toHaveLength(7); // 6 синтетических + дубль
    expect(dup).toHaveLength(3);
  });

  it('строит карту DATASET_IDS в форме стабильных ID', () => {
    expect(DATASET_IDS.insufficient).toBe('insufficient-b');
    expect(DATASET_IDS.dup).toBe('nasa-dup-9999-b');
    expect(DATASET_IDS.longName.length).toBeGreaterThan(40);

    for (const id of Object.values(DATASET_IDS)) {
      expect(id).toMatch(/^[a-z0-9._-]+$/);
    }

    expect(new Set(Object.values(DATASET_IDS)).size).toBe(28);
  });

  it('оставляет планету без координат ровно одну', () => {
    const { planets } = buildDatasetRecords();
    const withoutCoords = planets.filter((record) => record.ra === null || record.dec === null);

    expect(withoutCoords).toHaveLength(1);
    expect(withoutCoords[0]?.planetName).toBe('Nocoords b');
  });

  it('держит координаты в допустимых пределах и расстояние 5…2000 пк', () => {
    const { planets } = buildDatasetRecords();

    for (const record of planets) {
      if (record.ra === null || record.dec === null) continue;

      expect(record.ra).toBeGreaterThanOrEqual(0);
      expect(record.ra).toBeLessThan(360);
      expect(record.dec).toBeGreaterThanOrEqual(-90);
      expect(record.dec).toBeLessThanOrEqual(90);

      const distance = record.params.sy_dist;

      if (distance !== undefined) {
        expect(distance).toBeGreaterThanOrEqual(5);
        expect(distance).toBeLessThanOrEqual(2000);
      }
    }
  });

  it('не мутирует описание фиксированных планет между вызовами', () => {
    const first = buildDatasetRecords();
    const earth = first.planets.find((record) => record.planetName === 'Earth-analog b');

    expect(earth?.params.sy_dist).toBe(10);
    buildDatasetRecords();
    const second = buildDatasetRecords();
    const earthAgain = second.planets.find((record) => record.planetName === 'Earth-analog b');

    expect(earthAgain?.params.sy_dist).toBe(10);
  });
});
