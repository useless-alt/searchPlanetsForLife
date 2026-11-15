import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from '@playwright/test';
import { createServer } from 'vite';

import { installMockApi } from '../e2e/helpers/mockApi.ts';

/**
 * Скриншоты дизайн-ревизии (задача 27a, п. 9).
 *
 * Поднимает Vite с веб-приложением, ставит заглушку API
 * (`e2e/helpers/mockApi.ts`), снимает состояния A1–A11 в трёх размерах
 * и складывает кадры в `docs/screens/` (каталог в `.gitignore`).
 *
 * Chromium запускается с программным WebGL: на машинах без GPU 3D-сцена
 * рисуется через SwiftShader. Сеть не нужна: шрифты лежат в бандле, API
 * перехвачен маршрутами, каталог читается из `e2e/fixtures/catalog.json`.
 *
 * Запуск: `npm run design:shots` (сборка заглушки — `pretest:shots`).
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const webDir = path.join(root, 'apps/web');
const outDir = path.join(root, 'docs/screens');
const fixture = path.join(root, 'e2e/fixtures/catalog.json');

/** Размеры из постановки. */
const SIZES = [
  { width: 1440, height: 900 },
  { width: 1024, height: 768 },
  { width: 390, height: 844 },
];

/** Хэш ссылки на открытую карточку планеты (задача 20, U45). */
function shareHash(planetId) {
  return `#v=1&p=${encodeURIComponent(planetId)}&open=1`;
}

/** Ждёт готовую таблицу или пустое состояние. */
async function waitForTable(page) {
  await page.waitForSelector('.top-table__row, .ui-table, .ui-empty', { timeout: 30_000 });
  await page.waitForTimeout(250);
}

/** Ждёт карточку планеты и её слот 3D. */
async function waitForCard(page) {
  await page.waitForSelector('.planet-card', { timeout: 30_000 });
  await page.waitForSelector('.viewport-view', { timeout: 30_000 });
  await page.waitForTimeout(700);
}

/** Клик по кнопке с подписью. */
async function clickText(page, selector, text) {
  const button = page.locator(selector, { hasText: text }).first();

  await button.click();
}

/** Состояния ревизии: A1–A11. */
const STATES = [
  {
    id: 'A1',
    title: 'загрузка',
    mode: 'loading',
    async run(page) {
      await page.waitForSelector('.loading-screen', { timeout: 20_000 });
      await page.waitForTimeout(700);
    },
  },
  {
    id: 'A2',
    title: 'таблица',
    async run(page) {
      await waitForTable(page);
      await page.waitForTimeout(400);
    },
  },
  {
    id: 'A3',
    title: 'карточка открыта',
    hash: shareHash('earth-analog-b'),
    async run(page) {
      await waitForCard(page);
    },
  },
  {
    id: 'A4',
    title: 'параметры модели',
    async run(page) {
      await waitForTable(page);
      await clickText(page, 'button', 'Параметры модели');
      await page.waitForSelector('.ui-panel', { timeout: 10_000 });
      await page.waitForTimeout(300);
    },
  },
  {
    id: 'A5',
    title: 'фильтры',
    async run(page) {
      await waitForTable(page);
      await clickText(page, 'button', 'Фильтры');
      await page.waitForSelector('.ui-panel', { timeout: 10_000 });
      await page.waitForTimeout(300);
    },
  },
  {
    id: 'A6',
    title: 'источники и баннеры',
    mode: 'degraded',
    async run(page) {
      await waitForTable(page);
      await page.getByRole('button', { name: /Источники/ }).click();
      await page.waitForSelector('.ui-panel', { timeout: 10_000 });
      await page.waitForTimeout(300);
    },
  },
  {
    id: 'A7',
    title: 'методика (меню «Ещё»)',
    async run(page) {
      await waitForTable(page);
      // Окно «Методика» создаётся задачей 17a. Пока действие не
      // зарегистрировано, кадр фиксирует меню «Ещё» с недоступным пунктом.
      await page.getByRole('button', { name: 'Ещё' }).click();
      await page.waitForSelector('.header-menu', { timeout: 10_000 });
      await page.waitForTimeout(300);
    },
  },
  {
    id: 'A8',
    title: 'подсказка',
    async run(page) {
      await waitForTable(page);
      await page.locator('[data-help-key="mode.adaptive"]').first().focus();
      await page.waitForSelector('.help-tooltip', { timeout: 10_000 });
      await page.waitForTimeout(300);
    },
  },
  {
    id: 'A9',
    title: 'сцена: цель «Планета»',
    hash: shareHash('earth-analog-b'),
    async run(page) {
      await waitForCard(page);
      await clickText(page, '.planet-card__actions button', 'Приблизить');
      await page.waitForSelector('.scene-controls', { timeout: 30_000 });
      await page.locator('.planet-card').evaluate((element) => element.scrollTo(0, 0));
      await page.waitForTimeout(3200);
    },
  },
  {
    id: 'A10',
    title: 'сцена: цель «Звезда»',
    hash: shareHash('earth-analog-b'),
    async run(page) {
      await waitForCard(page);
      await clickText(page, '.planet-card__actions button', 'Приблизить');
      await page.waitForSelector('.scene-controls', { timeout: 30_000 });
      await page.locator('.planet-card').evaluate((element) => element.scrollTo(0, 0));
      await page.getByRole('radio', { name: 'Звезда' }).click({ force: true });
      await page.waitForTimeout(3200);
    },
  },
  {
    id: 'A11',
    title: 'заглушка планеты',
    hash: shareHash('insufficient-b'),
    async run(page) {
      await waitForCard(page);
      await clickText(page, '.planet-card__actions button', 'Приблизить');
      await page.waitForSelector('.scene-controls', { timeout: 30_000 });
      await page.locator('.planet-card').evaluate((element) => element.scrollTo(0, 0));
      await page.waitForTimeout(3200);
    },
  },
];

