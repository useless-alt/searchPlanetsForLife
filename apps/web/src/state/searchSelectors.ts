import { searchKey } from '@exo/shared';

import type { AppState, CatalogEntry } from './store';

/**
 * Селекторы поиска по каталогу (задача 14; п. 13.2).
 *
 * Поиск идёт по названию планеты и названию системы во всём каталоге, а не
 * только по Топ-50. Ключи `searchKey` считаются один раз на объект
 * `catalogIndex` (он заменяется только при загрузке нового снимка) и
 * кэшируются вместе с результатами запросов.
 *
 * Поиск ничего не фильтрует и не запускает пересчёт: селекторы возвращают
 * только идентификаторы совпадений для подсветки строк и меток.
 */

/** Минимальная длина нормализованного запроса, при которой начинается поиск. */
export const SEARCH_MIN_KEY_LENGTH = 2;

/** Сколько вариантов показывает выпадающий список (13.2). */
export const SEARCH_SUGGESTION_LIMIT = 8;

/** Индексный ключ планеты. */
interface IndexedEntry {
  /** Идентификатор планеты. */
  id: string;
  /** Отображаемое имя планеты. */
  name: string;
  /** Имя родительской звезды; null — неизвестно. */
  hostname: string | null;
  /** Нормализованное имя планеты. */
  nameKey: string;
  /** Нормализованное имя системы; пустая строка — имени нет. */
  hostKey: string;
}

/** Кэш ключей и результатов поиска для одного `catalogIndex`. */
interface CatalogSearchIndex {
  /** Все планеты каталога с готовыми ключами. */
  entries: IndexedEntry[];
  /** Результаты по нормализованному запросу. */
  matches: Map<string, IndexedEntry[]>;
}

/** Кэш на объект индекса каталога: ключи считаются один раз после загрузки. */
const catalogCache = new WeakMap<Record<string, CatalogEntry>, CatalogSearchIndex>();

/** Пустой результат: один и тот же массив, чтобы селектор был стабильным. */
const EMPTY_MATCHES: SearchMatch[] = [];
/** Пустой список идентификаторов: тот же массив между вызовами. */
const EMPTY_IDS: string[] = [];

/** Кэш последнего результата: селектор возвращает стабильную ссылку. */
interface SearchResultCache {
  /** Нормализованный запрос. */
  queryKey: string;
  /** Строки Топ-50, для которых построен результат. */
  rows: AppState['rows'];
  /** Совпадения с признаком «в Топ-50». */
  matches: SearchMatch[];
  /** Идентификаторы совпадений. */
  ids: string[];
}

/** Результат поиска на объект `catalogIndex`. */
const resultCache = new WeakMap<Record<string, CatalogEntry>, SearchResultCache>();

/** Строит (один раз) индекс ключей каталога. */
function buildIndex(catalogIndex: Record<string, CatalogEntry>): CatalogSearchIndex {
  const entries = Object.entries(catalogIndex).map(([id, entry]) => ({
    id,
    name: entry.name,
    hostname: entry.hostname,
    nameKey: searchKey(entry.name),
    hostKey: entry.hostname === null ? '' : searchKey(entry.hostname),
  }));

  return { entries, matches: new Map() };
}

/** Возвращает индекс ключей каталога, создавая его при первом обращении. */
function getIndex(catalogIndex: Record<string, CatalogEntry>): CatalogSearchIndex {
  const cached = catalogCache.get(catalogIndex);

  if (cached !== undefined) return cached;

  const index = buildIndex(catalogIndex);
  catalogCache.set(catalogIndex, index);

  return index;
}

/**
 * Группа совпадения (13.2):
 * 1 — имя планеты начинается с запроса;
 * 2 — имя планеты содержит запрос;
 * 3 — имя системы начинается с запроса;
 * 4 — имя системы содержит запрос;
 * 0 — совпадения нет.
 */
function matchGroup(entry: IndexedEntry, queryKey: string): number {
  if (entry.nameKey.startsWith(queryKey)) return 1;
  if (entry.nameKey.includes(queryKey)) return 2;
  if (entry.hostKey !== '' && entry.hostKey.startsWith(queryKey)) return 3;
  if (entry.hostKey !== '' && entry.hostKey.includes(queryKey)) return 4;

  return 0;
}

/** Порядок внутри группы: по имени, затем по идентификатору. */
function compareEntries(a: IndexedEntry, b: IndexedEntry): number {
  return (
    a.name.localeCompare(b.name, 'ru', { numeric: true, sensitivity: 'base' }) ||
    a.id.localeCompare(b.id)
  );
}

/** Все совпадения запроса в порядке, заданном п. 13.2. */
function matchedEntries(index: CatalogSearchIndex, queryKey: string): IndexedEntry[] {
  if (queryKey.length < SEARCH_MIN_KEY_LENGTH) return [];

  const cached = index.matches.get(queryKey);
  if (cached !== undefined) return cached;

  const found: Array<{ entry: IndexedEntry; group: number }> = [];

  for (const entry of index.entries) {
    const group = matchGroup(entry, queryKey);

    if (group > 0) found.push({ entry, group });
  }

  found.sort((a, b) => a.group - b.group || compareEntries(a.entry, b.entry));

  const result = found.map((item) => item.entry);
  index.matches.set(queryKey, result);

  return result;
}

/** Совпадение поиска для подсказки или подсветки. */
export interface SearchMatch {
  /** Идентификатор планеты. */
  id: string;
  /** Имя планеты. */
  name: string;
  /** Имя системы; null — неизвестно. */
  hostname: string | null;
  /** Планета присутствует в текущем Топ-50. */
  inTop: boolean;
}

/**
 * Все совпадения поиска в порядке подсказок (13.2).
 *
 * Список используется подсказками поля поиска, подсветкой строк таблицы
 * (задача 16) и меток карты (задача 21). Селектор возвращает стабильную
 * ссылку при неизменном запросе и неизменных строках: так его можно
 * подписывать через `useStore` без лишних перерисовок.
 */
export function selectSearchMatches(state: AppState): SearchMatch[] {
  const queryKey = searchKey(state.filters.search);

  if (queryKey.length < SEARCH_MIN_KEY_LENGTH) return EMPTY_MATCHES;

  const cached = resultCache.get(state.catalogIndex);

  if (cached !== undefined && cached.queryKey === queryKey && cached.rows === state.rows) {
    return cached.matches;
  }

  const entries = matchedEntries(getIndex(state.catalogIndex), queryKey);
  const topIds = new Set(state.rows.map((row) => row.planetId));
  const matches = entries.map((entry) => ({
    id: entry.id,
    name: entry.name,
    hostname: entry.hostname,
    inTop: topIds.has(entry.id),
  }));

  resultCache.set(state.catalogIndex, {
    queryKey,
    rows: state.rows,
    matches,
    ids: entries.map((entry) => entry.id),
  });

  return matches;
}

/** Идентификаторы всех совпадений поиска (13.2). */
export function selectSearchMatchIds(state: AppState): string[] {
  const queryKey = searchKey(state.filters.search);

  if (queryKey.length < SEARCH_MIN_KEY_LENGTH) return EMPTY_IDS;

  // Сначала обновляем общий кэш совпадений, затем берём готовые идентификаторы.
  const matches = selectSearchMatches(state);
  const cached = resultCache.get(state.catalogIndex);

  if (cached !== undefined && matches === cached.matches) return cached.ids;

  return matches.map((match) => match.id);
}
