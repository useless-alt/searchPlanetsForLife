/**
 * Запуск preview-сервера Vite с прокси на тестовый API (задача 31, п. 1).
 *
 * Приложение обращается к относительному `/api`, поэтому прокси настраивается
 * через `VITE_API_PROXY_TARGET`: порт API выбирается случайным и известен
 * только фикстуре, запустившей сервер.
 */

import { VITE_CLI, WEB_DIR, findFreePort, startChild, waitForHttp, type ChildHandle } from './env';

/** Запущенный preview-сервер. */
export interface RunningPreview {
  /** Базовый URL приложения. */
  url: string;
  /** Процесс Vite preview. */
  process: ChildHandle;
  /** Останавливает preview. */
  stop(): Promise<void>;
}

/** Запускает `vite preview` на свободном порту. */
export async function startPreview(apiUrl: string): Promise<RunningPreview> {
  const port = await findFreePort();
  const preview = startChild(
    process.execPath,
    [VITE_CLI, 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
    {
      cwd: WEB_DIR,
      env: { ...process.env, VITE_API_PROXY_TARGET: apiUrl },
      label: 'vite-preview',
    },
  );

  const url = `http://127.0.0.1:${port}/`;

  try {
    await waitForHttp(url, { timeoutMs: 30_000 });
  } catch (error: unknown) {
    await preview.stop();
    throw new Error(
      `Preview не запустился: ${error instanceof Error ? error.message : String(error)}\n${preview.output()}`,
    );
  }

  return {
    url,
    process: preview,
    stop: () => preview.stop(),
  };
}
