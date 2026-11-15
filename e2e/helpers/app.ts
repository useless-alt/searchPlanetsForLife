/**
 * Помощники для сценариев Playwright (задача 31).
 *
 * Здесь только то, что нужно почти каждому тесту: переход на приложение,
 * ожидание готовности каталога, чтение `window.__exo` и поиск планеты в
 * таблице. Селекторы намеренно опираются на доступные роли и тексты, а не
 * на хрупкие CSS-классы.
 */

import { expect, type Locator, type Page } from '@playwright/test';

import type {
  ExoDebugGpu,
  ExoDebugMapLeader,
  ExoDebugState,
} from '../../apps/web/src/debug/exoDebug';
import type {
  SystemDebugCamera,
  SystemDebugHz,
  SystemDebugLayer,
  SystemDebugObjects,
  SystemDebugOrbit,
  SystemDebugRotation,
} from '../../apps/web/src/three/system/SystemScene';

/** Ждёт, пока приложение установит `window.__exo`. */
export async function waitForDebug(page: Page): Promise<void> {
  await page.waitForFunction(
    () => (window as unknown as { __exo?: unknown }).__exo !== undefined,
    undefined,
    { timeout: 30_000 },
  );
}

/** Ждёт готовности каталога (фаза `ready`). */
export async function waitForReady(page: Page): Promise<void> {
  await waitForDebug(page);
  await page.waitForFunction(
    () =>
      (window as unknown as { __exo?: { state(): { phase: string } } }).__exo?.state().phase ===
      'ready',
    undefined,
    { timeout: 60_000 },
  );
}

/** Снимок состояния приложения. */
export async function exoState(page: Page): Promise<ExoDebugState> {
  return page.evaluate(() => {
    const exo = (window as unknown as { __exo?: { state(): ExoDebugState } }).__exo;

    if (exo === undefined) throw new Error('window.__exo не установлен');

    return exo.state();
  });
}

/** Ресурсы GPU. */
export async function gpu(page: Page): Promise<ExoDebugGpu> {
  return page.evaluate(() => (window as unknown as { __exo: { gpu(): ExoDebugGpu } }).__exo.gpu());
}

/** Камера системы. */
export async function sceneCamera(page: Page): Promise<SystemDebugCamera> {
  return page.evaluate(() =>
    (
      window as unknown as { __exo: { scene: { camera(): SystemDebugCamera } } }
    ).__exo.scene.camera(),
  );
}

/** Объекты сцены. */
export async function sceneObjects(page: Page): Promise<SystemDebugObjects> {
  return page.evaluate(() =>
    (
      window as unknown as { __exo: { scene: { objects(): SystemDebugObjects } } }
    ).__exo.scene.objects(),
  );
}

/** Контур орбиты. */
export async function sceneOrbit(page: Page, n = 360): Promise<SystemDebugOrbit | null> {
  return page.evaluate(
    (count) =>
      (
        window as unknown as {
          __exo: { scene: { orbit(value: number): SystemDebugOrbit | null } };
        }
      ).__exo.scene.orbit(count),
    n,
  );
}

/** Зона обитаемости. */
export async function sceneHz(page: Page): Promise<SystemDebugHz | null> {
  return page.evaluate(() =>
    (window as unknown as { __exo: { scene: { hz(): SystemDebugHz | null } } }).__exo.scene.hz(),
  );
}

/** Статусы слоёв. */
export async function sceneLayers(page: Page): Promise<Record<string, SystemDebugLayer>> {
  return page.evaluate(() =>
    (
      window as unknown as {
        __exo: { scene: { layers(): Record<string, SystemDebugLayer> } };
      }
    ).__exo.scene.layers(),
  );
}

/** Вращение планеты. */
export async function sceneRotation(page: Page): Promise<SystemDebugRotation> {
  return page.evaluate(() =>
    (
      window as unknown as { __exo: { scene: { rotation(): SystemDebugRotation } } }
    ).__exo.scene.rotation(),
  );
}

