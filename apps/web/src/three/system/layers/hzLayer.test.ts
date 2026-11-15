import {
  cameraExtent,
  computeHz,
  DEFAULT_SETTINGS,
  makeParam,
  makeScaleModel,
  nullParam,
  RENDER_ORDER,
  systemCameraPlan,
  type ModelSettings,
  type ResolvedPlanet,
  type ScaleMode,
} from '@exo/shared';
import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ru } from '../../../i18n/ru';
import type { PlanetDetail, PlanetHzView } from '../../../workers/protocol';
import { listSystemLayers } from '../layers';
import {
  createSystemContext,
  DEFAULT_SYSTEM_TOGGLES,
  type SystemContext,
  type SystemToggles,
} from '../runtime';
import { hzLayer } from './hzLayer';
import { HZ_RING_NAME } from './hzRingMaterial';

/**
 * Тесты слоя зоны обитаемости (задача 24; п. 11.4).
 *
 * Проверяются числа кольца (те же, что в карточке), плоскость XZ, материал,
 * смена границ и масштаба без пересоздания сцены, переключатель и
 * освобождение ресурсов.
 */

/** Параметры планеты, которые влияют на масштаб и зону. */
interface PlanetOverrides {
  st_teff?: number | null;
  st_rad?: number | null;
  L?: number | null;
  d?: number | null;
  e?: number | null;
  R?: number | null;
}

