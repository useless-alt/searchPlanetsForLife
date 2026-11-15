import {
  buildPlanetStyle,
  buildStarStyle,
  DEFAULT_SETTINGS,
  fnv1a32,
  makeParam,
  nullParam,
  type ResolvedPlanet,
  type ScaleModel,
  type SolverFlags,
  type WorldClass,
} from '@exo/shared';
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

import { createPlanetVisual } from '../three/system/visuals/planetVisual';
import { createStarVisual } from '../three/system/visuals/starVisual';
import type {
  PlanetVisualHandle,
  StarVisualHandle,
  VisualCtx,
} from '../three/system/visuals/types';
import { QUALITY_PROFILES, type QualityLevel } from '../three/host/quality';
import type { PlanetDetail } from '../workers/protocol';

/**
 * Галерея процедурных миров (задача 25; п. 9; U51, U52).
 *
 * Доступна только в dev-режиме по `?debug=worlds`: показывает шесть классов
 * миров и четыре звезды с температурами 2566, 3500, 5772 и 7500 К в одном
 * холсте. Используются те же фабрики, что и в сцене системы.
 */

/** Описание образца мира. */
interface Sample {
  /** Класс мира. */
  world: Exclude<WorldClass, 'unknown'>;
  /** Идентификатор для seed. */
  id: string;
  /** Радиус [R⊕]. */
  R: number;
  /** Равновесная температура [K]. */
  T_eq: number;
  /** Подпись для панели. */
  label: string;
}

/** Образцы: по одному на каждый класс U41. */
const SAMPLES: readonly Sample[] = [
  { world: 'earthlike', id: 'demo-earthlike', R: 1, T_eq: 255, label: 'Землеподобный' },
  { world: 'ice', id: 'demo-ice', R: 1, T_eq: 180, label: 'Ледяной' },
  { world: 'desert', id: 'demo-desert', R: 1, T_eq: 450, label: 'Пустынный' },
  { world: 'lava', id: 'demo-lava', R: 1, T_eq: 967, label: 'Лавовый' },
  { world: 'mini_neptune', id: 'demo-mini', R: 2.2, T_eq: 240, label: 'Мини-нептун' },
  { world: 'gas_giant', id: 'demo-gas', R: 10, T_eq: 500, label: 'Газовый гигант' },
];

/** Температуры звёзд галереи [K]. */
const STAR_TEMPERATURES: readonly number[] = [2566, 3500, 5772, 7500];

/** Флаги решателя для демонстрационных данных. */
function flags(): SolverFlags {
  return {
    insufficient_data: false,
    levelB_mass: false,
    levelB_radius: false,
    e_assumed_zero: false,
    excluded_subindices: [],
    k: 4,
    n: 4,
    strict_complete: false,
    available: {
      ESI_R: true,
      ESI_rho: true,
      ESI_ve: true,
      ESI_S: true,
      ESI_T: true,
      F_HZ: true,
    },
  };
}

/** Демонстрационная разрешённая планета. */
function demoResolved(sample: Sample, stTeff = 5772): ResolvedPlanet {
  return {
    id: sample.id,
    R: makeParam(sample.R, 'measured'),
    M: makeParam(Math.max(0.1, sample.R ** 2), 'physics'),
    e: makeParam(0, 'measured'),
    d: makeParam(1, 'measured'),
    P: makeParam(365, 'physics'),
    S: makeParam(1, 'physics'),
    T_eq: makeParam(sample.T_eq, 'physics'),
    rho: nullParam(),
    L: makeParam(1, 'measured'),
    st_teff: makeParam(stTeff, 'measured'),
    st_rad: makeParam(1, 'measured'),
    st_mass: makeParam(1, 'measured'),
    dist_pc: makeParam(10, 'measured'),
    ra: makeParam(0, 'measured'),
    dec: makeParam(0, 'measured'),
    flags: flags(),
  };
}

/** Демонстрационная деталь планеты. */
function demoDetail(sample: Sample, stTeff = 5772): PlanetDetail {
  return {
    id: sample.id,
    name: sample.label,
    hostname: 'Демо-звезда',
    letter: 'b',
    aliases: [],
    sourcesCount: 1,
    resolved: demoResolved(sample, stTeff),
    score: null,
    classicRank: null,
    hz: null,
    world: sample.world,
    gaps: { planet: [], star: [], planetStub: false, starStub: false },
    inTop: true,
  };
}

/** Модель масштаба галереи: миры одного размера. */
function demoScale(): ScaleModel {
  return {
    mode: 'overview',
    planetRadius: 1,
    starRadius: 1.35,
    unitsPerAU: 1,
    nominal: true,
    nominalStar: false,
    nominalPlanet: false,
    mapAU(radiusAU: number): number {
      return radiusAU;
    },
  };
}

/** Создаёт контекст визуала. */
function visualCtx(
  detail: PlanetDetail,
  quality: QualityLevel,
  kind: 'star' | 'planet',
): VisualCtx {
  return {
    detail,
    scale: demoScale(),
    quality,
    style:
      kind === 'star'
        ? buildStarStyle(detail.resolved, fnv1a32(detail.id))
        : buildPlanetStyle(detail),
    settings: DEFAULT_SETTINGS,
  };
}

/** Все визуальные объекты галереи. */
interface GalleryItem {
  kind: 'star' | 'planet';
  handle: StarVisualHandle | PlanetVisualHandle;
}

