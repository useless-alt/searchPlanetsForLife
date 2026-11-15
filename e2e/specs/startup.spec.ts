import { expect, test } from '../fixtures/server';
import { exoState } from '../helpers/app';

/**
 * Запуск приложения (задача 31; п. 10.1, 11.2).
 *
 * Все источники в тестовом режиме успешны, поэтому баннеров быть не должно.
 * Служебные данные (счётчики, Δ, Q_data, «N ист.», «эксп.») по умолчанию
 * скрыты и включаются только переключателем (п. 11.2).
 */
test.describe('запуск и первый экран', () => {
  test('загружает ровно 50 строк и не показывает баннеров источников', async ({ page }) => {
    const state = await exoState(page);

    expect(state.phase).toBe('ready');
    expect(state.rowsCount).toBe(50);
    expect(state.mode).toBe('adaptive');

    await expect(page.locator('.header__banners')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Топ-50', exact: true })).toBeVisible();
  });

  test('по умолчанию скрывает служебные данные (11.2)', async ({ page }) => {
    await expect(page.getByText(/Всего в базе:/)).toHaveCount(0);
    await expect(page.getByRole('columnheader', { name: 'Δ' })).toHaveCount(0);
    await expect(page.getByRole('columnheader', { name: 'Q_data' })).toHaveCount(0);
    await expect(page.getByText(/\d+ ист\./)).toHaveCount(0);
    await expect(page.getByText('эксп.', { exact: true })).toHaveCount(0);
  });

  test('показывает счётчики и «N ист.» после включения служебных данных', async ({ page }) => {
    await page
      .getByRole('switch', { name: 'Показать дополнительные данные' })
      .check({ force: true });

    await expect(page.getByText(/Всего в базе: 80/)).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Δ' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Q_data' })).toBeVisible();
    await expect(page.getByText(/\d+ ист\./).first()).toBeVisible();
  });

  test('не запрашивает Exo.MAST при запуске (10.1.4)', async ({ page }) => {
    await expect(page.locator('.header__dot--mast')).toHaveAttribute(
      'aria-label',
      'Exo.MAST: не запрашивался',
    );

    await page.locator('.header__sources-button').click();
    await expect(page.locator('.sources__row[data-source="exomast"]')).toContainText(
      'Запрашивается при приближении к планете',
    );
  });
});
