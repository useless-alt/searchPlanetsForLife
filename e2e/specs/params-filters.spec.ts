import { expect, test } from '../fixtures/server';
import {
  closePlanetCard,
  exoState,
  openFilters,
  openModelParams,
  openPlanetCard,
  setMode,
} from '../helpers/app';

/**
 * Параметры модели и фильтры (задача 31; п. 10.4, 10.5).
 *
 * Проверяются границы HZ, штрафы, порог Q_data, фильтры по классу, радиусу,
 * температуре и эксцентриситету, сброс настроек и пустое состояние.
 */
test.describe('параметры модели и фильтры', () => {
  test('границы HZ меняют F_HZ Земли: ≈25 % и ≈74 % (11.4)', async ({ page }) => {
    await openPlanetCard(page, 'Earth-analog b');

    const fHz = page.locator('.planet-hz__row').filter({ hasText: 'F_HZ' }).locator('dd');

    await expect(fHz).toHaveText('25.2%');

    // Панель параметров и карточка делят правый край: закрываем карточку,
    // выбор планеты при этом сохраняется (10.3.4).
    await closePlanetCard(page);

    const panel = await openModelParams(page);

    await panel.getByRole('radio', { name: 'Оптимистичная' }).click();
    await panel.getByRole('button', { name: 'Применить' }).click();
    await expect(panel).toHaveCount(0);

    await expect.poll(async () => (await exoState(page)).hzBounds).toBe('optimistic');

    await page.getByRole('button', { name: 'Открыть карточку планеты Earth-analog b' }).click();
    await expect(
      page.locator('.planet-hz__row').filter({ hasText: 'F_HZ' }).locator('dd'),
    ).toHaveText('73.9%');
    await expect(page.getByText('Границы: Оптимистичная')).toBeVisible();
  });

  test('штрафы включаются и выключаются одним применением', async ({ page }) => {
    const row = page.locator('tr.top-table__row').filter({ hasText: 'Synth-049 b' });

    await expect(row).toBeVisible();

    const before = await row.locator('.top-table__index').innerText();

    expect(before).not.toBe('0.0%');

    const panel = await openModelParams(page);

    await panel
      .getByRole('checkbox', { name: 'Учитывать штраф за эксцентриситет орбиты (1 − e²)' })
      .uncheck({ force: true });
    await panel.getByRole('button', { name: 'Применить' }).click();

    await expect
      .poll(async () =>
        page
          .locator('tr.top-table__row')
          .filter({ hasText: 'Synth-049 b' })
          .locator('.top-table__index')
          .innerText(),
      )
      .not.toBe(before);

    // Повторное включение возвращает прежний балл.
    const again = await openModelParams(page);

    await again
      .getByRole('checkbox', { name: 'Учитывать штраф за эксцентриситет орбиты (1 − e²)' })
      .check({ force: true });
    await again.getByRole('button', { name: 'Применить' }).click();

    await expect
      .poll(async () =>
        page
          .locator('tr.top-table__row')
          .filter({ hasText: 'Synth-049 b' })
          .locator('.top-table__index')
          .innerText(),
      )
      .toBe(before);
  });

  test('порог Q_data сужает выборку, сброс настроек возвращает её', async ({ page }) => {
    const panel = await openModelParams(page);

    // Ползунок 75…100: значение задаётся тем же нативным сеттером, что и при
    // перетаскивании, иначе React не заметит изменение (value tracker).
    await panel.locator('input[type="range"]').evaluate((element) => {
      const input = element as HTMLInputElement;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;

      setter?.call(input, '95');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });

    await panel.getByRole('button', { name: 'Применить' }).click();

    await expect
      .poll(async () => {
        const counters = (await exoState(page)).counters as { matching?: number } | null;
        return counters?.matching ?? 0;
      })
      .toBeLessThan(79);

    await page.getByRole('button', { name: 'Сбросить настройки' }).first().click();

    await expect
      .poll(async () => {
        const counters = (await exoState(page)).counters as { matching?: number } | null;
        return counters?.matching ?? 0;
      })
      .toBe(79);
  });

  test('фильтр по классу звезды M оставляет только M-планеты', async ({ page }) => {
    const panel = await openFilters(page);

    await panel.getByRole('button', { name: 'M', exact: true }).click();
    await panel.getByRole('button', { name: 'Применить фильтры' }).click();

    await expect.poll(async () => (await exoState(page)).rowsCount).toBeGreaterThan(0);

    const classes = await page.locator('td.top-table__class').allTextContents();

    expect(classes.length).toBeGreaterThan(0);

    for (const value of classes) expect(value.trim()).toBe('M');

    await page.getByRole('button', { name: 'Сбросить фильтры' }).first().click();
    await expect.poll(async () => (await exoState(page)).rowsCount).toBe(50);
  });

  test('нулевой результат показывает пустое состояние и сбрасывается', async ({ page }) => {
    const panel = await openFilters(page);

    await panel.getByRole('textbox', { name: 'Радиус планеты R [R⊕], Макс' }).fill('0.01');
    await panel.getByRole('button', { name: 'Применить фильтры' }).click();

    await expect(page.getByText('Нет планет, подходящих под текущие настройки')).toBeVisible();

    await page.getByRole('button', { name: 'Сбросить фильтры' }).first().click();
    await expect.poll(async () => (await exoState(page)).rowsCount).toBe(50);
  });

  test('сброс настроек сохраняет режим расчёта (U34)', async ({ page }) => {
    await setMode(page, 'RHI');
    await expect.poll(async () => (await exoState(page)).mode).toBe('rhi');

    const panel = await openModelParams(page);

    await panel.getByRole('radio', { name: 'Оптимистичная' }).click();
    await panel.getByRole('button', { name: 'Применить' }).click();

    await page.getByRole('button', { name: 'Сбросить настройки' }).first().click();

    const state = await exoState(page);

    expect(state.mode).toBe('rhi');
    expect(state.scaleMode).toBe('overview');
  });
});