/** Признаки заглушек. */
export async function sceneStub(page: Page): Promise<{ planet: boolean; star: boolean }> {
  return page.evaluate(() =>
    (
      window as unknown as { __exo: { scene: { stub(): { planet: boolean; star: boolean } } } }
    ).__exo.scene.stub(),
  );
}

/** Настройки сцены и границы HZ (диагностика). */
export async function sceneInfo(
  page: Page,
): Promise<{ hzBounds: string; detailHz: unknown; scaleMode: string }> {
  return page.evaluate(() =>
    (
      window as unknown as {
        __exo: { scene: { info(): { hzBounds: string; detailHz: unknown; scaleMode: string } } };
      }
    ).__exo.scene.info(),
  );
}

/** Продвигает модельные сутки. */
export async function advanceDays(page: Page, days: number): Promise<void> {
  await page.evaluate((value) => {
    (
      window as unknown as { __exo: { scene: { sim: { advanceDays(d: number): void } } } }
    ).__exo.scene.sim.advanceDays(value);
  }, days);
}

/** Продвигает часы вращения. */
export async function advanceHours(page: Page, hours: number): Promise<void> {
  await page.evaluate((value) => {
    (
      window as unknown as { __exo: { scene: { sim: { advanceHours(h: number): void } } } }
    ).__exo.scene.sim.advanceHours(value);
  }, hours);
}

/** Текущие модельные сутки. */
export async function simDays(page: Page): Promise<number> {
  return page.evaluate(() =>
    (window as unknown as { __exo: { scene: { sim: { days(): number } } } }).__exo.scene.sim.days(),
  );
}

/** Приостанавливает модельные часы. */
export async function pauseSim(page: Page): Promise<void> {
  await page.evaluate(() => {
    (window as unknown as { __exo: { scene: { sim: { pause(): void } } } }).__exo.scene.sim.pause();
  });
}

/** Возобновляет модельные часы. */
export async function resumeSim(page: Page): Promise<void> {
  await page.evaluate(() => {
    (
      window as unknown as { __exo: { scene: { sim: { resume(): void } } } }
    ).__exo.scene.sim.resume();
  });
}

/** Множитель скорости часов (тестовый доступ). */
export async function setTimeScale(page: Page, scale: number): Promise<void> {
  await page.evaluate((value) => {
    (
      window as unknown as { __exo: { scene: { sim: { setTimeScale(k: number): void } } } }
    ).__exo.scene.sim.setTimeScale(value);
  }, scale);
}

/** Метки карты. */
export async function mapLeaders(page: Page): Promise<ExoDebugMapLeader[]> {
  return page.evaluate(() =>
    (
      window as unknown as { __exo: { map: { leaders(): ExoDebugMapLeader[] } } }
    ).__exo.map.leaders(),
  );
}

/** Число кнопок меток в DOM. */
export async function labelDomCount(page: Page): Promise<number> {
  return page.evaluate(() =>
    (
      window as unknown as { __exo: { map: { labelDomCount(): number } } }
    ).__exo.map.labelDomCount(),
  );
}

/** Позиция системы планеты на карте. */
export async function systemPosition(
  page: Page,
  planetId: string,
): Promise<[number, number, number] | null> {
  return page.evaluate(
    (id) =>
      (
        window as unknown as {
          __exo: { map: { systemPosition(value: string): [number, number, number] | null } };
        }
      ).__exo.map.systemPosition(id),
    planetId,
  );
}

/** Строка таблицы по отображаемому имени планеты. */
export function tableRow(page: Page, name: string): Locator {
  return page.locator('tr.top-table__row').filter({ hasText: name });
}

/** Открывает карточку планеты поиском (работает и для планет вне Топ-50). */
export async function openPlanetCard(page: Page, name: string): Promise<void> {
  const search = page.getByRole('combobox', { name: 'Поиск планеты или звезды…' });

  await search.fill(name);

  const option = page.locator('.toolbar__option').filter({ hasText: name }).first();

  await expect(option).toBeVisible();
  await option.click();

  // Поиск только выбирает планету; карточку открывает бейдж в шапке (10.3.4).
  await page.getByRole('button', { name: `Открыть карточку планеты ${name}` }).click();

  await expect(page.locator('aside.planet-card')).toBeVisible();
  await expect(page.locator('aside.planet-card')).toHaveAttribute('aria-label', name);
}

