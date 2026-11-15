import {
  DEFAULT_SETTINGS,
  makeParam,
  makeScaleModel,
  nullParam,
  ORBIT_ANIMATION_SECONDS,
  RENDER_ORDER,
  sampleEllipse,
  type ResolvedPlanet,
  type ScaleMode,
  type ScaleModel,
} from '@exo/shared';
import * as THREE from 'three';
import type { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { HELP_TEXTS } from '../../../i18n/help.ru';
import { ru } from '../../../i18n/ru';
import type { PlanetDetail } from '../../../workers/protocol';
import { listSystemLayers } from '../layers';
import {
  createSystemContext,
  DEFAULT_SYSTEM_TOGGLES,
  type SystemContext,
  type SystemToggles,
} from '../runtime';
import { SimClock } from '../SimClock';
import { createKeplerMotion } from './keplerMotion';
import { orbitLayer, ORBIT_LAYER_ID } from './orbitLayer';
import { ORBIT_CORE_NAME, ORBIT_LINE_NAME } from './orbitLine';

/**
 * Тесты слоя орбиты и движения планеты (задача 23; п. 11.3; U46, U49).
 *
 * Проверяются: планета лежит на нарисованном контуре в обзорном и реальном
 * масштабе, звезда в фокусе, перицентр не задевает звезду, переключатель не
 * пересоздаёт геометрию, смена масштаба перестраивает только линию, движение
 * не зависит от частоты кадров и возвращается в перицентр за
 * `ORBIT_ANIMATION_SECONDS`.
 */

/** Параметры планеты, влияющие на орбиту и масштаб. */
interface PlanetOverrides {
  id?: string;
  d?: number | null;
  e?: number | null;
  P?: number | null;
  R?: number | null;
  L?: number | null;
  st_rad?: number | null;
  st_teff?: number | null;
}

/** Разрешённая планета с подменами. */
function resolvedPlanet(overrides: PlanetOverrides = {}): ResolvedPlanet {
  const value = (number: number | null): ReturnType<typeof makeParam> =>
    number === null ? nullParam() : makeParam(number, 'measured');

  return {
    id: overrides.id ?? 'orbit-planet',
    R: value(overrides.R === undefined ? 1 : overrides.R),
    M: value(1),
    d: value(overrides.d === undefined ? 1.2 : overrides.d),
    e: value(overrides.e === undefined ? 0.45 : overrides.e),
    P: value(overrides.P === undefined ? 8 : overrides.P),
    S: value(1),
    T_eq: value(255),
    rho: value(5.5),
    L: value(overrides.L === undefined ? 1 : overrides.L),
    st_rad: value(overrides.st_rad === undefined ? 1 : overrides.st_rad),
    st_teff: value(overrides.st_teff === undefined ? 5780 : overrides.st_teff),
    flags: {
      insufficient_data: false,
      levelB_mass: false,
      levelB_radius: false,
      e_assumed_zero: false,
      excluded_subindices: [],
      k: 4,
      n: 4,
      strict_complete: true,
      available: {
        ESI_R: true,
        ESI_rho: true,
        ESI_ve: true,
        ESI_S: true,
        ESI_T: true,
        F_HZ: true,
      },
    },
  } as unknown as ResolvedPlanet;
}

/** Деталь планеты для контекста сцены. */
function detail(planet: ResolvedPlanet): PlanetDetail {
  return {
    id: planet.id,
    name: 'Планета',
    hostname: 'Звезда',
    letter: 'b',
    aliases: [],
    sourcesCount: 1,
    resolved: planet,
    score: null,
    classicRank: 1,
    hz: null,
    world: 'earthlike',
    gaps: { planet: [], star: [], planetStub: false, starStub: false },
    inTop: true,
  };
}

/** Собирает контекст сцены. */
function context(
  options: {
    mode?: ScaleMode;
    toggles?: Partial<SystemToggles>;
    planet?: PlanetOverrides;
    nominal?: boolean;
  } = {},
): SystemContext {
  const planet = resolvedPlanet(options.planet);
  const built = makeScaleModel(planet, options.mode ?? 'overview');

  if (built === null) throw new Error('Модель масштаба не построена');

  const scale: ScaleModel = options.nominal === true ? { ...built, nominal: true } : built;

  return createSystemContext({
    detail: detail(planet),
    settings: DEFAULT_SETTINGS,
    scale,
    toggles: options.toggles,
  });
}

/** Читает вершины линии из interleaved-буфера `LineGeometry`. */
function verticesOf(line: Line2): number[][] {
  const attribute = line.geometry.getAttribute('instanceStart') as unknown as
    { data: { array: Float32Array } } | undefined;

  if (attribute === undefined) return [];

  const data = attribute.data.array;
  const segments = data.length / 6;
  const vertices: number[][] = [];

  for (let index = 0; index < segments; index += 1) {
    const offset = index * 6;

    vertices.push([data[offset] ?? 0, data[offset + 1] ?? 0, data[offset + 2] ?? 0]);
  }

  vertices.push([
    data[data.length - 3] ?? 0,
    data[data.length - 2] ?? 0,
    data[data.length - 1] ?? 0,
  ]);

  return vertices;
}

/** Ядро линии в построенном слое. */
function coreOf(root: THREE.Object3D): Line2 {
  const lineGroup = root.getObjectByName(ORBIT_LINE_NAME);
  const core = lineGroup?.getObjectByName(ORBIT_CORE_NAME);

  if (core === undefined) throw new Error('Линия орбиты не построена');

  return core as Line2;
}

/** Расстояние от точки до отрезка в плоскости XZ. */
function segmentDistance(
  point: readonly number[],
  start: readonly number[],
  end: readonly number[],
): number {
  const px = point[0] ?? 0;
  const pz = point[2] ?? 0;
  const ax = start[0] ?? 0;
  const az = start[2] ?? 0;
  const bx = end[0] ?? 0;
  const bz = end[2] ?? 0;
  const dx = bx - ax;
  const dz = bz - az;
  const lengthSq = dx * dx + dz * dz;

  if (lengthSq === 0) return Math.hypot(px - ax, pz - az);

  const t = Math.min(1, Math.max(0, ((px - ax) * dx + (pz - az) * dz) / lengthSq));
  const closestX = ax + t * dx;
  const closestZ = az + t * dz;

  return Math.hypot(px - closestX, pz - closestZ);
}

/** Расстояние до ближайшего сегмента замкнутого контура. */
function nearestDistance(point: readonly number[], vertices: readonly number[][]): number {
  let best = Number.POSITIVE_INFINITY;

  for (let index = 0; index < vertices.length - 1; index += 1) {
    const start = vertices[index];
    const end = vertices[index + 1];

    if (start === undefined || end === undefined) continue;

    best = Math.min(best, segmentDistance(point, start, end));
  }

  return best;
}

/** Детерминированный генератор случайных чисел (LCG). */
function randomSource(seed: number): () => number {
  let state = seed >>> 0;

  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;

    return state / 0x100000000;
  };
}

