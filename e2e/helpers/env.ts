/**
 * Общие утилиты e2e-инфраструктуры (задача 31, п. 1).
 *
 * Здесь нет знаний о сценариях: только пути репозитория, поиск свободного
 * порта, ожидание HTTP и запуск дочерних процессов Node. Всё остальное —
 * в `fixtures/server.ts` и `helpers/web.ts`.
 */

import { spawn, type ChildProcess } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';

/** Корень репозитория (e2e/helpers → e2e → корень). */
export const REPO_ROOT = path.resolve(__dirname, '..', '..');

/** Каталог веб-приложения. */
export const WEB_DIR = path.join(REPO_ROOT, 'apps', 'web');

/** Каталог сервера. */
export const SERVER_DIR = path.join(REPO_ROOT, 'apps', 'server');

/** CLI Vite в корне монорепо. */
export const VITE_CLI = path.join(REPO_ROOT, 'node_modules', 'vite', 'bin', 'vite.js');

/** CLI tsx в корне монорепо. */
export const TSX_CLI = path.join(REPO_ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs');

/** Пауза [мс]. */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/** Находит свободный TCP-порт на loopback. */
export async function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();

    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();

      if (address === null || typeof address === 'string') {
        server.close();
        reject(new Error('Не удалось получить свободный порт'));
        return;
      }

      const port = address.port;
      server.close(() => resolve(port));
    });
  });
}

/** Ждёт, пока URL начнёт отвечать статусом 2xx/3xx/4xx. */
export async function waitForHttp(
  url: string,
  options: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<void> {
  const timeoutMs = options.timeoutMs ?? 30_000;
  const intervalMs = options.intervalMs ?? 100;
  const started = Date.now();
  let lastError = 'нет ответа';

  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);

      if (response.status > 0) return;
    } catch (error: unknown) {
      lastError = error instanceof Error ? error.message : String(error);
    }

    await sleep(intervalMs);
  }

  throw new Error(`Сервер не ответил за ${timeoutMs} мс: ${url} (${lastError})`);
}

/** Запускает дочерний процесс и собирает его вывод в буфер. */
export interface ChildHandle {
  /** Процесс. */
  child: ChildProcess;
  /** Накопленный stdout+stderr. */
  output(): string;
  /** Останавливает процесс и ждёт завершения. */
  stop(): Promise<void>;
}

/** Ограничение буфера вывода [символов]. */
const OUTPUT_LIMIT = 60_000;

/** Запускает процесс; вывод не блокирует pipe. */
export function startChild(
  command: string,
  args: readonly string[],
  options: { cwd: string; env: NodeJS.ProcessEnv; label: string },
): ChildHandle {
  const child = spawn(command, [...args], {
    cwd: options.cwd,
    env: options.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  let output = '';

  const append = (chunk: Buffer | string): void => {
    output += chunk.toString();

    if (output.length > OUTPUT_LIMIT) output = output.slice(-OUTPUT_LIMIT);
  };

  child.stdout?.on('data', append);
  child.stderr?.on('data', append);

  return {
    child,
    output: () => output,
    async stop(): Promise<void> {
      if (child.exitCode !== null || child.signalCode !== null) return;

      child.kill();

      await Promise.race([new Promise((resolve) => child.once('exit', resolve)), sleep(5000)]);

      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    },
  };
}

/** Ждёт выполнения условия, опрашивая `check` с паузой. */
export async function waitFor(
  check: () => Promise<boolean>,
  options: { timeoutMs?: number; intervalMs?: number; message?: string } = {},
): Promise<void> {
  const timeoutMs = options.timeoutMs ?? 30_000;
  const intervalMs = options.intervalMs ?? 100;
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    if (await check()) return;
    await sleep(intervalMs);
  }

  throw new Error(options.message ?? `Условие не выполнено за ${timeoutMs} мс`);
}
