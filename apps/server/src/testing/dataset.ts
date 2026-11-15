/**
 * Тестовый набор данных для сервера (задача 31).
 *
 * Источник — детерминированный каталог задачи 27a
 * (`packages/shared/src/testing/dataset.ts`): 82 записи, 80 уникальных
 * планет. Этот модуль добавляет серверную обвязку:
 *
 * - строки источника в форме, которую принимает `CatalogAdapter.normalize`;
 * - одну синтетическую запись Gaia, привязанную к `earth-analog`, чтобы
 *   проверить приоритет `Gaia → NASA` (п. 7.3);
 * - пустой ответ SIMBAD: звёздные параметры набора уже лежат в планетных
 *   записях, поэтому SIMBAD не должен ничего перекрывать.
 *
 * Никаких обращений к сети здесь нет: все значения выводятся из набора
 * задачи 27a и поэтому воспроизводимы между запусками.
 */

import {
  buildDatasetRecords,
  type SourceId,
  type SourceRecord,
  type StarRecord,
} from '@exo/shared';

export { DATASET_IDS, DATASET_SEED, buildDatasetRecords } from '@exo/shared';
export type { DatasetKey } from '@exo/shared';

/** Идентификатор Gaia DR3, который получает планета `strict-ok-01`. */
export const FAKE_GAIA_ID = '1234567890123456789';

/** Имя планеты, к которой привязывается синтетическая запись Gaia. */
export const FAKE_GAIA_PLANET_NAME = 'Strict-ok-01 b';

/** Звёздные параметры синтетической записи Gaia. */
export const FAKE_GAIA_PARAMS = {
  st_teff: 6000,
  st_rad: 1.05,
  st_mass: 1.1,
  st_lum: 0.02,
} as const;

/** Источники каталога, для которых набор содержит планетные записи. */
export type DatasetSourceId = 'nasa' | 'exoplanet_eu' | 'exomercat';

/**
 * Строки источника для подмены `fetchRaw`.
 *
 * Запись отдаётся как есть: `normalize` тестового адаптера просто возвращает
 * её, поэтому резервная копия (массив строк) читается тем же путём.
 *
 * `earth-analog` получает `extra.gaiaDr3Id`: без него слияние не сможет
 * привязать звёздную запись Gaia к планете.
 */
export function buildDatasetRows(source: DatasetSourceId): SourceRecord[] {
  const { planets } = buildDatasetRecords();

  return planets
    .filter((record) => record.source === source)
    .map((record) => {
      const extra: SourceRecord['extra'] = { ...record.extra };

      if (record.planetName === FAKE_GAIA_PLANET_NAME) {
        extra.gaiaDr3Id = FAKE_GAIA_ID;
      }

      return {
        ...record,
        aliases: [...record.aliases],
        hostAliases: [...record.hostAliases],
        params: { ...record.params },
        extra,
      };
    });
}

/** Запись Gaia DR3 для каждого запрошенного идентификатора. */
export function buildFakeGaiaStars(ids: readonly string[], fetchedAt: string): StarRecord[] {
  return ids
    .filter((id) => id.trim() !== '')
    .map((id) => ({
      source: 'gaia',
      fetchedAt,
      fromBackup: false,
      key: { gaiaDr3Id: id },
      mainId: `Gaia DR3 ${id}`,
      aliases: ['Strict-ok-01'],
      ra: 0,
      dec: 0,
      params: { ...FAKE_GAIA_PARAMS },
      extra: {},
    }));
}

/**
 * Записи SIMBAD для запрошенных имён.
 *
 * Набор задачи 27a не содержит отдельных звёздных записей: все нужные
 * параметры уже в планетных записях. Поэтому источник отвечает пустым
 * списком — это успешный ответ, а не ошибка.
 */
export function buildFakeSimbadStars(): StarRecord[] {
  return [];
}

/** Подпись источника в тестовом наборе для сообщений об ошибке. */
export function datasetSourceLabel(source: SourceId): string {
  return `fake:${source}`;
}
