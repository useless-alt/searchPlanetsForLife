import { expect, test } from '../fixtures/server';
import { exoState, flyToPlanetScene, openPlanetCard } from '../helpers/app';

/**
 * 3D-сцена системы (задача 31; п. 10.9, 10.10).
 *
 * «Приблизить» из карточки и карты, возврат «Назад», «Выбрать другую
 * планету», «← Карта Галактики», устойчивость сцены при смене данных.
 *
 * Приближение из таблицы и смена фильтров во время перелёта требуют
 * постоянно смонтированной карты (раскладка 27a) — отмечены `fixme`.
 */
test.describe('сцена системы', () => {
  test.setTimeout(240_000);

  test('«Приблизить» из карточки строит сцену и рисует кадры', async ({ page }) => {
    await openPlanetCard(page, 'Earth-analog b');
    await flyToPlanetScene(page);

    const state = await exoState(page);

    expect(state.viewMode).toBe('system');
    expect(state.scenePlanetId).toBe('earth-analog-b');

    await expect(page.locator('.view-canvas')).toBeVisible();
    await expect(page.locator('.scene-controls')).toBeVisible();
    await expect(page.getByRole('radio', { name: 'Планета' })).toHaveAttribute(
      'aria-checked',
      'true',
    );

    const gpu = await page.evaluate(() =>
      (
        window as unknown as {
          __exo: { gpu(): { geometries: number; calls: number } };
        }
      ).__exo.gpu(),
    );

    expect(gpu.geometries).toBeGreaterThan(0);
  });

  test('«Приблизить» с карты запускает тот же перелёт', async ({ page }) => {
    await openPlanetCard(page, 'Earth-analog b');

    await page.locator('.map-overlay__actions').getByRole('button', { name: 'Приблизить' }).click();

    await expect
      .poll(async () => (await exoState(page)).viewMode, { timeout: 30_000 })
      .toBe('system');
    await expect(page.locator('.scene-controls')).toBeVisible();
  });

  test('«Назад» возвращает карту, карточка остаётся открытой', async ({ page }) => {
    await openPlanetCard(page, 'Earth-analog b');
    await flyToPlanetScene(page);

    await page.locator('.scene-controls').getByRole('button', { name: 'Назад' }).click();

    await expect.poll(async () => (await exoState(page)).viewMode).toBe('galaxy');
    await expect(page.locator('aside.planet-card')).toBeVisible();
  });

  test('«Выбрать другую планету» возвращает карту и фокус на таблицу', async ({ page }) => {
    await openPlanetCard(page, 'Earth-analog b');
    await flyToPlanetScene(page);

    await page
      .locator('.scene-controls')
      .getByRole('button', { name: 'Выбрать другую планету' })
      .click();

    await expect.poll(async () => (await exoState(page)).viewMode).toBe('galaxy');

    const focused = await page.evaluate(() => document.activeElement?.className ?? '');

    expect(focused).toContain('top-table__row');
  });

  test('«← Карта Галактики» закрывает карточку и не меняет выбор', async ({ page }) => {
    await openPlanetCard(page, 'Earth-analog b');
    await flyToPlanetScene(page);

    await page.getByRole('button', { name: '← Карта Галактики' }).click();

    await expect(page.locator('aside.planet-card')).toHaveCount(0);

    const state = await exoState(page);

    expect(state.selectedPlanetId).toBe('earth-analog-b');
    expect(state.viewMode).toBe('galaxy');
  });

  test('обновление каталога не блокирует сцену', async ({ page }) => {
    await openPlanetCard(page, 'Earth-analog b');
    await flyToPlanetScene(page);

    // Шапка перекрыта карточкой: нажимаем кнопку через DOM-событие.
    await page
      .getByRole('button', { name: 'Обновить данные' })
      .evaluate((element: HTMLElement) => element.click());

    await expect
      .poll(async () => (await exoState(page)).refreshing, { timeout: 60_000 })
      .toBe(false);
    expect((await exoState(page)).viewMode).toBe('system');
    expect((await exoState(page)).scenePlanetId).toBe('earth-analog-b');
  });

  test.fixme('«Приблизить» из таблицы без открытой карточки (27a)', async ({ page }) => {
    // Кнопка в строке таблицы запрашивает перелёт, но 3D-холст смонтирован
    // только в карточке: нужна постоянная карта из раскладки 27a.
    await page
      .locator('tr.top-table__row')
      .first()
      .getByRole('button', { name: 'Приблизить' })
      .click();

    await expect.poll(async () => (await exoState(page)).viewMode).toBe('system');
  });
});
