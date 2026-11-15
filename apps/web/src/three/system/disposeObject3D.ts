import * as THREE from 'three';

/**
 * Рекурсивное освобождение GPU-ресурсов дерева объектов (задача 22; п. 11.6).
 *
 * У каждой геометрии, материала и текстуры материала `dispose()` вызывается
 * ровно один раз, даже если ресурс используется несколькими мешами или
 * функция вызвана повторно. Объекты снимаются с родителей, поэтому дерево
 * не остаётся висеть в сцене.
 */

/** Уже освобождённые GPU-ресурсы. */
const disposedResources = new WeakSet<object>();

/** Освобождает ресурс ровно один раз. */
function disposeOnce(resource: { dispose(): void }): void {
  if (disposedResources.has(resource)) return;

  disposedResources.add(resource);
  resource.dispose();
}

/** Проверяет, что значение является текстурой. */
function isTexture(value: unknown): value is THREE.Texture {
  return value instanceof THREE.Texture;
}

/** Рекурсивно собирает текстуры из произвольного значения. */
function collectTextures(value: unknown, output: Set<THREE.Texture>, depth = 0): void {
  if (depth > 3 || value === null || value === undefined) return;

  if (isTexture(value)) {
    output.add(value);
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) collectTextures(item, output, depth + 1);
    return;
  }

  if (typeof value === 'object') {
    for (const item of Object.values(value as Record<string, unknown>)) {
      collectTextures(item, output, depth + 1);
    }
  }
}

/** Собирает все текстуры одного материала, включая uniform-ы шейдеров. */
function materialTextures(material: THREE.Material): Set<THREE.Texture> {
  const textures = new Set<THREE.Texture>();

  for (const value of Object.values(material as unknown as Record<string, unknown>)) {
    collectTextures(value, textures);
  }

  const uniforms = (material as THREE.ShaderMaterial).uniforms;

  if (uniforms !== undefined && uniforms !== null) {
    collectTextures(uniforms, textures);
  }

  return textures;
}

/**
 * Освобождает дерево объектов.
 *
 * Повторный вызов полностью безопасен: ресурсы помечаются как освобождённые
 * на уровне модуля, а отсутствие родителя не считается ошибкой.
 *
 * @param root Корень дерева; null и undefined допускаются.
 */
export function disposeObject3D(root: THREE.Object3D | null | undefined): void {
  if (root === null || root === undefined) return;

  const objects: THREE.Object3D[] = [];
  root.traverse((object) => {
    objects.push(object);
  });

  // Сначала ресурсы: обход не зависит от того, снят ли объект с родителя.
  for (const object of objects) {
    const renderable = object as THREE.Object3D & {
      geometry?: THREE.BufferGeometry;
      material?: THREE.Material | THREE.Material[];
    };

    if (renderable.geometry instanceof THREE.BufferGeometry) {
      disposeOnce(renderable.geometry);
    }

    const material = renderable.material;
    const materials = Array.isArray(material) ? material : material ? [material] : [];

    for (const item of materials) {
      for (const texture of materialTextures(item)) disposeOnce(texture);
      disposeOnce(item);
    }
  }

  // Снимаем снизу вверх: дочерние объекты исчезают раньше родителя.
  for (let index = objects.length - 1; index >= 0; index -= 1) {
    const object = objects[index];

    if (object !== undefined) object.removeFromParent();
  }
}
