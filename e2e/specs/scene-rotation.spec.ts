import { expect, test } from '../fixtures/server';
import {
  advanceDays,
  advanceHours,
  flyToPlanetScene,
  gpu,
  leaveScene,
  openPlanetCard,
  pauseSim,
  sceneObjects,
  sceneRotation,
  setTimeScale,
} from '../helpers/app';
import { angleDelta, normalizeAngle } from '../helpers/math';

/**
 * Критерий 11.5 — вращение (задача 31).
 *
 * Условное вращение даёт полный оборот за 24·P часов, приливной захват
 * удерживает одну долготу к звезде, ось постоянна, а результат не зависит
 * от частоты кадров.
 */
test.describe('11.5 вращение', () => {
  test.setTimeout(300_000);

  test('условное вращение: полный оборот, прямое направление, постоянная ось', async ({ page }) => {
    await openPlanetCard(page, 'Earth-analog b');
    await flyToPlanetScene(page);
    await pauseSim(page);

    const initial = await sceneRotation(page);

    expect(initial.mode).toBe('assumed');
    expect(initial.periodDays).toBeGreaterThan(0);

    const axisBefore = initial.axis;
    let previous = initial.angle;
    let total = 0;
    const stepHours = (24 * initial.periodDays) / 8;

    for (let index = 0; index < 8; index += 1) {
      await advanceHours(page, stepHours);

      const current = (await sceneRotation(page)).angle;
      const delta = angleDelta(current, previous);

      // Прямое вращение: угол растёт на 2π/8 за шаг.
      expect(Math.abs(delta - Math.PI / 4), `шаг ${index + 1}`).toBeLessThan(1e-6);

      total += delta;
      previous = current;
    }

    expect(Math.abs(total - Math.PI * 2)).toBeLessThan(1e-6);

    await advanceDays(page, 10);

    const axisAfter = (await sceneRotation(page)).axis;

    for (let index = 0; index < 3; index += 1) {
      expect(Math.abs((axisAfter[index] ?? 0) - (axisBefore[index] ?? 0))).toBeLessThan(1e-9);
    }
  });

  test('угол не зависит от частоты кадров и множителя времени', async ({ page }) => {
    await openPlanetCard(page, 'Earth-analog b');
    await flyToPlanetScene(page);
    await pauseSim(page);

    const spec = await sceneRotation(page);

    await advanceHours(page, 24 * spec.periodDays);

    const oneStep = (await sceneRotation(page)).angle;

    await leaveScene(page);
    await flyToPlanetScene(page);
    await pauseSim(page);
    await setTimeScale(page, 4);

    // Тот же интервал, но мелкими шагами и с другим множителем часов.
    for (let index = 0; index < 4; index += 1) {
      await advanceHours(page, (24 * spec.periodDays) / 4);
    }

    const manySteps = (await sceneRotation(page)).angle;

    expect(angleDelta(oneStep, manySteps)).toBeLessThan(1e-6);
  });

  test('приливной захват: долгота к звезде постоянна в пределах 3.1°', async ({ page }) => {
    await openPlanetCard(page, 'Mdwarf-locked b');
    await flyToPlanetScene(page);
    await pauseSim(page);

    const spec = await sceneRotation(page);

    expect(spec.mode).toBe('locked');
    expect(spec.periodDays).toBe(4);

    const longitudes: number[] = [];
    let previous = spec.angle;
    let total = 0;

    for (let index = 0; index < 12; index += 1) {
      await advanceDays(page, spec.periodDays / 12);

      const rotation = await sceneRotation(page);
      const planet = (await sceneObjects(page)).planet.pos;

      // Долгота поверхности, смотрящей на звезду: азимут направления
      // «планета → звезда» минус угол поворота поверхности.
      const starAzimuth = Math.atan2(planet[2], -planet[0]);

      longitudes.push(normalizeAngle(starAzimuth - rotation.angle));

      const delta = angleDelta(rotation.angle, previous);

      expect(Math.abs(delta - Math.PI / 6), `шаг ${index + 1}`).toBeLessThan(1e-6);

      total += delta;
      previous = rotation.angle;
    }

    expect(Math.abs(total - Math.PI * 2)).toBeLessThan(1e-6);

    let spread = 0;

    for (let i = 0; i < longitudes.length; i += 1) {
      for (let j = i + 1; j < longitudes.length; j += 1) {
        const difference = angleDelta(longitudes[i] as number, longitudes[j] as number);

        if (difference > spread) spread = difference;
      }
    }

    // 3.1° в радианах.
    expect(spread).toBeLessThan((3.1 * Math.PI) / 180);
  });

  test('смена планеты возвращает счётчик геометрий к базовому значению', async ({ page }) => {
    await openPlanetCard(page, 'Earth-analog b');
    await flyToPlanetScene(page);

    const base = (await gpu(page)).geometries;

    await leaveScene(page);
    await flyToPlanetScene(page);

    const again = (await gpu(page)).geometries;

    expect(Math.abs(again - base)).toBeLessThanOrEqual(2);
  });
});
