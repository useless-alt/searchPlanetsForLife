import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';

import { disposeObject3D } from './disposeObject3D';

/**
 * Тесты освобождения GPU-ресурсов (задача 22; п. 11.6).
 *
 * Проверяется ровно один вызов `dispose()` у каждой геометрии, материала
 * и текстуры, включая общие текстуры, а также безопасный повторный вызов.
 */
describe('disposeObject3D', () => {
  it('освобождает каждую геометрию, материал и текстуру ровно один раз', () => {
    const geometryA = new THREE.SphereGeometry(1, 4, 2);
    const geometryB = new THREE.BoxGeometry(1, 1, 1);
    const sharedTexture = new THREE.Texture();
    const normalTexture = new THREE.Texture();
    const materialA = new THREE.MeshStandardMaterial({
      map: sharedTexture,
      normalMap: normalTexture,
    });
    const materialB = new THREE.MeshBasicMaterial({ map: sharedTexture });

    const geometryASpy = vi.spyOn(geometryA, 'dispose');
    const geometryBSpy = vi.spyOn(geometryB, 'dispose');
    const materialASpy = vi.spyOn(materialA, 'dispose');
    const materialBSpy = vi.spyOn(materialB, 'dispose');
    const sharedTextureSpy = vi.spyOn(sharedTexture, 'dispose');
    const normalTextureSpy = vi.spyOn(normalTexture, 'dispose');

    const root = new THREE.Group();
    const outer = new THREE.Group();
    const meshA = new THREE.Mesh(geometryA, materialA);
    const meshB = new THREE.Mesh(geometryB, materialB);
    const nested = new THREE.Group();

    nested.add(meshB);
    meshA.add(nested);
    root.add(meshA);
    outer.add(root);

    disposeObject3D(root);
    disposeObject3D(root);

    expect(geometryASpy).toHaveBeenCalledTimes(1);
    expect(geometryBSpy).toHaveBeenCalledTimes(1);
    expect(materialASpy).toHaveBeenCalledTimes(1);
    expect(materialBSpy).toHaveBeenCalledTimes(1);
    expect(sharedTextureSpy).toHaveBeenCalledTimes(1);
    expect(normalTextureSpy).toHaveBeenCalledTimes(1);
    expect(root.parent).toBeNull();
    expect(meshA.parent).toBeNull();
    expect(meshB.parent).toBeNull();
    expect(outer.children).toHaveLength(0);
  });

  it('безопасен для null и пустой группы', () => {
    expect(() => disposeObject3D(null)).not.toThrow();
    expect(() => disposeObject3D(new THREE.Group())).not.toThrow();
  });
});
