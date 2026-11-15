/**
 * Сборка веб-приложения для e2e (задача 31, п. 1).
 *
 * Сборка выполняется один раз в `globalSetup` Playwright: `--mode e2e`
 * включает `VITE_E2E=1` (из `apps/web/.env.e2e`) и убирает внешние шрифты.
 * Отдельный процесс на каждый набор тестов гонял бы Vite зря.
 */

import { spawnSync } from 'node:child_process';

import { REPO_ROOT, VITE_CLI, WEB_DIR } from './env';

/** Собирает `apps/web/dist` в режиме e2e. */
export function buildWebApp(): void {
  const result = spawnSync(
    process.execPath,
    [VITE_CLI, 'build', '--mode', 'e2e', '--logLevel', 'warn'],
    {
      cwd: WEB_DIR,
      env: { ...process.env, VITE_E2E: '1' },
      encoding: 'utf8',
      timeout: 240_000,
    },
  );

  if (result.status !== 0) {
    throw new Error(
      `Сборка e2e не удалась (код ${String(result.status)}):\n` +
        `${result.stdout ?? ''}\n${result.stderr ?? ''}\n` +
        `Корень репозитория: ${REPO_ROOT}`,
    );
  }
}

/** `globalSetup` Playwright: одна сборка на прогон. */
export default function globalSetup(): void {
  buildWebApp();
}