/** Сравнивает числа с относительным допуском (вершины хранятся во Float32). */
function expectClose(actual: number, expected: number, relative = 1e-5): void {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(Math.abs(expected) * relative + 1e-6);
}

/** Планета в сцене по движению и модели масштаба. */
function planetScenePosition(ctx: SystemContext, simDays: number): number[] {
  const [x, y, z] = createKeplerMotion(ctx).positionAU(simDays);

  return [ctx.scale.mapAU(x), ctx.scale.mapAU(y), ctx.scale.mapAU(z)];
}

beforeEach(() => {
  orbitLayer.dispose?.();
});

describe('orbitLayer — регистрация и геометрия', () => {
  it('слой зарегистрирован с переключателем showOrbit и включён по умолчанию', () => {
    const registered = listSystemLayers().find((layer) => layer.id === ORBIT_LAYER_ID);

    expect(registered).toBe(orbitLayer);
    expect(orbitLayer.toggleKey).toBe('showOrbit');
    expect(DEFAULT_SYSTEM_TOGGLES.showOrbit).toBe(true);

    const root = orbitLayer.build(context()) as THREE.Group;

    expect(root.visible).toBe(true);
    expect(root.getObjectByName(ORBIT_LINE_NAME)).toBeDefined();
  });

  it('контур замкнут, а звезда находится в фокусе эллипса', () => {
    const ctx = context();
    const root = orbitLayer.build(ctx) as THREE.Group;
    const vertices = verticesOf(coreOf(root));
    const d = ctx.detail.resolved.d.value ?? 0;
    const e = ctx.detail.resolved.e.value ?? 0;
    const units = ctx.scale.unitsPerAU;

    expect(vertices[0]).toEqual(vertices[vertices.length - 1]);

    const points = vertices.slice(0, -1);

    // Расстояния считаются от начала координат (звезды), а не от центра эллипса.
    const distances = points.map(([x, , z]) => Math.hypot(x ?? 0, z ?? 0));

    expectClose(Math.min(...distances), units * d * (1 - e));
    expectClose(Math.max(...distances), units * d * (1 + e));
  });

  it('центр контура смещён на −a·e: фокус в звезде, а не в центре эллипса', () => {
    const ctx = context();
    const root = orbitLayer.build(ctx) as THREE.Group;
    const points = verticesOf(coreOf(root)).slice(0, -1);
    const d = ctx.detail.resolved.d.value ?? 0;
    const e = ctx.detail.resolved.e.value ?? 0;
    const meanX = points.reduce((sum, [x]) => sum + (x ?? 0), 0) / points.length;

    expect(meanX).toBeCloseTo(-ctx.scale.unitsPerAU * d * e, 3);
  });

  it('перицентр в обзорном режиме не задевает звезду', () => {
    const ctx = context();
    const root = orbitLayer.build(ctx) as THREE.Group;
    const points = verticesOf(coreOf(root)).slice(0, -1);
    const pericenter = Math.min(...points.map(([x, , z]) => Math.hypot(x ?? 0, z ?? 0)));

    expect(pericenter).toBeGreaterThanOrEqual(ctx.scale.starRadius + 2 - 1e-6);
    expect(pericenter).toBeGreaterThan(ctx.scale.planetRadius);
  });
});

