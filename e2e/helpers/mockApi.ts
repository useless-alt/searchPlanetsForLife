import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Page } from '@playwright/test';
import type {
  CatalogResponse,
  ErrorLogEntry,
  ExoMastProps,
  SourceStatus,
  SourceState,
  StatusResponse,
} from '@exo/shared';

/**
 * Заглушка REST API каталога для Playwright (задача 27a).
 *
 * Перехватывает четыре адреса, которые вызывает приложение:
 * `GET /api/status`, `GET /api/catalog`, `GET /api/errors`,
 * `GET /api/planets/:id/exomast` (+ спектры). Сеть не используется:
 * каталог читается из `e2e/fixtures/catalog.json`, который собирает
 * `npm run pretest:shots`.
 *
 * Режимы:
 * - `ok` — все шесть источников обновлены;
 * - `degraded` — NASA и Exoplanet.eu взяты из резервной копии,
 *   Exo-MerCat без резерва (баннеры и статусы п. 8.3);
 * - `loading` — первая сборка: экран загрузки, статусы «Ожидание…»
 *   (состояние A1 в `scripts/design-shots.mjs`).
 */

/** Режим заглушки. */
export type MockApiMode = 'ok' | 'degraded' | 'loading';

/** Параметры установки заглушки. */
export interface MockApiOptions {
  /** Режим ответов; по умолчанию `ok`. */
  mode?: MockApiMode;
}

/** Время резервной копии в degraded-режиме. */
const BACKUP_AT = '2026-11-13T21:40:00.000Z';

/** Время сборки снимка в статусе. */
const STARTED_AT = '2026-11-14T09:00:00.000Z';

/** Каталог, прочитанный один раз на процесс. */
let cachedCatalog: CatalogResponse | null = null;

/** Читает `e2e/fixtures/catalog.json`. */
export function loadFixtureCatalog(): CatalogResponse {
  if (cachedCatalog !== null) return cachedCatalog;

  const file = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../fixtures/catalog.json',
  );

  cachedCatalog = JSON.parse(readFileSync(file, 'utf8')) as CatalogResponse;

  return cachedCatalog;
}

/** Статус источника в выбранном режиме. */
function sourceStatus(status: SourceStatus, mode: MockApiMode): SourceStatus {
  if (mode === 'degraded' && (status.source === 'nasa' || status.source === 'exoplanet_eu')) {
    return { ...status, state: 'backup', backupAt: BACKUP_AT, message: null };
  }

  if (mode === 'degraded' && status.source === 'exomercat') {
    return {
      ...status,
      state: 'error_no_backup',
      backupAt: null,
      message: 'HTTP 503: архив недоступен',
    };
  }

  const state: SourceState = mode === 'loading' ? 'pending' : 'updated';

  return { ...status, state, backupAt: null, message: null };
}

/** Ответ `GET /api/status`. */
export function mockStatus(mode: MockApiMode): StatusResponse {
  const catalog = loadFixtureCatalog();

  return {
    phase: mode === 'loading' ? 'loading' : 'ready',
    refreshing: false,
    startedAt: STARTED_AT,
    finishedAt: mode === 'loading' ? null : STARTED_AT,
    sources: catalog.sources.map((status) => sourceStatus(status, mode)),
    hasSnapshot: mode !== 'loading',
  };
}

/** Минимальные свойства Exo.MAST: пустая атмосфера, без спектров. */
export function mockExoMastProps(planetId: string): ExoMastProps {
  const catalog = loadFixtureCatalog();
  const planet = catalog.planets.find((item) => item.id === planetId);

  return {
    planetId,
    fetchedAt: STARTED_AT,
    fromBackup: false,
    catalog: 'nexsci',
    raw: {},
    extracted: {},
    canonicalName: planet?.name ?? null,
    atmosphere: { molecules: [], keys: [] },
    spectraFiles: [],
  };
}

/**
 * Ставит заглушку API на страницу.
 *
 * Вызывать до `page.goto`: маршруты должны быть зарегистрированы раньше
 * первого запроса приложения.
 */
export async function installMockApi(page: Page, options: MockApiOptions = {}): Promise<void> {
  const mode = options.mode ?? 'ok';
  const catalog = loadFixtureCatalog();

  await page.route('**/api/status*', async (route) => {
    await route.fulfill({ status: 200, json: mockStatus(mode) });
  });

  await page.route('**/api/catalog*', async (route) => {
    if (mode === 'loading') {
      await route.fulfill({ status: 503, json: { error: 'catalog_not_ready' } });
      return;
    }

    // Статусы источников в ответе каталога тоже подменяются: хранилище
    // берёт их из снимка, иначе degraded-режим теряет баннеры (п. 8.3).
    await route.fulfill({ status: 200, json: { ...catalog, sources: mockStatus(mode).sources } });
  });

  await page.route('**/api/refresh', async (route) => {
    await route.fulfill({ status: 202, json: { started: true } });
  });

  await page.route('**/api/errors*', async (route) => {
    const errors: ErrorLogEntry[] = [];

    await route.fulfill({ status: 200, json: errors });
  });

  await page.route('**/api/planets/*/exomast/spectra*', async (route) => {
    await route.fulfill({ status: 404, json: { error: 'spectrum_not_found' } });
  });

  await page.route('**/api/planets/*/exomast', async (route) => {
    const id = new URL(route.request().url()).pathname.split('/').at(-2) ?? '';
    const known = catalog.planets.some((planet) => planet.id === id);

    if (!known) {
      await route.fulfill({ status: 404, json: { error: 'planet_not_found' } });
      return;
    }

    await route.fulfill({
      status: 200,
      json: { props: mockExoMastProps(id), status: 'updated' },
    });
  });
}