/** Закрывает карточку планеты, сохраняя выбор (10.3.4). */
export async function closePlanetCard(page: Page): Promise<void> {
  await page.locator('.planet-card__close').click();
  await expect(page.locator('aside.planet-card')).toHaveCount(0);
}

/** Нажимает «Приблизить» в действиях карточки и ждёт построения сцены. */
export async function flyToPlanetScene(page: Page): Promise<void> {
  await page.locator('.planet-card__actions').getByRole('button', { name: 'Приблизить' }).click();

  await page.waitForFunction(
    () =>
      (window as unknown as { __exo?: { state(): { viewMode: string } } }).__exo?.state()
        .viewMode === 'system',
    undefined,
    { timeout: 30_000 },
  );

  await page.locator('.scene-controls').waitFor({ state: 'visible' });
}

/** Возвращает вид на карту кнопкой «← Карта Галактики». */
export async function backToGalaxyMap(page: Page): Promise<void> {
  await page.getByRole('button', { name: '← Карта Галактики' }).click();

  await page.waitForFunction(
    () =>
      (window as unknown as { __exo?: { state(): { viewMode: string } } }).__exo?.state()
        .viewMode === 'galaxy',
    undefined,
    { timeout: 15_000 },
  );
}

/** Выходит из сцены кнопкой «Назад», оставляя карточку открытой. */
export async function leaveScene(page: Page): Promise<void> {
  await page.locator('.scene-controls').getByRole('button', { name: 'Назад' }).click();

  await page.waitForFunction(
    () =>
      (window as unknown as { __exo?: { state(): { viewMode: string } } }).__exo?.state()
        .viewMode === 'galaxy',
    undefined,
    { timeout: 15_000 },
  );
}

/** Открывает панель «Параметры модели». */
export async function openModelParams(page: Page): Promise<Locator> {
  await page.getByRole('button', { name: /Параметры модели/ }).click();

  const panel = page.locator('aside.ui-panel').filter({ hasText: 'Параметры модели' });

  await expect(panel).toBeVisible();

  return panel;
}

/** Открывает панель фильтров. */
export async function openFilters(page: Page): Promise<Locator> {
  await page.getByRole('button', { name: /^Фильтры/ }).click();

  const panel = page.locator('aside.ui-panel').filter({ hasText: 'Фильтры' });

  await expect(panel).toBeVisible();

  return panel;
}

/** Переключает режим расчёта по подписи.
 *
 * Карточка планеты — фиксированная панель справа и перекрывает часть шапки,
 * поэтому обычный клик по сегменту может быть перехвачен. Вызываем `click()`
 * на самой кнопке: это настоящее DOM-событие, которое обрабатывает React.
 */
export async function setMode(page: Page, label: string): Promise<void> {
  await page
    .getByRole('radio', { name: label })
    .evaluate((element: HTMLElement) => element.click());
}

/** Нажимает элемент через DOM-событие (для перекрытых панелей). */
export async function domClick(locator: Locator): Promise<void> {
  await locator.evaluate((element: HTMLElement) => element.click());
}

/** Переключает масштаб сцены: «Обзорный» или «1:1». */
export async function setScale(page: Page, label: string): Promise<void> {
  await domClick(page.locator('.scene-controls').getByRole('radio', { name: label }));
}

/** Переключает цель приближения: «Планета» или «Звезда». */
export async function setSceneTarget(page: Page, label: string): Promise<void> {
  await domClick(page.locator('.scene-controls').getByRole('radio', { name: label }));
}

/** Включает или выключает слой сцены. */
export async function toggleSceneLayer(page: Page, layer: 'orbit' | 'hz'): Promise<void> {
  await page.locator(`.scene-toggle[data-help-key="scene.${layer}"]`).click();
}
