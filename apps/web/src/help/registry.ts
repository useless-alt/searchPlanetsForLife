/**
 * Реестр подсказок (задача 17; п. 11.1, 11.7).
 *
 * Ключ имеет вид `<scope>.<id>`. Области `col`, `val` и `unit` указывают на
 * одну запись физической величины с тем же идентификатором; остальные
 * области (`mode`, `params`, `filters`, `search`, `badge`, `tag`, `scene`,
 * `map`, `stub`, `extra`) — на запись по полному ключу.
 *
 * Неизвестный ключ подсказку не показывает. В тестовом режиме это ещё и
 * ошибка в консоли — так пропущенная запись словаря видна сразу.
 */

import { HELP_ENTRIES } from '../i18n/help.ru';
import type { HelpEntry } from './types';

/** Области, которые ссылаются на запись физической величины. */
const PHYSICAL_SCOPES = new Set(['col', 'val', 'unit']);

/** Области элементов управления (блок «Зачем» подписывается «Зачем нужно»). */
const CONTROL_SCOPES = new Set([
  'mode',
  'params',
  'filters',
  'search',
  'badge',
  'tag',
  'scene',
  'map',
  'stub',
  'extra',
]);

/** Синонимы идентификаторов величин внутри реестра. */
const ID_ALIASES: Record<string, string> = {
  d_in: 'd_in_out',
  d_out: 'd_in_out',
};

/** Записи, добавленные другими задачами через `registerHelp`. */
const registered = new Map<string, HelpEntry>();

/** Режим тестов: неизвестный ключ считается ошибкой (задача 17). */
function isTestMode(): boolean {
  try {
    return import.meta.env.MODE === 'test';
  } catch {
    return false;
  }
}

/** Разбирает ключ на область и идентификатор; `null` — ключ без области. */
export function splitHelpKey(key: string): { scope: string; id: string } | null {
  const dot = key.indexOf('.');

  if (dot <= 0 || dot === key.length - 1) return null;

  return { scope: key.slice(0, dot), id: key.slice(dot + 1) };
}

/** Это ключ элемента управления (а не физической величины)? */
export function isControlKey(key: string): boolean {
  const parsed = splitHelpKey(key);

  return parsed !== null && CONTROL_SCOPES.has(parsed.scope);
}

/**
 * Добавляет или заменяет запись словаря (задачи 18–29).
 *
 * Ключ может быть полным (`scene.orbit`) или идентификатором физической
 * величины (`R`): тогда его увидят `col.R`, `val.R` и `unit.R`.
 */
export function registerHelp(key: string, entry: HelpEntry): void {
  registered.set(key, entry);
}

/** Очищает записи, добавленные через `registerHelp` (для тестов). */
export function resetHelpRegistry(): void {
  registered.clear();
}

/**
 * Находит запись словаря по ключу.
 *
 * Порядок поиска: точная запись, затем для `col`/`val`/`unit` — запись
 * величины с тем же идентификатором. `null` — подсказка не показывается.
 */
export function resolveEntry(key: string): HelpEntry | null {
  const exact = registered.get(key) ?? HELP_ENTRIES[key];

  if (exact !== undefined) return exact;

  const parsed = splitHelpKey(key);

  if (parsed !== null && PHYSICAL_SCOPES.has(parsed.scope)) {
    const id = ID_ALIASES[parsed.id] ?? parsed.id;
    const entry = registered.get(id) ?? HELP_ENTRIES[id];

    if (entry !== undefined) return entry;
  }

  if (isTestMode()) {
    console.error(`[help] нет записи словаря для ключа «${key}»`);
  }

  return null;
}
