import {
  DEFAULT_SETTINGS,
  DATASET_IDS,
  buildDatasetRecords,
  scoreBreakdown,
  solveCatalog,
} from '@exo/shared';
import { describe, expect, it } from 'vitest';

import { mergeCatalog } from './mergeCatalog';

/**
 * Тест конвейера на тестовом наборе данных (задача 27a).
 *
 * Набор прогоняется через настоящий `mergeCatalog` (задача 10) и решатель
 * (задачи 3–4): проверяются не подставленные значения, а то, что получит
 * интерфейс. Отсюда же берётся e2e-заглушка `e2e/fixtures/catalog.json`.
 */

const dataset = buildDatasetRecords();
const merged = mergeCatalog(dataset);
const resolved = new Map(solveCatalog(merged.planets).map((planet) => [planet.id, planet]));

/** Разложение балла планеты набора в настройках по умолчанию. */
function breakdown(id: string) {
  const planet = resolved.get(id);

  if (planet === undefined) throw new Error(`Планета не найдена: ${id}`);

  return scoreBreakdown(planet, DEFAULT_SETTINGS);
}

describe('тестовый набор через слияние и решатель', () => {
  it('превращает 82 записи в 80 уникальных планет', () => {
    expect(dataset.planets).toHaveLength(82);
    expect(merged.planets).toHaveLength(80);
    expect(merged.stats.uniquePlanets).toBe(80);
    expect(merged.stats.mergedClusters).toBeGreaterThanOrEqual(1);
  });

  it('объединяет тройной дубль в одну планету с тремя источниками', () => {
    const dup = merged.planets.find((planet) => planet.id === DATASET_IDS.dup);

    expect(dup).toBeDefined();
    expect(dup?.sources).toEqual(['nasa', 'exoplanet_eu', 'exomercat']);
    expect(merged.planets.filter((planet) => planet.id.startsWith('nasa-dup-9999'))).toHaveLength(
      1,
    );
  });

  it('даёт insufficient k = 1 и insufficient_data = true', () => {
    const score = breakdown(DATASET_IDS.insufficient);

    expect(score.k).toBe(1);
    expect(score.insufficient_data).toBe(true);
    expect(score.index).toBe(0);
  });

  it('даёт starless k = 3 без F_HZ', () => {
    const planet = resolved.get(DATASET_IDS.starless);
    const score = breakdown(DATASET_IDS.starless);

    expect(planet?.flags.k).toBe(3);
    expect(planet?.flags.available.F_HZ).toBe(false);
    expect(score.F_HZ).toBeNull();
  });

  it('помечает strictOk01…12 как strict_complete', () => {
    const strictIds = Object.entries(DATASET_IDS)
      .filter(([key]) => key.startsWith('strictOk'))
      .map(([, id]) => id);

    expect(strictIds).toHaveLength(12);

    for (const id of strictIds) {
      expect(resolved.get(id)?.flags.strict_complete, id).toBe(true);
    }
  });

  it('не меняет результат слияния при повторных вызовах', () => {
    const again = mergeCatalog(buildDatasetRecords());

    expect(again.planets).toEqual(merged.planets);
    expect(again.stats).toEqual(merged.stats);
  });

  it('даёт содержательную таблицу: не меньше 45 планет с ненулевым баллом', () => {
    const scored = merged.planets.filter((planet) => {
      const score = breakdown(planet.id);

      return score.index !== null && score.index > 0;
    });

    // Ровно 50 не требуется: часть планет (мини-нептуны, горячие гиганты,
    // insufficient) законно получает F_HZ = 0 или k < 3.
    expect(scored.length).toBeGreaterThanOrEqual(45);
  });
});
