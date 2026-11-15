import { expect, test } from '../fixtures/server';
import { exoState, flyToPlanetScene, openPlanetCard, sceneStub, setMode } from '../helpers/app';

/**
 * Режимы расчёта (задача 31; п. 10.3).
 *
 * Четыре режима меняют состав и подсветку Топ-50. Строгий научный оставляет
 * только планеты с полным набором измерений, но не сбрасывает выбранную
 * планету: карточка и 3D-сцена продолжают показывать её (10.3.4).
 */
test.describe('режимы расчёта', () => {
  test('переключает четыре режима и сохраняет выбранную планету', async ({ page }) => {
    const initial = await exoState(page);

    expect(initial.rowsCount).toBe(50);
    expect(initial.mode).toBe('adaptive');

    await openPlanetCard(page, 'Earth-analog b');

    const selected = (await exoState(page)).selectedPlanetId;

    expect(selected).toBe('earth-analog-b');

    // RHI — другой порядок, но таблица остаётся непустой.
    await setMode(page, 'RHI');
    await expect.poll(async () => (await exoState(page)).mode).toBe('rhi');
    expect((await exoState(page)).rowsCount).toBeGreaterThan(0);

    // Строгий научный — только 12 планет с полным набором измерений.
    await setMode(page, 'Строгий научный');
    await expect.poll(async () => (await exoState(page)).mode).toBe('strict');

    const strict = await exoState(page);

    expect(strict.rowsCount).toBeGreaterThan(0);
    expect(strict.rowsCount).toBeLessThan(50);
    expect(strict.selectedPlanetId).toBe(selected);

    const counters = strict.counters as { strictMeasured?: number } | null;

    expect(counters?.strictMeasured).toBe(12);

    // Земля не проходит строгий режим, но карточка остаётся на экране.
    await expect(page.locator('aside.planet-card')).toHaveAttribute('aria-label', 'Earth-analog b');
    await expect(page.getByText('Планета не входит в текущий Топ-50')).toBeVisible();

    // Возврат в адаптивный режим восстанавливает широкий Топ-50.
    await setMode(page, 'Адаптивный');
    await expect.poll(async () => (await exoState(page)).rowsCount).toBe(50);
  });

  test('в «Упрощённом ESI» сравнение даёт Δ = [0] у всех строк (10.5.7)', async ({ page }) => {
    await setMode(page, 'Упрощённый ESI (R, S)');
    await expect.poll(async () => (await exoState(page)).mode).toBe('classic_esi');

    await page.getByRole('checkbox', { name: 'Сравнить с упрощённым ESI' }).check({ force: true });

    await expect(page.locator('th[data-help-key="col.delta"]')).toBeVisible();

    const deltas = await page.locator('tbody tr td:nth-child(2)').allTextContents();

    expect(deltas.length).toBeGreaterThan(0);

    for (const delta of deltas) expect(delta.trim()).toBe('[0]');
  });

  test('выбранная и выпавшая планета остаётся в 3D-сцене после смены режима', async ({ page }) => {
    await openPlanetCard(page, 'Earth-analog b');
    await flyToPlanetScene(page);

    const before = await exoState(page);

    expect(before.viewMode).toBe('system');
    expect(before.scenePlanetId).toBe('earth-analog-b');

    await setMode(page, 'Строгий научный');
    await expect.poll(async () => (await exoState(page)).mode).toBe('strict');

    const after = await exoState(page);

    // Планета выпала из Топ-50, но сцена продолжает её показывать (6.2).
    expect(after.viewMode).toBe('system');
    expect(after.scenePlanetId).toBe('earth-analog-b');
    expect((await sceneStub(page)).planet).toBe(false);
  });
});
