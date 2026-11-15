import { expect, test } from '../fixtures/server';
import {
  domClick,
  exoState,
  flyToPlanetScene,
  openPlanetCard,
  sceneCamera,
  sceneHz,
  sceneLayers,
  sceneObjects,
  setScale,
  setSceneTarget,
  toggleSceneLayer,
} from '../helpers/app';
import { angleDegrees, distance, subtract } from '../helpers/math';

/**
 * Критерий 11.6 — цель приближения (задача 31).
 *
 * Планета: камера смотрит на неё, звезда позади, освещение боковое.
 * Звезда: камера в начале координат, орбита и зона остаются на фоне;
 * переключение сохраняет масштаб и слои; переход плавный.
 */
test.describe('11.6 цель приближения', () => {
  test.setTimeout(300_000);

  test('планета в центре кадра, звезда позади, освещение боковое', async ({ page }) => {
    await openPlanetCard(page, 'Earth-analog b');
    await flyToPlanetScene(page);

    const camera = await sceneCamera(page);
    const objects = await sceneObjects(page);

    expect(distance(camera.target, objects.planet.pos)).toBeLessThan(
      1e-3 * objects.planet.radius + 1e-9,
    );

    const viewDirection = subtract(camera.target, camera.position);
    const toStar = subtract(objects.star.pos, objects.planet.pos);
    const starBehind = angleDegrees(viewDirection, toStar);

    expect(starBehind).toBeLessThanOrEqual(100);

    const toCamera = subtract(camera.position, objects.planet.pos);
    const sideLight = angleDegrees(toCamera, toStar);

    expect(sideLight).toBeGreaterThanOrEqual(80);
    expect(sideLight).toBeLessThanOrEqual(100);
  });

  test('переключение на звезду сохраняет слои и масштаб, «Обзор» возвращает вид', async ({
    page,
  }) => {
    await openPlanetCard(page, 'Earth-analog b');
    await flyToPlanetScene(page);

    const before = await exoState(page);

    await setSceneTarget(page, 'Звезда');
    await expect.poll(async () => (await exoState(page)).sceneTarget).toBe('star');
    await expect
      .poll(async () => distance((await sceneCamera(page)).target, [0, 0, 0]))
      .toBeLessThan(1e-3);

    const after = await exoState(page);

    expect(after.scaleMode).toBe(before.scaleMode);
    expect(after.showOrbit).toBe(before.showOrbit);
    expect(after.showHz).toBe(before.showHz);

    const layers = await sceneLayers(page);

    expect(layers['orbit']?.visible).toBe(true);
    expect(layers['hz']?.visible).toBe(true);
    expect(await sceneHz(page)).not.toBeNull();

    // «Обзор» возвращает вид текущей цели — звезды.
    await domClick(page.locator('.scene-controls').getByRole('button', { name: 'Обзор' }));
    await expect
      .poll(async () => distance((await sceneCamera(page)).target, [0, 0, 0]))
      .toBeLessThan(1e-3);

    // Масштаб и переключатели не сбрасываются при смене цели.
    await setScale(page, '1:1');
    await toggleSceneLayer(page, 'hz');

    await setSceneTarget(page, 'Планета');
    await expect.poll(async () => (await exoState(page)).sceneTarget).toBe('planet');

    const restored = await exoState(page);

    expect(restored.scaleMode).toBe('real');
    expect(restored.showHz).toBe(false);
  });

  test('переход плавный: шаг между кадрами не больше 25 % пути', async ({ page }) => {
    await openPlanetCard(page, 'Earth-analog b');
    await flyToPlanetScene(page);

    await page.evaluate(() => {
      (
        window as unknown as { __exo: { scene: { clearCameraTrace(): void } } }
      ).__exo.scene.clearCameraTrace();
    });

    await setSceneTarget(page, 'Звезда');
    await expect.poll(async () => (await exoState(page)).sceneTarget).toBe('star');

    await page.waitForTimeout(1500);

    const trace = (await page.evaluate(() =>
      (
        window as unknown as {
          __exo: { scene: { cameraTrace(): [number, number, number][] } };
        }
      ).__exo.scene.cameraTrace(),
    )) as [number, number, number][];

    expect(trace.length).toBeGreaterThan(3);

    let path = 0;
    let maxStep = 0;

    for (let index = 1; index < trace.length; index += 1) {
      const step = distance(
        trace[index - 1] as [number, number, number],
        trace[index] as [number, number, number],
      );

      path += step;
      if (step > maxStep) maxStep = step;
    }

    expect(path).toBeGreaterThan(0);
    expect(maxStep / path).toBeLessThanOrEqual(0.25);
  });

  test('у планеты без звезды кнопка «Звезда» заблокирована и объясняет причину', async ({
    page,
  }) => {
    await openPlanetCard(page, 'Starless b');
    await flyToPlanetScene(page);

    const starOption = page.locator('.scene-controls').getByRole('radio', { name: 'Звезда' });

    await expect(starOption).toHaveAttribute('aria-disabled', 'true');

    const reason = await starOption.getAttribute('data-help-disabled-reason');

    expect(reason ?? '').toContain('Не хватает');

    await starOption.evaluate((element: HTMLElement) => element.click());

    expect((await exoState(page)).sceneTarget).toBe('planet');
  });
});