describe('orbitLayer — планета на линии', () => {
  it.each(['overview', 'real'] as const)(
    'для 200 случайных суток планета лежит на контуре (%s)',
    (mode) => {
      const ctx = context({ mode });
      const root = orbitLayer.build(ctx) as THREE.Group;
      const vertices = verticesOf(coreOf(root));
      const d = ctx.detail.resolved.d.value ?? 0;
      const tolerance = 1e-3 * d * ctx.scale.unitsPerAU;
      const random = randomSource(mode === 'overview' ? 23 : 24);

      for (let index = 0; index < 200; index += 1) {
        const simDays = random() * 40;
        const position = planetScenePosition(ctx, simDays);

        expect(nearestDistance(position, vertices), `simDays=${simDays}`).toBeLessThanOrEqual(
          tolerance,
        );
      }
    },
  );

  it('контур совпадает с sampleEllipse, умноженным на unitsPerAU', () => {
    const ctx = context();
    const root = orbitLayer.build(ctx) as THREE.Group;
    const vertices = verticesOf(coreOf(root));
    const d = ctx.detail.resolved.d.value ?? 0;
    const e = ctx.detail.resolved.e.value ?? 0;
    const expected = sampleEllipse(d, e).map(([x, , z]) => [
      ctx.scale.mapAU(x),
      0,
      ctx.scale.mapAU(z),
    ]);

    expect(vertices).toHaveLength(expected.length + 1);

    for (let index = 0; index < expected.length; index += 1) {
      expectClose(vertices[index]?.[0] ?? 0, expected[index]?.[0] ?? 0);
      expectClose(vertices[index]?.[2] ?? 0, expected[index]?.[2] ?? 0);
    }
  });
});

describe('orbitLayer — переключатель и недоступность', () => {
  it('showOrbit = false скрывает линию без освобождения геометрии', () => {
    const ctx = context();
    const root = orbitLayer.build(ctx) as THREE.Group;
    const core = coreOf(root);
    const geometry = core.geometry;
    const dispose = vi.spyOn(geometry, 'dispose');

    orbitLayer.update?.({ ...ctx, toggles: { ...ctx.toggles, showOrbit: false } }, 0);

    expect(root.visible).toBe(false);
    expect(core.geometry).toBe(geometry);
    expect(dispose).not.toHaveBeenCalled();

    orbitLayer.update?.(ctx, 0);

    expect(root.visible).toBe(true);
    expect(core.geometry).toBe(geometry);
    expect(dispose).not.toHaveBeenCalled();
  });

  it('без большой полуоси линия не строится и причина берётся из ru.ts', () => {
    const ctx = context({ planet: { d: null } });

    expect(orbitLayer.status(ctx)).toBe('unavailable');

    const reason = orbitLayer.reason?.(ctx) ?? '';

    expect(reason).toContain(HELP_TEXTS.orbitUnavailable.replace('{reason}', ''));
    expect(reason).toContain(ru['scene.orbitMissing']);

    const root = orbitLayer.build(ctx) as THREE.Group;

    expect(root.getObjectByName(ORBIT_LINE_NAME)).toBeUndefined();
    expect(root.visible).toBe(false);
  });

  it('условное расстояние объясняет причину «Расстояние до звезды неизвестно»', () => {
    const ctx = context({ nominal: true });

    expect(orbitLayer.status(ctx)).toBe('unavailable');

    const reason = orbitLayer.reason?.(ctx) ?? '';

    expect(reason).toContain(HELP_TEXTS.orbitUnavailable.replace('{reason}', ''));
    expect(reason).toContain(ru['scene.orbitNominal']);

    const root = orbitLayer.build(ctx) as THREE.Group;

    expect(root.getObjectByName(ORBIT_LINE_NAME)).toBeUndefined();
    expect(root.visible).toBe(false);
  });
});

