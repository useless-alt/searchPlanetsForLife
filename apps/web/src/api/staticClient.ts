import type { CatalogResponse, ErrorLogEntry, StatusResponse } from '@exo/shared';

import { ApiError, type ApiClient, type ApiClientOptions, type CatalogResult } from './client';

/**
 * Клиент статического каталога для GitHub Pages (без сервера).
 *
 * На GitHub Pages нет `apps/server`, поэтому вместо `GET /api/catalog`
 * страница читает заранее собранный снимок `data/catalog.json`. Файл кладёт
 * в сборку `scripts/prepare-static-data.mjs`, источник — `merged/latest.json`
 * из `apps/server/data/backups`.
 *
 * Почему обычный JSON, а не `.gz`: статические серверы (в том числе
 * `vite preview`) отдают `.gz` с заголовком `Content-Encoding: gzip`,
 * браузер распаковывает тело сам, и повторная распаковка в коде ломается.
 * GitHub Pages сжимает `application/json` на лету, поэтому по сети
 * передаётся ~3 МБ вместо 49 МБ.
 *
 * Ограничения статического режима (осознанные):
 * - обновление данных делает GitHub Actions и пересобирает страницу;
 *   кнопка «Обновить данные» только перечитывает файл;
 * - журнал ошибок пуст: на странице нет серверного `error-log.jsonl`;
 * - ленивый Exo.MAST (п. 9.3) недоступен — нужен серверный прокси.
 */

/** Снимок каталога относительно базы приложения. */
export const STATIC_CATALOG_PATH = 'data/catalog.json';

/** Проверка, что ответ похож на `CatalogResponse` (п. 10.10.5). */
function isCatalogResponse(value: unknown): value is CatalogResponse {
  if (value === null || typeof value !== 'object') return false;
  const catalog = value as Partial<CatalogResponse>;
  return (
    typeof catalog.snapshot === 'object' &&
    catalog.snapshot !== null &&
    typeof catalog.snapshot.id === 'string' &&
    Array.isArray(catalog.planets) &&
    Array.isArray(catalog.sources)
  );
}

/**
 * Создаёт клиент статического каталога.
 *
 * `baseUrl` по умолчанию — `import.meta.env.BASE_URL` (для GitHub Pages это
 * `/searchPlanetsForLife/`), поэтому пути к данным не зависят от адреса сайта.
 */
export function createStaticApiClient(options: ApiClientOptions = {}): ApiClient {
  const base = (options.baseUrl ?? import.meta.env.BASE_URL ?? '/').replace(/\/+$/, '');
  const fetchImpl = options.fetchImpl;

  let cached: CatalogResponse | null = null;
  let inFlight: Promise<CatalogResponse> | null = null;

  /** Читает снимок с диска и кэширует его до следующего `refresh()`. */
  async function loadCatalog(): Promise<CatalogResponse> {
    if (cached !== null) return cached;
    if (inFlight !== null) return inFlight;

    inFlight = (async (): Promise<CatalogResponse> => {
      const send = fetchImpl ?? globalThis.fetch;
      if (typeof send !== 'function') {
        throw new Error('fetch недоступен: клиент каталога не может отправлять запросы');
      }

      const response = await send(`${base}/${STATIC_CATALOG_PATH}`, {
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) {
        throw new ApiError(response.status, 'статический снимок каталога не найден');
      }

      const parsed: unknown = await response.json();
      if (!isCatalogResponse(parsed)) {
        throw new Error(`файл ${STATIC_CATALOG_PATH} не похож на снимок каталога`);
      }

      cached = parsed;
      return parsed;
    })();

    try {
      return await inFlight;
    } finally {
      inFlight = null;
    }
  }

  return {
    async getStatus(): Promise<StatusResponse> {
      const catalog = await loadCatalog();

      // Снимок уже собран: фаза «готово», сборка не идёт.
      return {
        phase: 'ready',
        refreshing: false,
        startedAt: catalog.snapshot.builtAt,
        finishedAt: catalog.snapshot.builtAt,
        sources: catalog.sources,
        hasSnapshot: true,
      };
    },

    async getCatalog(snapshotId?: string | null): Promise<CatalogResult> {
      const catalog = await loadCatalog();

      // Тот же снимок — повторно не разбираем и не пересчитываем (10.10.5).
      if (typeof snapshotId === 'string' && snapshotId === catalog.snapshot.id) {
        return { notModified: true };
      }

      return { notModified: false, catalog };
    },

    async refresh(): Promise<'started' | 'in_progress'> {
      // Данные обновляет GitHub Actions и пересобирает страницу: здесь
      // остаётся только перечитать файл (он мог обновиться после деплоя).
      cached = null;
      return 'started';
    },

    async getErrors(): Promise<ErrorLogEntry[]> {
      // Журнала ошибок в статике нет: он живёт в файле сервера (U31).
      return [];
    },
  };
}
