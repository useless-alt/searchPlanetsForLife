import { expect, test } from '../fixtures/server';
import {
  domClick,
  exoState,
  flyToPlanetScene,
  openPlanetCard,
  sceneHz,
  sceneOrbit,
  setScale,
  toggleSceneLayer,
} from '../helpers/app';

/**
 * Критерий 11.4 — зона обитаемости (задача 31).
 *
 * Радиусы кольца совпадают с d_in/d_out карточки, границы меняются без
 * перезагрузки сцены, слой виден в оба масштаба и у планеты без температуры
 * звезды недоступен с причиной.
 */
test.describe('11.4 зона обитаемости', () => {
  test.setTimeout(240_000);

  test('радиусы совпадают с карточкой и меняются без перезагрузки сцены', async ({ page }) => {
    await openPlanetCard(page, 'Earth-analog b');
    await flyToPlanetScene(page);

    const orbit = await sceneOrbit(page, 60);
    const unitsPerAU = orbit?.unitsPerAU ?? 0;
    const hz = await sceneHz(page);

    expect(hz).not.toBeNull();
    expect(hz?.visible).toBe(true);

    const cardValues = await page
      .locator('.planet-hz__row')
      .filter({ has: page.locator('dt') })
      .evaluateAll((rows) =>
        rows.map((row) => ({
          label: row.querySelector('dt')?.textContent ?? '',
          value: Number.parseFloat(row.querySelector('dd')?.textContent ?? 'NaN'),
        })),
      );
    const dIn = cardValues.find((item) => item.label.startsWith('d_in'))?.value ?? NaN;
    const dOut = cardValues.find((item) => item.label.startsWith('d_out'))?.value ?? NaN;

    expect(Number.isFinite(dIn)).toBe(true);
    expect(Number.isFinite(dOut)).toBe(true);

    // Карточка округляет до сотых: относительный допуск 1e-2 покрывает
    // половину последнего знака.
    expect(Math.abs((hz?.inner ?? 0) - unitsPerAU * dIn) / (unitsPerAU * dIn)).toBeLessThan(1e-2);
    expect(Math.abs((hz?.outer ?? 0) - unitsPerAU * dOut) / (unitsPerAU * dOut)).toBeLessThan(1e-2);

    // Слой включён по умолчанию и скрывается переключателем без перестройки.
    await toggleSceneLayer(page, 'hz');
    await expect.poll(async () => (await sceneHz(page))?.visible ?? false).toBe(false);
    await toggleSceneLayer(page, 'hz');
    await expect.poll(async () => (await sceneHz(page))?.visible ?? false).toBe(true);

    // Смена границ: панель перекрыта карточкой, поэтому нажимаем через DOM.
    const before = await sceneHz(page);
    const scenePlanetBefore = (await exoState(page)).scenePlanetId;

    await domClick(page.getByRole('button', { name: /Параметры модели/ }));

    const panel = page.locator('aside.ui-panel').filter({ hasText: 'Параметры модели' });

    await expect(panel).toBeVisible();
    await domClick(panel.getByRole('radio', { name: 'Оптимистичная' }));
    await domClick(panel.getByRole('button', { name: 'Применить' }));

    await expect.poll(async () => (await exoState(page)).hzBounds).toBe('optimistic');

    const after = await sceneHz(page);

    expect(after).not.toBeNull();
    await expect
      .poll(async () => (await sceneHz(page))?.inner ?? 0)
      .not.toBeCloseTo(before?.inner ?? 0, 3);
    expect((await exoState(page)).scenePlanetId).toBe(scenePlanetBefore);

    // В масштабе 1:1 кольцо тоже видно.
    await setScale(page, '1:1');
    await expect
      .poll(async () => (await sceneOrbit(page, 60))?.unitsPerAU ?? 0)
      .toBeGreaterThan(20000);
    expect(await sceneHz(page)).not.toBeNull();
  });

  test('цвет зоны не совпадает с акцентом лидеров', async ({ page }) => {
    await openPlanetCard(page, 'Earth-analog b');
    await flyToPlanetScene(page);

    const tokens = await page.evaluate(() => {
      const style = getComputedStyle(document.documentElement);

      return {
        hzFill: style.getPropertyValue('--hz-fill').trim(),
        hzEdge: style.getPropertyValue('--hz-edge').trim(),
        accent: style.getPropertyValue('--accent').trim(),
        leader: style.getPropertyValue('--color-leader').trim(),
      };
    });

    expect(tokens.hzFill).not.toBe('');
    expect(tokens.hzFill).not.toBe(tokens.accent);
    expect(tokens.hzEdge).not.toBe(tokens.leader);
    expect(tokens.hzFill).not.toBe(tokens.leader);
  });

  test('у планеты без температуры звезды зона не рисуется и переключатель неактивен', async ({
    page,
  }) => {
    await openPlanetCard(page, 'Starless b');
    await flyToPlanetScene(page);

    expect(await sceneHz(page)).toBeNull();

    const toggle = page.locator('.scene-toggle[data-help-key="scene.hz"]');

    await expect(toggle).toHaveAttribute('aria-disabled', 'true');

    const reason = await toggle.getAttribute('data-help-disabled-reason');

    expect(reason ?? '').toContain('температура звезды');

    // Карточка тоже объясняет, чего не хватает.
    await expect(page.getByText('Границы не рассчитаны: не хватает')).toBeVisible();
  });
});
