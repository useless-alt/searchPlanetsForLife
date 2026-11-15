import { expect, test } from '../fixtures/server';
import {
  domClick,
  exoState,
  labelDomCount,
  mapLeaders,
  openPlanetCard,
  setMode,
} from '../helpers/app';

/**
 * Карта Галактики (задача 31; п. 10.8, 11.2).
 *
 * 51 слот меток, подпись при наведении, выбор планеты кликом, «Обзор»,
 * перестроение меток фильтрами без потери выбранной планеты.
 *
 * Первый экран «карта, список неактивен» относится к раскладке 27a и в
 * текущей базовой линии недоступен — сценарий отмечен `fixme`.
 */
test.describe('карта Галактики', () => {
  test.setTimeout(240_000);

  test('держит 51 слот меток и показывает лидеров', async ({ page }) => {
    await openPlanetCard(page, 'Earth-analog b');

    await expect.poll(async () => labelDomCount(page)).toBe(51);

    const leaders = await mapLeaders(page);

    expect(leaders).toHaveLength(50);

    const visible = leaders.filter((leader) => leader.visible).length;
    const noCoordsInTop = leaders.some((leader) => leader.planetId === 'nocoords-b');

    expect(visible).toBe(50 - (noCoordsInTop ? 1 : 0));

    for (const leader of leaders) {
      expect(leader.highlighted).toBe(leader.visible);
    }

    // Меток по-прежнему 51 после смены режима.
    await setMode(page, 'RHI');
    await expect.poll(async () => (await exoState(page)).mode).toBe('rhi');
    expect(await labelDomCount(page)).toBe(51);
  });

  test('наведение показывает подпись, уход курсора её скрывает', async ({ page }) => {
    await openPlanetCard(page, 'Earth-analog b');

    const label = page.locator('.reticle[data-planet-id]:not([hidden])').first();

    await expect(label).toBeVisible();
    await label.hover();

    const tooltip = page.locator('#exo-help-tooltip');

    await expect(tooltip).toBeVisible();
    await expect(tooltip).toContainText('Индекс:');

    await page.mouse.move(5, 5);
    await expect(tooltip).toHaveCount(0);
  });

  test('клик по метке выбирает планету и открывает карточку', async ({ page }) => {
    await openPlanetCard(page, 'Earth-analog b');

    const label = page
      .locator('.reticle[data-planet-id]:not([hidden])')
      .filter({ hasNotText: 'Earth-analog b' })
      .first();

    const planetId = await label.getAttribute('data-planet-id');

    expect(planetId).toBeTruthy();

    await label.click();

    await expect.poll(async () => (await exoState(page)).selectedPlanetId).toBe(planetId);
    await expect(page.locator('aside.planet-card')).toBeVisible();
  });

  test('фильтры перестраивают метки и не теряют выбранную планету', async ({ page }) => {
    await openPlanetCard(page, 'Earth-analog b');

    const before = await exoState(page);

    await domClick(page.getByRole('button', { name: /^Фильтры/ }));

    const panel = page.locator('aside.ui-panel').filter({ hasText: 'Фильтры' });

    await expect(panel).toBeVisible();
    await domClick(panel.getByRole('button', { name: 'M', exact: true }));
    await domClick(panel.getByRole('button', { name: 'Применить фильтры' }));

    await expect.poll(async () => (await exoState(page)).rowsCount).toBeLessThan(before.rowsCount);

    const after = await exoState(page);

    // Выбранная планета не входит в новый Топ-50, но остаётся выбранной
    // и занимает 51-й слот метки.
    expect(after.selectedPlanetId).toBe('earth-analog-b');
    expect(await labelDomCount(page)).toBe(51);

    const selectedLabel = page.locator('.reticle[data-planet-id="earth-analog-b"]');

    await expect(selectedLabel).not.toHaveAttribute('hidden');
    await expect(page.locator('aside.planet-card')).toBeVisible();
  });

  test.fixme('первый экран — карта, список неактивен (27a)', async ({ page }) => {
    // Раскладка `DEFAULT_LAYOUT = 'map'` и параметр `lay` появляются в 27a;
    // в базовой линии карта монтируется только в карточке планеты.
    await expect(page.locator('.viewport-view')).toBeVisible();
    expect(await labelDomCount(page)).toBe(51);
  });
});
