import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Тест шрифтов (задача 27a; U64).
 *
 * Обязательные условия: не больше двух семейств, самохостинг через
 * `@fontsource/*`, у каждого семейства есть кириллические начертания и ни
 * одного внешнего запроса к CDN. Проверяются и исходники, и собранный CSS,
 * если сборка уже лежит в `apps/web/dist`.
 */

/** Корень веб-приложения (тесты идут и из корня, и из пакета). */
function webRoot(): string {
  const candidates = [process.cwd(), path.resolve(process.cwd(), 'apps/web')];

  for (const candidate of candidates) {
    if (existsSync(path.join(candidate, 'index.html'))) return candidate;
  }

  throw new Error('Не найден apps/web');
}

/** Корень репозитория (для `node_modules`). */
function repoRoot(): string {
  const root = path.resolve(webRoot(), '../..');

  return existsSync(path.join(root, 'package.json')) ? root : process.cwd();
}

/** Все файлы с расширением из каталога рекурсивно. */
function collect(directory: string, extension: string, result: string[] = []): string[] {
  if (!existsSync(directory)) return result;

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);

    if (entry.isDirectory()) collect(full, extension, result);
    else if (entry.name.endsWith(extension)) result.push(full);
  }

  return result;
}

const mainSource = readFileSync(path.join(webRoot(), 'src/main.tsx'), 'utf8');

/** Семейства из импортов `@fontsource/<family>/…`. */
const families = new Set(
  [...mainSource.matchAll(/@fontsource\/([a-z0-9-]+)\//g)].map((match) => match[1] ?? ''),
);

describe('шрифты: два семейства, кириллица, самохостинг', () => {
  it('подключено ровно два семейства', () => {
    expect([...families].sort()).toEqual(['jetbrains-mono', 'manrope']);
  });

  it('у каждого семейства есть кириллические начертания', () => {
    for (const family of families) {
      const file = path.join(repoRoot(), 'node_modules/@fontsource', family, 'cyrillic-400.css');

      expect(existsSync(file), family).toBe(true);
      expect(readFileSync(file, 'utf8')).toContain('cyrillic');
    }
  });

  it('в разметке и исходном CSS нет внешних адресов шрифтов', () => {
    const files = [
      path.join(webRoot(), 'index.html'),
      path.join(webRoot(), 'src/main.tsx'),
      ...collect(path.join(webRoot(), 'src'), '.css'),
      ...collect(path.join(webRoot(), 'src'), '.tsx'),
    ];
    const forbidden = /fonts\.googleapis\.com|fonts\.gstatic\.com|url\(\s*['"]?https?:/i;

    for (const file of files) {
      const text = readFileSync(file, 'utf8');

      expect(forbidden.test(text), path.relative(webRoot(), file)).toBe(false);
    }
  });

  it('в собранном CSS нет внешних URL', () => {
    const assets = path.join(webRoot(), 'dist/assets');

    if (!existsSync(assets)) return;

    for (const file of collect(assets, '.css')) {
      const text = readFileSync(file, 'utf8');

      expect(/fonts\.googleapis\.com|fonts\.gstatic\.com/i.test(text), file).toBe(false);
      expect(/url\(\s*['"]?https?:/i.test(text), file).toBe(false);
    }
  });

  it('используется tabular-nums для чисел', () => {
    const css = readFileSync(path.join(webRoot(), 'src/styles/global.css'), 'utf8');

    expect(css).toContain('font-variant-numeric: tabular-nums');
  });
});
