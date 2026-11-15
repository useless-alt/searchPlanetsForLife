/**
 * Фикстура тестового сервера (задача 31, п. 1).
 *
 * `serverFixture({ failures, preseedBackups, exomast })` поднимает на каждый
 * набор тестов (worker) отдельный процесс сервера:
 *
 * - `EXO_TEST_MODE=1` — поддельные источники, без внешней сети;
 * - `BACKUP_DIR` — временный каталог, удаляется после набора;
 * - `PORT` — свободный порт (не 8787, чтобы не мешать dev-серверу);
 * - `EXO_FAIL` — внедрение сбоев;
 * - `EXO_PRESEED_BACKUPS` — заранее положенные резервные копии;
 * - `EXO_FAKE_EXOMAST` — сценарий Exo.MAST.
 *
 * Вместе с API поднимается `vite preview` с `VITE_API_PROXY_TARGET` на этот
 * порт: приложение обращается к относительному `/api`.
 */

import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { expect, test as base, type Page } from '@playwright/test';

import {
  SERVER_DIR,
  TSX_CLI,
  findFreePort,
  startChild,
  waitFor,
  waitForHttp,
  type ChildHandle,
} from '../helpers/env';
import { startPreview, type RunningPreview } from '../helpers/web';

/** Настройки тестового сервера. */
export interface ServerOptions {
  /** Строка `EXO_FAIL`, например `nasa:http_500,gaia:timeout`. */
  failures?: string;
  /** Источники для `EXO_PRESEED_BACKUPS`. */
  preseedBackups?: readonly string[];
  /** Сценарий `EXO_FAKE_EXOMAST` (по умолчанию `ok`). */
  exomast?: string;
}

/** Запущенный API-сервер. */
export interface RunningServer {
  /** Базовый URL API (без `/api`). */
  baseUrl: string;
  /** Временный каталог резервных копий. */
  backupDir: string;
  /** Процесс сервера. */
  process: ChildHandle;
  /** Останавливает сервер и удаляет каталог. */
  stop(): Promise<void>;
}

/** Запущенный стенд: API + preview веб-приложения. */
export interface RunningStack {
  /** API-сервер. */
  server: RunningServer;
  /** Preview веб-приложения. */
  web: RunningPreview;
  /** URL приложения. */
  webUrl: string;
  /** URL API. */
  apiUrl: string;
  /** Останавливает оба процесса. */
  stop(): Promise<void>;
}

/** Ждёт, пока конвейер завершит первую сборку. */
async function waitForBuild(baseUrl: string): Promise<void> {
  await waitFor(
    async () => {
      try {
        const response = await fetch(`${baseUrl}/api/status`);

        if (!response.ok) return false;

        const body = (await response.json()) as { phase?: string };

        return body.phase === 'ready' || body.phase === 'error';
      } catch {
        return false;
      }
    },
    { timeoutMs: 60_000, message: 'Первая сборка каталога не завершилась' },
  );
}

/** Поднимает тестовый сервер на свободном порту. */
export async function startServer(options: ServerOptions = {}): Promise<RunningServer> {
  const port = await findFreePort();
  const backupDir = await mkdtemp(path.join(os.tmpdir(), 'exo-e2e-backups-'));
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_ENV: 'test',
    EXO_TEST_MODE: '1',
    EXO_AUTO_REFRESH: '1',
    EXO_FAIL: options.failures ?? '',
    EXO_PRESEED_BACKUPS: (options.preseedBackups ?? []).join(','),
    EXO_FAKE_EXOMAST: options.exomast ?? 'ok',
    PORT: String(port),
    BACKUP_DIR: backupDir,
  };

  delete env.EXO_SNAPSHOT;

  const child = startChild(process.execPath, [TSX_CLI, 'src/index.ts'], {
    cwd: SERVER_DIR,
    env,
    label: 'exo-server',
  });

  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    await waitForHttp(`${baseUrl}/api/health`, { timeoutMs: 60_000 });
    await waitForBuild(baseUrl);
  } catch (error: unknown) {
    await child.stop();
    await rm(backupDir, { recursive: true, force: true });

    throw new Error(
      `Тестовый сервер не запустился: ${error instanceof Error ? error.message : String(error)}\n` +
        child.output(),
    );
  }

  return {
    baseUrl,
    backupDir,
    process: child,
    async stop() {
      await child.stop();
      await rm(backupDir, { recursive: true, force: true });
    },
  };
}

