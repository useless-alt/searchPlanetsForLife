import { createApiClient, type ApiClient } from './client';
import { createStaticApiClient } from './staticClient';

/**
 * Клиент API по умолчанию (задача 12, п. 10.1).
 *
 * Обычная сборка работает с REST-сервером (`apps/server`, `/api/*`).
 * Сборка для GitHub Pages задаёт `VITE_STATIC_DATA=1` — тогда данные
 * читаются из файла `data/catalog.json.gz`, который кладёт в сборку
 * `scripts/prepare-static-data.mjs`. Выбор режима — на этапе сборки,
 * поэтому на страницу не попадает ни одного серверного адреса.
 */
export function createDefaultApiClient(): ApiClient {
  const staticMode = import.meta.env.VITE_STATIC_DATA === '1';

  return staticMode ? createStaticApiClient() : createApiClient();
}
