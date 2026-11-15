import { expect, test } from '../fixtures/server';
import {
  advanceDays,
  flyToPlanetScene,
  openPlanetCard,
  sceneLayers,
  sceneObjects,
  sceneOrbit,
  setScale,
  toggleSceneLayer,
  gpu,
} from '../helpers/app';
import { averageStep, distance, distanceToPolyline, midpointX, midpointZ } from '../helpers/math';

/**
 * Критерий 11.3 — орбита (задача 31).
 *
 * Проверяются замкнутость контура, фокус в звезде, попадание планеты на
 * ломаную в 20 моментов времени, обзорный и 1:1 масштабы, переключатель и
 * недоступность орбиты без большой полуоси.
 */
test.describe('11.3 орбита', () => {
  test.setTimeout(240_000);

  test('контур замкнут, звезда в фокусе, планета лежит на орбите', async ({ page }) => {
    await openPlanetCard(page, 'Eccentric b');
    await flyToPlanetScene(page);

    const orbit = await sceneOrbit(page, 360);

    expect(orbit).not.toBeNull();

    const points = orbit?.points ?? [];
    const unitsPerAU = orbit?.unitsPerAU ?? 0;

    expect(points).toHaveLength(360);
    expect(unitsPerAU).toBeGreaterThan(0);

    // Замкнутость: первая и последняя точки — соседи по контуру.
    const step = averageStep(points);

    expect(
      distance(points[0] as [number, number, number], points[359] as [number, number, number]),
    ).toBeLessThanOrEqual(step * 1.5);

    // Звезда в фокусе: центр эллипса смещён на a·e.
    const centerDistance = Math.hypot(midpointX(points), midpointZ(points));
    const expectedFocusOffset = 0.9 * 1 * unitsPerAU;

    expect(Math.abs(centerDistance - expectedFocusOffset)).toBeLessThan(1e-3);

    // 20 моментов времени: планета не отходит от ломаной.
    const tolerance = 1e-3 * 1 * unitsPerAU;

    for (let index = 0; index < 20; index += 1) {
      await advanceDays(page, 365.25 / 20);

      const objects = await sceneObjects(page);
      const distanceToOrbit = distanceToPolyline(objects.planet.pos, points);

      expect(distanceToOrbit, `момент ${index + 1}`).toBeLessThanOrEqual(tolerance + 1e-9);
    }

    // Перицентр не заходит под поверхность звезды (обзорный масштаб).
    const star = (await sceneObjects(page)).star;
    let minDistance = Number.POSITIVE_INFINITY;

    for (const point of points) {
      const current = Math.hypot(point[0], point[2]);

      if (current < minDistance) minDistance = current;
    }

    expect(minDistance).toBeGreaterThan(star.radius);
  });

  test('орбита строится в масштабе 1:1 и переключатель её скрывает', async ({ page }) => {
    await openPlanetCard(page, 'Earth-analog b');
    await flyToPlanetScene(page);

    const overview = await sceneOrbit(page, 120);

    expect(overview).not.toBeNull();
    expect(overview?.unitsPerAU ?? 0).toBeGreaterThan(0);
    expect((await sceneLayers(page))['orbit']?.visible).toBe(true);

    await setScale(page, '1:1');
    await expect
      .poll(async () => (await sceneOrbit(page, 120))?.unitsPerAU ?? 0)
      .toBeGreaterThan(20000);

    const real = await sceneOrbit(page, 120);

    expect(real).not.toBeNull();

    const expectedOffset = 0.0167 * 1 * (real?.unitsPerAU ?? 1);

    expect(Math.abs(Math.abs(midpointX(real?.points ?? [])) - expectedOffset)).toBeLessThan(1e-3);

    // Переключатель только меняет видимость: слой остаётся доступным,
    // геометрия не пересоздаётся.
    const before = await gpu(page);

    await toggleSceneLayer(page, 'orbit');
    await expect.poll(async () => (await sceneLayers(page))['orbit']?.visible).toBe(false);
    await toggleSceneLayer(page, 'orbit');
    await expect.poll(async () => (await sceneLayers(page))['orbit']?.visible).toBe(true);

    const after = await gpu(page);

    expect(after.geometries).toBeLessThanOrEqual(before.geometries + 2);
  });

  test.fixme('у планеты без большой полуоси переключатель неактивен и объясняет причину', async ({
    page,
  }) => {
    // Набор 27a не содержит планеты, у которой решатель не выводит d:
    // Level A восстанавливает большую полуось из P и массы звезды, поэтому
    // состояние `scale.nominal` недостижимо. Сценарий включится, когда
    // появится запись без P (или с явно некорректным e).
    await openPlanetCard(page, 'Insufficient b');
    await flyToPlanetScene(page);

    expect(await sceneOrbit(page, 60)).toBeNull();

    const toggle = page.locator('.scene-toggle[data-help-key="scene.orbit"]');

    await expect(toggle).toHaveAttribute('aria-disabled', 'true');
  });
});