/** Создаёт все объекты галереи. */
function buildGallery(quality: QualityLevel): GalleryItem[] {
  const items: GalleryItem[] = [];

  STAR_TEMPERATURES.forEach((temperature, index) => {
    const sample: Sample = {
      world: 'earthlike',
      id: `demo-star-${temperature}`,
      R: 1,
      T_eq: 255,
      label: `${temperature} K`,
    };
    const detail = demoDetail(sample, temperature);
    const ctx = visualCtx(detail, quality, 'star');
    const handle = createStarVisual(ctx);

    handle.root.position.set((index - 1.5) * 3.1, 4.4, 0);
    items.push({ kind: 'star', handle });
  });

  SAMPLES.forEach((sample, index) => {
    const detail = demoDetail(sample);
    const ctx = visualCtx(detail, quality, 'planet');
    const handle = createPlanetVisual(ctx);

    if ('setSunState' in handle) {
      handle.root.position.set((index - (SAMPLES.length - 1) / 2) * 3.2, -3.2, 0);
      handle.setSunState(new THREE.Vector3(0, 0, 0), [1, 1, 1]);
    }
    items.push({ kind: 'planet', handle });
  });

  return items;
}

/**
 * Экран галереи миров.
 *
 * В production возвращает null; монтируется из `main.tsx` только при
 * `import.meta.env.DEV && ?debug=worlds`.
 */
export function WorldsGallery(): JSX.Element | null {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const itemsRef = useRef<GalleryItem[]>([]);
  const [quality, setQuality] = useState<QualityLevel>('high');
  const [water, setWater] = useState(false);
  const [methane, setMethane] = useState(false);

  useEffect(() => {
    if (!import.meta.env.DEV) return undefined;

    const container = containerRef.current;
    if (container === null) return undefined;

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      logarithmicDepthBuffer: true,
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(container.clientWidth, container.clientHeight, false);
    renderer.setClearColor(0x0b1014, 1);
    renderer.domElement.style.display = 'block';
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 200);
    camera.position.set(0, 0, 20);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enablePan = false;
    controls.minDistance = 6;
    controls.maxDistance = 45;
    controls.target.set(0, 0, 0);

    itemsRef.current = buildGallery('high');
    for (const item of itemsRef.current) scene.add(item.handle.root);

    let frameId = 0;
    const clock = new THREE.Clock();
    let elapsed = 0;

    const animate = (): void => {
      const dt = Math.min(clock.getDelta(), 0.1);

      elapsed += dt;
      controls.update();

      for (const item of itemsRef.current) {
        if (item.kind === 'star') {
          (item.handle as StarVisualHandle).update(dt, elapsed);
        } else {
          (item.handle as PlanetVisualHandle).setSunState(new THREE.Vector3(0, 0, 0), [1, 1, 1]);
        }
      }

      renderer.render(scene, camera);
      frameId = requestAnimationFrame(animate);
    };

    const resize = (): void => {
      const width = Math.max(1, container.clientWidth);
      const height = Math.max(1, container.clientHeight);

      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };

    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : null;

    observer?.observe(container);
    resize();
    animate();

    return () => {
      cancelAnimationFrame(frameId);
      observer?.disconnect();
      controls.dispose();

      for (const item of itemsRef.current) item.handle.dispose();
      itemsRef.current = [];

      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  useEffect(() => {
    if (!import.meta.env.DEV) return;

    const molecules: string[] = [];
    if (water) molecules.push('H2O');
    if (methane) molecules.push('CH4');
    const hints = molecules.length > 0 ? { molecules } : null;

    for (const item of itemsRef.current) {
      if (item.kind === 'planet') (item.handle as PlanetVisualHandle).setHints(hints);
    }
  }, [water, methane]);

  if (!import.meta.env.DEV) return null;

  const applyQuality = (next: QualityLevel): void => {
    setQuality(next);
    for (const item of itemsRef.current) {
      if (item.kind === 'star') (item.handle as StarVisualHandle).setQuality(next);
      else (item.handle as PlanetVisualHandle).setQuality(next);
    }
  };

  return (
    <div style={{ display: 'grid', gap: 'var(--space-4)', padding: 'var(--space-5)' }}>
      <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center' }}>
        <strong>Миры (dev, ?debug=worlds)</strong>
        {(['high', 'medium', 'low'] as const).map((level) => (
          <button
            key={level}
            type="button"
            className="ui-button"
            aria-pressed={quality === level}
            onClick={() => applyQuality(level)}
          >
            {level}
          </button>
        ))}
        <label>
          <input
            type="checkbox"
            checked={water}
            onChange={(event) => setWater(event.target.checked)}
          />{' '}
          H₂O
        </label>
        <label>
          <input
            type="checkbox"
            checked={methane}
            onChange={(event) => setMethane(event.target.checked)}
          />{' '}
          CH₄
        </label>
        <span style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-small)' }}>
          {QUALITY_PROFILES[quality].sphereSegments} сегментов
        </span>
      </div>
      <div
        ref={containerRef}
        style={{ position: 'relative', height: '72vh', background: 'var(--color-space)' }}
      />
      <div style={{ display: 'flex', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
        {SAMPLES.map((sample) => (
          <span key={sample.id} className="ui-badge">
            {sample.label}
          </span>
        ))}
      </div>
    </div>
  );
}

export default WorldsGallery;
