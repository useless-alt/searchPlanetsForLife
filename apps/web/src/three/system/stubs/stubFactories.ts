import { fnv1a32, RENDER_ORDER_PLANET, RENDER_ORDER_STAR } from '@exo/shared';
import * as THREE from 'three';

import { QUALITY_PROFILES, type QualityLevel } from '../../host/quality';
import { tokens } from '../../../styles/theme';
import { disposeObject3D } from '../disposeObject3D';
import { registerStubFactory } from '../visuals/registry';
import type {
  PlanetVisualHandle,
  SpinController,
  SpinCtx,
  StarVisualHandle,
  VisualCtx,
} from '../visuals/types';
import { createDust, type DustCloud } from './dust';
import { createStubLabel, type StubLabelHandle } from './stubLabels';

/**
 * Заглушки звезды и планеты (задача 27; п. 9.2, 9.5; U38, U51).
 *
 * Планета — тёмно-серая сфера без атмосферы, облаков и вращения; звезда —
 * такая же сфера без короны. Вокруг каждой заглушки строится пыль, знак
 * вопроса и подпись. Цвета берутся только из токенов `--stub-*`.
 */

/** Проверяет `prefers-reduced-motion`. */
function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/** Создаёт сферу заглушки. */
function stubSphere(radius: number, color: string): THREE.Mesh {
  const geometry = new THREE.SphereGeometry(Math.max(radius, 1e-6), 32, 24);
  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color(color),
    roughness: 1,
    metalness: 0,
  });
  const mesh = new THREE.Mesh(geometry, material);

  mesh.name = 'surface';
  mesh.userData['placeholder'] = true;

  return mesh;
}

/** Создаёт пыль вокруг заглушки. */
function createStubDust(ctx: VisualCtx, radius: number): DustCloud {
  return createDust({
    radius,
    seed: fnv1a32(`${ctx.detail.id}:dust`),
    count: QUALITY_PROFILES[ctx.quality].dust,
    color: tokens['stub-dust'],
    reducedMotion: prefersReducedMotion(),
  });
}

/** Создаёт заглушку планеты. */
export function createPlanetStub(ctx: VisualCtx): PlanetVisualHandle {
  const radius = ctx.scale.planetRadius;
  const root = new THREE.Group();
  const axisGroup = new THREE.Group();
  const surface = stubSphere(radius, tokens['stub-planet']);
  const dust = createStubDust(ctx, radius);
  const label = createStubLabel({ detail: ctx.detail, kind: 'planet', radius });

  root.name = 'planet-stub';
  root.add(axisGroup);
  axisGroup.add(surface);
  root.add(dust.object, label.object);

  surface.renderOrder = RENDER_ORDER_PLANET;

  let disposed = false;

  return {
    root,
    object: root,
    axisGroup,
    surface,
    clouds: null,
    atmosphere: null,
    setSunState(): void {
      // Заглушка освещается общим светом сцены.
    },
    setQuality(level: QualityLevel): void {
      dust.setQuality(level);
    },
    setHints(): void {
      // У заглушки нет атмосферы.
    },
    attachSpin(controller: SpinController | null): void {
      // Вращения у заглушки нет: контроллер не подключается.
      controller?.dispose();
    },
    update(dtSec: number, spinCtx: SpinCtx): void {
      if (disposed) return;

      dust.update(dtSec, spinCtx.timeSec ?? 0);
    },
    dispose(): void {
      if (disposed) return;

      disposed = true;
      label.dispose();
      dust.dispose();
      disposeObject3D(root);
    },
  };
}

/** Создаёт заглушку звезды. */
export function createStarStub(ctx: VisualCtx): StarVisualHandle {
  const radius = ctx.scale.starRadius;
  const root = new THREE.Group();
  const surface = stubSphere(radius, tokens['stub-star']);
  const dust = createStubDust(ctx, radius);
  const label = createStubLabel({ detail: ctx.detail, kind: 'star', radius });

  root.name = 'star-stub';
  root.add(surface, dust.object, label.object);

  surface.renderOrder = RENDER_ORDER_STAR;

  let disposed = false;

  return {
    root,
    object: root,
    setQuality(level: QualityLevel): void {
      dust.setQuality(level);
    },
    update(dtSec: number, timeSec: number): void {
      if (disposed) return;

      dust.update(dtSec, timeSec);
    },
    dispose(): void {
      if (disposed) return;

      disposed = true;
      label.dispose();
      dust.dispose();
      disposeObject3D(root);
    },
  };
}

/** Регистрирует заглушки при импорте модуля (задача 27). */
export const unregisterStubFactories = (() => {
  const undoPlanet = registerStubFactory('planet', createPlanetStub);
  const undoStar = registerStubFactory('star', createStarStub);

  return () => {
    undoStar();
    undoPlanet();
  };
})();

/** Ссылки для явной регистрации в тестах. */
export const stubFactories = {
  planet: createPlanetStub,
  star: createStarStub,
} as const;

/** Экспорт типа подписи для потребителей. */
export type { StubLabelHandle };
