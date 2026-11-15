import type * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';

import {
  createDust,
  DUST_INNER_FACTOR,
  DUST_OUTER_FACTOR,
  DUST_RENDER_ORDER,
  DUST_ROTATION_RAD_PER_SEC,
  DUST_VERTEX_SHADER,
  DUST_FRAGMENT_SHADER,
} from './dust';

/**
 * Тесты облака пыли (задача 27; п. 9.2, 9.5).
 *
 * Проверяются распределение, число точек по качеству, drawRange,
 * reduced motion, вставки глубины и освобождение.
 */

describe('createDust', () => {
  it('распределяет точки в слое [1.5, 3.2] · radius', () => {
    const radius = 4;
    const dust = createDust({ radius, seed: 1, count: 500, color: '#9aa3ad' });
    const positions = dust.object.geometry.getAttribute('position');
    const radial: number[] = [];

    for (let index = 0; index < positions.count; index += 1) {
      const x = positions.getX(index);
      const y = positions.getY(index) / 0.75;
      const z = positions.getZ(index);

      radial.push(Math.hypot(x, y, z));
    }

    expect(Math.min(...radial)).toBeGreaterThanOrEqual(DUST_INNER_FACTOR * radius - 1e-6);
    expect(Math.max(...radial)).toBeLessThanOrEqual(DUST_OUTER_FACTOR * radius + 1e-6);
    expect(dust.object.renderOrder).toBe(DUST_RENDER_ORDER);
  });

  it('имеет атрибуты aSize, aAlpha и aPhase', () => {
    const dust = createDust({ radius: 1, seed: 2, count: 3, color: '#9aa3ad' });
    const geometry = dust.object.geometry;

    expect(geometry.getAttribute('aSize').count).toBe(3);
    expect(geometry.getAttribute('aAlpha').count).toBe(3);
    expect(geometry.getAttribute('aPhase').count).toBe(3);

    const sizes = geometry.getAttribute('aSize');

    expect(sizes.getX(0)).toBeGreaterThanOrEqual(2);
    expect(sizes.getX(0)).toBeLessThanOrEqual(6);
  });

  it('меняет drawRange при понижении качества без пересоздания буферов', () => {
    const dust = createDust({ radius: 1, seed: 3, count: 2500, color: '#9aa3ad' });
    const geometry = dust.object.geometry;

    dust.setQuality('medium');
    expect(geometry.drawRange.count).toBe(1500);
    expect(geometry.getAttribute('position').count).toBe(2500);

    dust.setQuality('low');
    expect(geometry.drawRange.count).toBe(600);
    expect(dust.count).toBe(600);
    expect(dust.object.geometry).toBe(geometry);
  });

  it('при reducedMotion не двигает пыль и не мерцает', () => {
    const dust = createDust({
      radius: 1,
      seed: 4,
      count: 10,
      color: '#9aa3ad',
      reducedMotion: true,
    });
    const material = dust.object.material as THREE.ShaderMaterial;

    dust.update(0.1, 5);
    dust.update(0.1, 10);

    expect(dust.object.rotation.y).toBe(0);
    expect(material.uniforms['uTime']?.value).toBe(0);
    expect(material.uniforms['uFlicker']?.value).toBe(0);
  });

  it('без reducedMotion вращает облако со скоростью 0.02 рад/с', () => {
    const dust = createDust({ radius: 1, seed: 5, count: 10, color: '#9aa3ad' });

    dust.update(0.1, 10);

    expect(dust.object.rotation.y).toBeCloseTo(DUST_ROTATION_RAD_PER_SEC * 10, 12);
  });

  it('шейдеры содержат logdepthbuf, а материал не пишет глубину', () => {
    const dust = createDust({ radius: 1, seed: 6, count: 10, color: '#9aa3ad' });
    const material = dust.object.material as THREE.ShaderMaterial;

    expect(DUST_VERTEX_SHADER.indexOf('#include <common>')).toBeLessThan(
      DUST_VERTEX_SHADER.indexOf('#include <logdepthbuf_pars_vertex>'),
    );
    expect(DUST_FRAGMENT_SHADER.indexOf('#include <common>')).toBeLessThan(
      DUST_FRAGMENT_SHADER.indexOf('#include <logdepthbuf_pars_fragment>'),
    );
    expect(DUST_VERTEX_SHADER).toContain('#include <logdepthbuf_vertex>');
    expect(DUST_FRAGMENT_SHADER).toContain('#include <logdepthbuf_fragment>');
    expect(material.depthWrite).toBe(false);
    expect(material.transparent).toBe(true);
  });

  it('dispose освобождает геометрию и материал', () => {
    const dust = createDust({ radius: 1, seed: 7, count: 10, color: '#9aa3ad' });
    const geometry = vi.spyOn(dust.object.geometry, 'dispose');
    const material = vi.spyOn(dust.object.material as THREE.Material, 'dispose');

    dust.dispose();
    dust.dispose();

    expect(geometry).toHaveBeenCalledTimes(1);
    expect(material).toHaveBeenCalledTimes(1);
  });
});
