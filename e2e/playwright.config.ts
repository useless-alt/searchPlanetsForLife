import { defineConfig } from '@playwright/test';

/**
 * Конфиг сквозных тестов (задача 31, п. 1).
 *
 * Два проекта: `desktop` 1440×900 и `mobile` 390×844 с касанием. Chromium
 * запускается с программным WebGL (SwiftShader), поэтому 3D-сцена работает
 * без GPU. Внешняя сеть не используется: все запросы идут на локальный
 * preview, а `fetch` к внешним хостам блокируется фикстурой.
 *
 * Сборка веб-приложения выполняется один раз в `globalSetup`; каждый набор
 * тестов получает свой сервер и свой preview (см. `fixtures/server.ts`).
 *
 * Конфиг скриншотов дизайн-ревью (задача 27a) вынесен в
 * `playwright.shots.config.ts`, чтобы не смешивать два режима запуска.
 */
export default defineConfig({
  testDir: './specs',
  globalSetup: './helpers/build.ts',
  outputDir: '../.e2e-results',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: Boolean(process.env['CI']),
  reporter: [['list']],
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    launchOptions: {
      args: [
        '--use-angle=swiftshader',
        '--enable-unsafe-swiftshader',
        '--ignore-gpu-blocklist',
        '--disable-dev-shm-usage',
      ],
    },
  },
  projects: [
    {
      name: 'desktop',
      use: { viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'mobile',
      use: {
        viewport: { width: 390, height: 844 },
        hasTouch: true,
        isMobile: true,
        deviceScaleFactor: 1,
      },
    },
  ],
});
