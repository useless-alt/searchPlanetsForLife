import { expect, test } from '../fixtures/server';
import { exoState, openPlanetCard } from '../helpers/app';

/**
 * Таблица Топ-50 (задача 31; п. 10.5.6, 10.5.7, 10.6).
 *
 * Сортировка по каждому столбцу, возврат к рангу, колонка Δ при сравнении,
 * заголовок d [пк] и восстановленные значения в карточке планеты.
 */
test.describe('таблица Топ-50', () => {
  test('сортирует по каждому столбцу и возвращает порядок рангов', async ({ page }) => {
    // Q_data и Δ показываются только со служебными данными (11.2).
    await page
      .getByRole('switch', { name: 'Показать дополнительные данные' })
      .check({ force: true });

    const columns = ['rank', 'index', 'Q_data', 'R', 'M', 'T_s', 'e', 'dist_pc'];

    for (const column of columns) {
      const header = page.locator(`th[data-help-key="col.${column}"]`);

      await expect(header).toBeVisible();

      const button = header.locator('button.ui-table__sort');

      await button.click();
      await expect
        .poll(async () => header.getAttribute('aria-sort'))
        .toMatch(/ascending|descending/);

      const firstDirection = await header.getAttribute('aria-sort');

      await button.click();
      await expect.poll(async () => header.getAttribute('aria-sort')).not.toBe(firstDirection);
    }

    // Возврат к рангу: первая колонка идёт 1, 2, 3…
    const rankHeader = page.locator('th[data-help-key="col.rank"]');

    if ((await rankHeader.getAttribute('aria-sort')) !== 'ascending') {
      await rankHeader.locator('button.ui-table__sort').click();
    }

    await expect.poll(async () => rankHeader.getAttribute('aria-sort')).toBe('ascending');

    const ranks = await page.locator('tr.top-table__row td:first-child').allTextContents();

    expect(ranks.slice(0, 5).map((value) => value.trim())).toEqual(['1', '2', '3', '4', '5']);
  });

  test('заголовок расстояния — d [пк], значения в парсеках', async ({ page }) => {
    const header = page.getByRole('columnheader', { name: /d \[пк\]/ });

    await expect(header).toBeVisible();

    const distances = await page.locator('[data-help-key="val.dist_pc"]').allTextContents();

    expect(distances.length).toBeGreaterThan(0);

    for (const value of distances.slice(0, 5)) {
      expect(value.trim()).not.toBe('—');
      expect(Number.parseFloat(value.replace('~', ''))).toBeGreaterThan(0);
    }
  });

  test('сравнение с упрощённым ESI добавляет Δ, отличную от нуля', async ({ page }) => {
    await page.getByRole('checkbox', { name: 'Сравнить с упрощённым ESI' }).check({ force: true });

    const deltas = await page.locator('tbody tr td:nth-child(2)').allTextContents();

    expect(deltas.length).toBeGreaterThan(0);
    expect(deltas.some((value) => /^\[[+-]\d+\]$/.test(value.trim()))).toBe(true);
  });

  test('карточка radius-only показывает реконструкцию и расчётное значение с ~', async ({
    page,
  }) => {
    await openPlanetCard(page, 'Radius-only b');

    await expect(page.getByText('Реконструкция по расчётной модели')).toBeVisible();

    const massRow = page.locator('tr[data-help-key="val.M"]');

    await expect(massRow).toBeVisible();
    await expect(massRow.locator('td.planet-params__value')).toHaveText('~2.53');
    await expect(massRow.getByText('Модель')).toBeVisible();
  });

  test('сортировка по Q_data сбрасывается при выключении служебных данных (U12)', async ({
    page,
  }) => {
    const toggle = page.getByRole('switch', { name: 'Показать дополнительные данные' });

    await toggle.check({ force: true });

    const qHeader = page.locator('th[data-help-key="col.Q_data"]');

    await qHeader.locator('button.ui-table__sort').click();
    await expect.poll(async () => qHeader.getAttribute('aria-sort')).not.toBe('none');

    await toggle.uncheck({ force: true });

    const state = await exoState(page);

    expect(state.showExtraData).toBe(false);
    await expect(page.locator('th[data-help-key="col.Q_data"]')).toHaveCount(0);
    await expect
      .poll(async () => page.locator('th[data-help-key="col.rank"]').getAttribute('aria-sort'))
      .toBe('ascending');
  });
});
