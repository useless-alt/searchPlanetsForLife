import { expect, test } from '../fixtures/server';
import { gotoApp, openPlanetCard, setMode, waitForReady } from '../helpers/app';
import { startStack } from '../fixtures/server';

/**
 * Карточка планеты (задача 31; п. 10.7).
 *
 * Цвета и подписи происхождения, декомпозиция в трёх режимах, бейджи
 * реконструкции и заглушки, ручное обновление Exo.MAST (успех, ошибка,
 * медленный ответ) и «Данные реконструкции» с диалогом источника.
 */
test.describe('карточка планеты', () => {
  test.setTimeout(240_000);

  test('показывает происхождение значений и декомпозицию балла', async ({ page }) => {
    await openPlanetCard(page, 'Earth-analog b');

    await expect(page.getByText('Измерено').first()).toBeVisible();
    await expect(page.getByText('Физика').first()).toBeVisible();

    const toggle = page.getByRole('button', { name: /Декомпозиция балла/ });

    await toggle.click();

    await expect(page.getByText('ESI_R').first()).toBeVisible();
    await expect(page.getByText('F_HZ').first()).toBeVisible();
    await expect(page.getByText('Итоговый индекс').first()).toBeVisible();

    // RHI — другая формула, строки пересчитываются.
    await setMode(page, 'RHI');
    await expect.poll(async () => (await page.locator('.planet-decomp').count()) > 0).toBe(true);
    await expect(page.getByText('Итоговый индекс').first()).toBeVisible();

    // Строгий режим не оценивает Землю: карточка объясняет почему.
    await setMode(page, 'Строгий научный');
    await expect(page.getByText('Планета не оценивается в текущем режиме')).toBeVisible();
  });

  test('показывает бейджи реконструкции и недостатка данных', async ({ page }) => {
    await openPlanetCard(page, 'Radius-only b');

    await expect(page.getByText('Реконструкция по расчётной модели')).toBeVisible();

    await page.locator('.planet-card__close').click();
    await openPlanetCard(page, 'Insufficient b');

    await expect(page.getByText('Недостаточно данных для отрисовки')).toBeVisible();
  });

  test('«Данные реконструкции» открывают диалог источника параметра', async ({ page }) => {
    await openPlanetCard(page, 'Earth-analog b');

    const section = page.locator('section.planet-reconstruction');

    await expect(section.getByText('Данные реконструкции')).toBeVisible();

    // Показываем все параметры и открываем первый чип.
    await section.getByRole('checkbox', { name: 'Показать все параметры' }).check({ force: true });

    const chip = section.locator('.reconstruction-chip').first();

    await expect(chip).toBeVisible();
    await chip.click();

    const dialog = page.getByRole('dialog');

    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('Происхождение')).toBeVisible();
    await expect(dialog.getByText('Как получено')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
  });

  test('ручное обновление Exo.MAST: успех и сохранение данных', async ({ page }) => {
    await openPlanetCard(page, 'Earth-analog b');

    const refresh = page.getByRole('button', { name: 'Обновить данные планеты' });

    await expect(refresh).toBeVisible();
    await refresh.click();

    await expect(page.getByText('Данные Exo.MAST обновлены')).toBeVisible();

    // Прежние измеренные значения остаются на месте.
    await expect(
      page.locator('tr[data-help-key="val.R"]').locator('td.planet-params__value'),
    ).toHaveText('1.00');
  });

  test('ошибка Exo.MAST показывает уведомление и не стирает данные', async ({ page }) => {
    const custom = await startStack({ exomast: 'fail' });

    try {
      await gotoApp(page, custom);
      await waitForReady(page);
      await openPlanetCard(page, 'Earth-analog b');

      await page.getByRole('button', { name: 'Обновить данные планеты' }).click();

      await expect(page.getByText(/Данные Exo.MAST недоступны/)).toBeVisible();
      await expect(
        page.locator('tr[data-help-key="val.R"]').locator('td.planet-params__value'),
      ).toHaveText('1.00');
    } finally {
      await custom.stop();
    }
  });

  test('медленный Exo.MAST показывает индикатор загрузки, затем успех', async ({ page }) => {
    const custom = await startStack({ exomast: 'slow:1500' });

    try {
      await gotoApp(page, custom);
      await waitForReady(page);
      await openPlanetCard(page, 'Earth-analog b');

      const refresh = page.getByRole('button', { name: 'Обновить данные планеты' });

      await refresh.click();
      await expect(refresh).toHaveAttribute('aria-busy', 'true');
      await expect(page.getByText('Загрузка данных Exo.MAST…')).toBeVisible();

      await expect(page.getByText('Данные Exo.MAST обновлены')).toBeVisible();
    } finally {
      await custom.stop();
    }
  });
});