/** Разрешённая планета Земля с подменами. */
function earthResolved(overrides: PlanetOverrides = {}): ResolvedPlanet {
  const param = (value: number | null): ReturnType<typeof makeParam> =>
    value === null ? nullParam() : makeParam(value, 'measured');

  return {
    id: 'earth',
    R: param(overrides.R === undefined ? 1 : overrides.R),
    d: param(overrides.d === undefined ? 1 : overrides.d),
    e: param(overrides.e === undefined ? 0 : overrides.e),
    P: param(365.25),
    L: param(overrides.L === undefined ? 1 : overrides.L),
    st_rad: param(overrides.st_rad === undefined ? 1 : overrides.st_rad),
    st_teff: param(overrides.st_teff === undefined ? 5780 : overrides.st_teff),
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

/** Границы зоны из той же функции, что использует карточка. */
function hzView(planet: ResolvedPlanet, settings: ModelSettings): PlanetHzView | null {
  const result = computeHz({
    st_teff: planet.st_teff.value,
    L: planet.L.value,
    d: planet.d.value,
    e: planet.e.value,
    bounds: settings.hzBounds,
  });

  if (
    result.d_in === null ||
    result.d_out === null ||
    result.d_eff === null ||
    result.HZD === null ||
    result.F_HZ === null
  ) {
    return null;
  }

  return {
    d_in: result.d_in,
    d_out: result.d_out,
    d_eff: result.d_eff,
    HZD: result.HZD,
    F_HZ: result.F_HZ,
  };
}

/** Деталь планеты для контекста сцены. */
function detail(planet: ResolvedPlanet, settings: ModelSettings): PlanetDetail {
  return {
    id: planet.id,
    name: 'Земля',
    hostname: 'Солнце',
    letter: 'b',
    aliases: [],
    sourcesCount: 1,
    resolved: planet,
    score: null,
    classicRank: 1,
    hz: hzView(planet, settings),
    world: 'earthlike',
    gaps: { planet: [], star: [], planetStub: false, starStub: false },
    inTop: true,
  };
}

/** Собирает контекст сцены. */
function context(
  options: {
    bounds?: ModelSettings['hzBounds'];
    mode?: ScaleMode;
    toggles?: Partial<SystemToggles>;
    planet?: PlanetOverrides;
  } = {},
): SystemContext {
  const settings: ModelSettings = {
    ...DEFAULT_SETTINGS,
    hzBounds: options.bounds ?? 'optimistic',
  };
  const planet = earthResolved(options.planet);
  const scale = makeScaleModel(planet, options.mode ?? 'overview');

  if (scale === null) throw new Error('Модель масштаба не построена');

  return createSystemContext({
    detail: detail(planet, settings),
    settings,
    scale,
    toggles: options.toggles,
  });
}

/** Mesh кольца в группе слоя. */
function ringOf(root: THREE.Object3D): THREE.Mesh<THREE.RingGeometry, THREE.ShaderMaterial> {
  const mesh = root.getObjectByName(HZ_RING_NAME);

  if (!(mesh instanceof THREE.Mesh)) throw new Error('Кольцо зоны не построено');

  return mesh as THREE.Mesh<THREE.RingGeometry, THREE.ShaderMaterial>;
}

/** Радиусы по вершинам геометрии: минимум и максимум расстояния в плоскости XZ. */
function geometryRadii(mesh: THREE.Mesh): { inner: number; outer: number } {
  const position = mesh.geometry.getAttribute('position');
  let inner = Number.POSITIVE_INFINITY;
  let outer = 0;

  for (let index = 0; index < position.count; index += 1) {
    const x = position.getX(index);
    const z = position.getZ(index);
    const radius = Math.hypot(x, z);

    inner = Math.min(inner, radius);
    outer = Math.max(outer, radius);
  }

  return { inner, outer };
}

/** Значение uniform-а по имени. */
function uniform(material: THREE.ShaderMaterial, name: string): number {
  const value = material.uniforms[name]?.value;

  if (typeof value !== 'number') throw new Error(`Нет uniform ${name}`);

  return value;
}

/** Проверяет приближение. */
function expectClose(actual: number, expected: number, tolerance = 1e-5): void {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tolerance);
}

beforeEach(() => {
  hzLayer.dispose?.();
});

afterEach(() => {
  hzLayer.dispose?.();
});

describe('hzLayer — геометрия', () => {
  it('слой зарегистрирован с переключателем showHz и включён по умолчанию', () => {
    const registered = listSystemLayers().find((layer) => layer.id === 'hz');

    expect(registered).toBe(hzLayer);
    expect(hzLayer.toggleKey).toBe('showHz');
    expect(DEFAULT_SYSTEM_TOGGLES.showHz).toBe(true);

    const root = hzLayer.build(context()) as THREE.Group;

    expect(root.visible).toBe(true);
  });

  it('радиусы кольца совпадают с d_in и d_out из карточки', () => {
    const ctx = context({ bounds: 'optimistic' });
    const root = hzLayer.build(ctx) as THREE.Group;
    const mesh = ringOf(root);
    const radii = geometryRadii(mesh);
    const hz = ctx.detail.hz;

    expect(hz).not.toBeNull();

    const dIn = hz?.d_in ?? 0;
    const dOut = hz?.d_out ?? 0;

    // Числа карточки (задача 19): Земля с оптимистичными границами.
    expectClose(dIn, 0.7504, 1e-3);
    expectClose(dOut, 1.7678, 1e-3);
    expectClose(radii.inner, ctx.scale.unitsPerAU * dIn, 1e-5);
    expectClose(radii.outer, ctx.scale.unitsPerAU * dOut, 1e-5);
    expectClose(uniform(mesh.material, 'uInnerRadius'), radii.inner);
    expectClose(uniform(mesh.material, 'uOuterRadius'), radii.outer);
    expectClose(Number(mesh.userData['innerRadius']), radii.inner);
    expectClose(Number(mesh.userData['outerRadius']), radii.outer);
  });

  it('кольцо лежит в плоскости XZ, материал не пишет глубину', () => {
    const root = hzLayer.build(context()) as THREE.Group;
    const mesh = ringOf(root);
    const position = mesh.geometry.getAttribute('position');

    for (let index = 0; index < position.count; index += 1) {
      expect(position.getY(index)).toBeCloseTo(0, 12);
    }

    expect(mesh.material.transparent).toBe(true);
    expect(mesh.material.depthTest).toBe(true);
    expect(mesh.material.depthWrite).toBe(false);
    expect(mesh.material.side).toBe(THREE.DoubleSide);
    expect(mesh.renderOrder).toBe(RENDER_ORDER.hz);
    expect(mesh.material.opacity).toBeGreaterThanOrEqual(0.12);
    expect(mesh.material.opacity).toBeLessThanOrEqual(0.3);
    expect(uniform(mesh.material, 'uOpacity')).toBeGreaterThanOrEqual(0.12);
    expect(uniform(mesh.material, 'uOpacity')).toBeLessThanOrEqual(0.3);
    expect(uniform(mesh.material, 'uFadeFraction')).toBe(0.04);
  });
});

describe('hzLayer — смена границ и масштаба', () => {
  it('conservative → optimistic меняет радиусы, сохраняя слой и сцену', () => {
    const conservative = context({ bounds: 'conservative' });
    const root = hzLayer.build(conservative) as THREE.Group;
    const scene = new THREE.Scene();

    scene.add(root);

    const mesh = ringOf(root);
    const oldGeometry = mesh.geometry;
    const before = geometryRadii(mesh);
    const dispose = vi.spyOn(oldGeometry, 'dispose');
    const children = scene.children.length;

    hzLayer.update?.(context({ bounds: 'optimistic' }), 0);

    expect(ringOf(root)).toBe(mesh);
    expect(scene.children.length).toBe(children);
    expect(scene.children[0]).toBe(root);

    const optimistic = context({ bounds: 'optimistic' });
    const radii = geometryRadii(mesh);

    expect(radii.inner).not.toBeCloseTo(before.inner, 3);
    expectClose(radii.inner, optimistic.scale.unitsPerAU * (optimistic.detail.hz?.d_in ?? 0), 1e-5);
    expectClose(
      radii.outer,
      optimistic.scale.unitsPerAU * (optimistic.detail.hz?.d_out ?? 0),
      1e-5,
    );
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it('overview ↔ real перестраивает радиусы пропорционально unitsPerAU', () => {
    const overview = context({ mode: 'overview' });
    const root = hzLayer.build(overview) as THREE.Group;
    const mesh = ringOf(root);
    const overviewRadii = geometryRadii(mesh);

    const real = context({ mode: 'real' });

    hzLayer.update?.(real, 0);

    const realRadii = geometryRadii(mesh);
    const ratio = real.scale.unitsPerAU / overview.scale.unitsPerAU;

    expectClose(realRadii.inner / overviewRadii.inner, ratio, 1e-5);
    expectClose(realRadii.outer / overviewRadii.outer, ratio, 1e-5);
  });

  it('far и maxDistance учитывают внешний радиус зоны в обоих режимах', () => {
    for (const mode of ['overview', 'real'] as const) {
      const ctx = context({ mode });
      const hzOutAU = ctx.detail.hz?.d_out ?? 0;
      const input = {
        target: 'star' as const,
        mode,
        model: ctx.scale,
        dAU: ctx.detail.resolved.d.value ?? 1,
        e: ctx.detail.resolved.e.value ?? 0,
        hzOutAU,
      };
      const plan = systemCameraPlan(input);
      const extent = cameraExtent(input);

      expect(extent).toBeGreaterThanOrEqual(ctx.scale.unitsPerAU * hzOutAU);
      expect(plan.far).toBeGreaterThanOrEqual(4 * extent);
      expect(plan.controls.maxDistance).toBeGreaterThanOrEqual(4 * ctx.scale.unitsPerAU * hzOutAU);
    }
  });
});

describe('hzLayer — переключатель и недоступность', () => {
  it('showHz = false скрывает кольцо без пересоздания геометрии', () => {
    const ctx = context();
    const root = hzLayer.build(ctx) as THREE.Group;
    const mesh = ringOf(root);
    const geometry = mesh.geometry;
    const dispose = vi.spyOn(geometry, 'dispose');

    hzLayer.update?.({ ...ctx, toggles: { ...ctx.toggles, showHz: false } }, 0);

    expect(root.visible).toBe(false);
    expect(mesh.geometry).toBe(geometry);
    expect(dispose).not.toHaveBeenCalled();
  });

  it('недоступная зона не создаёт кольцо и объясняет причину', () => {
    const ctx = context({ planet: { st_teff: null } });

    expect(ctx.detail.hz).toBeNull();
    expect(hzLayer.status(ctx)).toBe('unavailable');

    const reason = hzLayer.reason?.(ctx) ?? '';

    expect(reason).toContain(ru['scene.hzUnavailable'].replace('{reason}', ''));
    expect(reason).toContain('температура звезды');

    const root = hzLayer.build(ctx) as THREE.Group;

    expect(root.getObjectByName(HZ_RING_NAME)).toBeUndefined();
    expect(root.visible).toBe(false);
  });
});

describe('hzLayer — освобождение ресурсов', () => {
  it('dispose освобождает геометрию и материал кольца', () => {
    const root = hzLayer.build(context()) as THREE.Group;
    const mesh = ringOf(root);
    const geometry = vi.spyOn(mesh.geometry, 'dispose');
    const material = vi.spyOn(mesh.material, 'dispose');

    hzLayer.dispose?.();

    expect(geometry).toHaveBeenCalledTimes(1);
    expect(material).toHaveBeenCalledTimes(1);
  });
});