/** Поднимает API и preview, связанные прокси. */
export async function startStack(options: ServerOptions = {}): Promise<RunningStack> {
  const server = await startServer(options);

  try {
    const web = await startPreview(server.baseUrl);

    return {
      server,
      web,
      webUrl: web.url,
      apiUrl: server.baseUrl,
      async stop() {
        await web.stop();
        await server.stop();
      },
    };
  } catch (error: unknown) {
    await server.stop();
    throw error;
  }
}

/** Текст ошибки страницы для сообщения об ожидании. */
export const PAGE_ERRORS_MESSAGE = 'Страница сообщила об ошибках';

/**
 * Тест с фикстурой стенда и стражем ошибок.
 *
 * Любой `pageerror` и любой `console.error` валит тест: исключений нет.
 * Внешние HTTP-запросы блокируются — прогон не использует сеть.
 */
export const test = base.extend<
  Record<string, never>,
  { serverOptions: ServerOptions; stack: RunningStack }
>({
  serverOptions: [{}, { scope: 'worker', option: true }],

  stack: [
    async ({ serverOptions }, use) => {
      const stack = await startStack(serverOptions);

      try {
        await use(stack);
      } finally {
        await stack.stop();
      }
    },
    { scope: 'worker' },
  ],

  page: async ({ page, stack }, use) => {
    const errors: string[] = [];

    page.on('pageerror', (error) => {
      errors.push(`pageerror: ${error.message}`);
    });

    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(`console.error: ${message.text()}`);
    });

    await page.route('**/*', async (route) => {
      const url = new URL(route.request().url());

      if (url.protocol === 'http:' || url.protocol === 'https:') {
        if (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost') {
          await route.abort();
          return;
        }
      }

      await route.continue();
    });

    await page.goto(stack.webUrl, { waitUntil: 'domcontentloaded' });

    try {
      await page.waitForFunction(
        () => {
          const phase = (
            window as unknown as { __exo?: { state(): { phase: string } } }
          ).__exo?.state().phase;

          return phase === 'ready' || phase === 'error';
        },
        undefined,
        { timeout: 60_000 },
      );
    } catch (error: unknown) {
      const snapshot = await page
        .evaluate(() => ({
          url: location.href,
          readyState: document.readyState,
          rootChildren: document.getElementById('root')?.childElementCount ?? -1,
          hasExo: (window as unknown as { __exo?: unknown }).__exo !== undefined,
          body: document.body.innerText.slice(0, 500),
        }))
        .catch(() => null);

      throw new Error(
        `Приложение не дошло до ready: ${JSON.stringify(snapshot)}\n` +
          `Ошибки страницы: ${errors.join(' | ') || 'нет'}\n` +
          `Причина: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    await use(page);

    expect(errors, PAGE_ERRORS_MESSAGE).toEqual([]);
  },
});

/**
 * Сокращение для файла с нестандартным сервером:
 *
 * ```ts
 * const test = serverFixture({ failures: 'nasa:http_500', preseedBackups: ['nasa'] });
 * ```
 */
export function serverFixture(options: ServerOptions) {
  return test.extend<Record<string, never>, { serverOptions: ServerOptions }>({
    serverOptions: [options, { scope: 'worker', option: true }],
  });
}

/** Открывает страницу заново (после смены hash или перезагрузки). */
export async function gotoApp(page: Page, stack: RunningStack, suffix = ''): Promise<void> {
  await page.goto(`${stack.webUrl}${suffix}`, { waitUntil: 'load' });
}

export { expect };
