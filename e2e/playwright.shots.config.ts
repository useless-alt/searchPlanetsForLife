import { defineConfig, devices } from '@playwright/test';

/**
 * Конфиг e2e и скриншотов (задача 27a).
 *
 * Приложение поднимается тем же Vite-сервером, что и в разработке; API
 * подменяется заглушкой `e2e/helpers/mockApi.ts`, поэтому сеть не нужна.
 * Каталог для заглушки собирает `npm run pretest:shots`.
 *
 * Набор e2e-тестов появится в задаче 27d (`test:layout`); этот конфиг —
 * общая точка запуска для неё и для `scripts/design-shots.mjs`.
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: ['**/*.spec.ts'],
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: [['list']],
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://127.0.0.1:5173',
    trace: 'retain-on-failure',
    viewport: { width: 1440, height: 900 },
  },
  webServer: {
    command: 'npm run dev -w @exo/web -- --port 5173 --strictPort',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
