/**
 * Загрузка `.env` без внешних зависимостей (п. 1.3: конфигурация окружением).
 *
 * README и `.env.example` обещают, что достаточно скопировать `.env.example`
 * в `.env` и заполнить нужные значения, поэтому сервер и `npm run refresh`
 * читают эти файлы сами. Уже заданные переменные процесса не перетираются:
 * приоритет у окружения, затем `.env.local`, затем `.env`.
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Разбирает содержимое `.env` в объект.
 *
 * Поддерживается минимальный синтаксис: `KEY=VALUE`, комментарии `#`,
 * пустые строки, необязательные кавычки вокруг значения.
 */
export function parseEnvFile(text: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    const value = line
      .slice(eq + 1)
      .trim()
      .replace(/^["']|["']$/g, '');
    if (key !== '') result[key] = value;
  }
  return result;
}

/**
 * Читает `.env.local` и `.env` из текущего каталога и из корня репозитория.
 *
 * @param env целевое окружение (в тестах — обычный объект).
 * @param cwd текущий каталог; по умолчанию `process.cwd()`.
 * @returns список фактически прочитанных файлов.
 */
export function loadEnvFiles(
  env: NodeJS.ProcessEnv = process.env,
  cwd: string = process.cwd(),
): string[] {
  const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
  const candidates = [
    path.join(repoRoot, '.env.local'),
    path.join(repoRoot, '.env'),
    path.join(cwd, '.env.local'),
    path.join(cwd, '.env'),
  ];
  const loaded: string[] = [];
  const seen = new Set<string>();

  for (const filePath of candidates) {
    const normalized = path.resolve(filePath);
    if (seen.has(normalized) || !existsSync(normalized)) continue;
    seen.add(normalized);

    let text: string;
    try {
      text = readFileSync(normalized, 'utf8');
    } catch {
      continue;
    }

    const parsed = parseEnvFile(text);
    for (const [key, value] of Object.entries(parsed)) {
      if (env[key] === undefined) env[key] = value;
    }
    loaded.push(normalized);
  }

  return loaded;
}
