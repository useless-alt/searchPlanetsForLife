/** Стабильный slug канонического имени планеты (U17, U30). */
export function slug(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9._-]/g, '');
}

/**
 * Возвращает уникальный ID кластера: при коллизии добавляет -2, -3 и т.д.
 * Порядок вызовов определяет порядок суффиксов (U30).
 */
export function uniquePlanetId(name: string, usedIds: Set<string>): string {
  const base = slug(name) || 'planet';
  let candidate = base;
  let suffix = 2;
  while (usedIds.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  usedIds.add(candidate);
  return candidate;
}