describe('orbitLayer — смена масштаба', () => {
  it('overview → real перестраивает геометрию, не добавляя объектов в сцену', () => {
    const overview = context({ mode: 'overview' });
    const root = orbitLayer.build(overview) as THREE.Group;
    const scene = new THREE.Scene();

    scene.add(root);

    const lineGroup = root.getObjectByName(ORBIT_LINE_NAME);
    const core = coreOf(root);
    const oldGeometry = core.geometry;
    const dispose = vi.spyOn(oldGeometry, 'dispose');
    const children = scene.children.length;
    const overviewVertices = verticesOf(core);

    orbitLayer.update?.(context({ mode: 'real' }), 0);

    expect(scene.children.length).toBe(children);
    expect(scene.children[0]).toBe(root);
    expect(root.getObjectByName(ORBIT_LINE_NAME)).toBe(lineGroup);
    expect(core.geometry).not.toBe(oldGeometry);
    expect(dispose).toHaveBeenCalledTimes(1);

    const realVertices = verticesOf(core);
    const realPericenterX = realVertices[0]?.[0] ?? 0;
    const overviewPericenterX = overviewVertices[0]?.[0] ?? 0;

    expect(realPericenterX).toBeGreaterThan(overviewPericenterX * 10);
  });
});

describe('orbitLayer — порядок отрисовки', () => {
  it('линия рисуется после непрозрачных объектов, не пишет глубину', () => {
    const root = orbitLayer.build(context()) as THREE.Group;
    const lineGroup = root.getObjectByName(ORBIT_LINE_NAME);
    const core = coreOf(root);

    expect(lineGroup?.renderOrder).toBe(RENDER_ORDER.orbit);
    expect(RENDER_ORDER.planet).toBeLessThan(RENDER_ORDER.orbit);
    expect(core.material.transparent).toBe(true);
    expect(core.material.depthTest).toBe(true);
    expect(core.material.depthWrite).toBe(false);
  });
});

describe('keplerMotion — движение', () => {
  /** Положение через заданное число секунд при частоте кадров `fps`. */
  function positionAfter(
    ctx: SystemContext,
    seconds: number,
    fps: number,
  ): [number, number, number] {
    const clock = new SimClock(ctx.detail.resolved.P.value);
    const motion = createKeplerMotion(ctx);
    const step = 1 / fps;
    const frames = Math.round(seconds * fps);
    let days = 0;

    for (let frame = 0; frame < frames; frame += 1) days = clock.advance(step);

    return motion.positionAU(days);
  }

  it('начинает движение с перицентра', () => {
    const ctx = context();
    const [x, y, z] = ctx.motion.positionAU(0);
    const d = ctx.detail.resolved.d.value ?? 0;
    const e = ctx.detail.resolved.e.value ?? 0;

    expect(x).toBeCloseTo(d * (1 - e), 12);
    expect(y).toBe(0);
    expect(z).toBeCloseTo(0, 12);
  });

  it('за ORBIT_ANIMATION_SECONDS возвращается в исходную точку при 30, 60 и 144 к/с', () => {
    const ctx = context({ planet: { P: 4 } });

    for (const fps of [30, 60, 144]) {
      const start = positionAfter(ctx, 0, fps);
      const finish = positionAfter(ctx, ORBIT_ANIMATION_SECONDS, fps);

      expect(finish[0], `${fps} к/с`).toBeCloseTo(start[0], 6);
      expect(finish[2], `${fps} к/с`).toBeCloseTo(start[2], 6);
    }
  });

  it('положение не зависит от частоты кадров 30, 60 и 144', () => {
    const ctx = context({ planet: { P: 4 } });
    const positions = [30, 60, 144].map((fps) => positionAfter(ctx, 10, fps));

    for (const position of positions) {
      expect(position[0]).toBeCloseTo(positions[0]?.[0] ?? 0, 6);
      expect(position[2]).toBeCloseTo(positions[0]?.[2] ?? 0, 6);
    }
  });

  it('без периода планета неподвижна в перицентре', () => {
    const ctx = context({ planet: { P: null } });
    const motion = createKeplerMotion(ctx);
    const start = motion.positionAU(0);

    expect(motion.positionAU(25)).toEqual(start);
  });

  it('без доступной орбиты движение остаётся статичным', () => {
    const ctx = context({ planet: { d: null } });
    const motion = createKeplerMotion(ctx);

    expect(motion.positionAU(10)).toEqual(motion.positionAU(0));
  });
});