/** Собирает заглушку каталога, если её ещё нет. */
function ensureFixture() {
  if (existsSync(fixture)) return;

  throw new Error('Нет e2e/fixtures/catalog.json. Сначала выполните: npm run pretest:shots');
}

/**
 * Кадр через CDP: не ждёт «стабильного» кадра и не зависит от бесконечных
 * CSS-анимаций (звёздное поле, орбита загрузки). Анимации замораживаются,
 * чтобы кадры были одинаковыми между прогонами.
 */
async function capture(context, page, file) {
  await page.addStyleTag({
    content:
      '*,*::before,*::after{animation-duration:0.01ms!important;animation-delay:0ms!important;' +
      'animation-iteration-count:1!important;transition-duration:0.01ms!important}',
  });
  await page.waitForTimeout(120);
  const cdp = await context.newCDPSession(page);
  const { data } = await cdp.send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: false,
  });

  writeFileSync(file, Buffer.from(data, 'base64'));
  await cdp.detach();
}

const server = await createServer({
  root: webDir,
  configFile: path.join(webDir, 'vite.config.ts'),
  server: { port: 5183, strictPort: true, host: '127.0.0.1' },
  logLevel: 'error',
});

try {
  ensureFixture();
  await server.listen();
  const baseUrl = server.resolvedUrls?.local?.[0] ?? 'http://127.0.0.1:5183/';

  mkdirSync(outDir, { recursive: true });

  // Браузер поднимается на каждое состояние: SwiftShader не освобождает
  // WebGL-контексты мгновенно, и после 8–10 сцен Chromium начинает
  // отказывать в новом контексте. Отдельный процесс — дороже, зато кадры
  // воспроизводимы на любой машине.
  async function launchBrowser() {
    return chromium.launch({
      args: [
        '--use-angle=swiftshader',
        '--enable-unsafe-swiftshader',
        '--ignore-gpu-blocklist',
        '--disable-gpu-sandbox',
      ],
    });
  }

  const failures = [];

  // Отладка: SHOTS=A3,A9 и SHOT_SIZES=1440 ограничивают прогон.
  const onlyStates = process.env.SHOTS?.split(',').filter(Boolean);
  const onlyWidths = process.env.SHOT_SIZES?.split(',').filter(Boolean).map(Number);
  const states = onlyStates ? STATES.filter((state) => onlyStates.includes(state.id)) : STATES;
  const sizes = onlyWidths ? SIZES.filter((size) => onlyWidths.includes(size.width)) : SIZES;

  for (const size of sizes) {
    for (const state of states) {
      const browser = await launchBrowser();
      const context = await browser.newContext({
        viewport: { width: size.width, height: size.height },
        deviceScaleFactor: 1,
      });
      const page = await context.newPage();
      const problems = [];

      page.on('console', (message) => {
        if (message.type() === 'error') problems.push(message.text());
      });
      page.on('pageerror', (error) => problems.push(String(error)));

      try {
        await installMockApi(page, { mode: state.mode ?? 'ok' });
        await page.goto(`${baseUrl}${state.hash ?? ''}`, { waitUntil: 'commit' });

        try {
          await state.run(page);
          await page.evaluate(() => document.fonts.ready.then(() => undefined));
        } catch (error) {
          failures.push(`${state.id} @ ${size.width}: ${String(error).split('\n')[0]}`);
        }

        try {
          await capture(
            context,
            page,
            path.join(outDir, `${state.id}-${size.width}x${size.height}.png`),
          );
        } catch (error) {
          failures.push(`${state.id} @ ${size.width}: кадр — ${String(error).split('\n')[0]}`);
        }

        if (problems.length > 0) {
          failures.push(
            `${state.id} @ ${size.width}: консоль — ${problems.slice(0, 3).join(' | ')}`,
          );
        }

        if (process.env.MEASURE && state.id === 'A3') {
          const metrics = await page.evaluate(() => {
            const card = document.querySelector('.planet-card');
            const table = document.querySelector('.planet-params__table');

            return {
              cardClient: card?.clientWidth ?? 0,
              cardScroll: card?.scrollWidth ?? 0,
              tableClient: table?.clientWidth ?? 0,
              tableScroll: table?.scrollWidth ?? 0,
              columns: table
                ? [...table.querySelectorAll('thead th')].map((cell) =>
                    Math.round(cell.getBoundingClientRect().width),
                  )
                : [],
            };
          });

          console.log('[design:shots] A3 metrics', metrics);
        }
      } finally {
        await context.close();
        await browser.close();
      }

      console.log(`[design:shots] ${state.id} ${size.width}×${size.height}`);
    }
  }

  if (failures.length > 0) {
    console.warn('\n[design:shots] замечания:\n' + failures.map((line) => `- ${line}`).join('\n'));
  }

  console.log(`\n[design:shots] кадры: ${path.relative(root, outDir)}`);
} finally {
  await server.close();
}
