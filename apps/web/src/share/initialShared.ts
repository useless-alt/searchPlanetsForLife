import { decodeShare, type SharedState } from '@exo/shared';

/**
 * Восстановление состояния из ссылки (задача 20; 13.1, U45).
 *
 * Хэш читается ровно один раз до создания первого пересчёта: настройки,
 * фильтры и сортировка применяются к ещё не загруженному хранилищу, поэтому
 * каталог считается один раз — уже с нужными параметрами. После разбора хэш
 * удаляется из адреса, чтобы обновление страницы не возвращало старое
 * состояние поверх нового.
 */

/** Результат чтения ссылки. */
export interface InitialShare {
  /** Настройки, фильтры и сортировка; выбранная планета сюда не применяется. */
  state: Partial<SharedState>;
  /** Параметры, значения которых отброшены. */
  ignored: string[];
  /** Ссылка создана другой версией приложения. */
  versionMismatch: boolean;
  /** Планета из ссылки; null — не задана. */
  planetId: string | null;
  /** Нужно ли открыть карточку планеты (`open=1`). */
  openCard: boolean;
}

/** Признак того, что хэш уже прочитан этим модулем. */
let consumed = false;

/**
 * Разбирает хэш без побочных эффектов.
 *
 * @param hash Хэш с ведущим `#` или без него.
 * @returns null, если хэш пуст.
 */
export function parseInitialShared(hash: string): InitialShare | null {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;

  // Пустой хэш и обычный якорь (`#app-main` от ссылки «К содержимому») — не
  // ссылка на состояние: не показываем ложное сообщение о версии.
  if (raw === '' || !raw.includes('=')) return null;

  const decoded = decodeShare(raw);

  return {
    state: decoded.state,
    ignored: decoded.ignored,
    versionMismatch: decoded.ignored.includes('v'),
    planetId: decoded.state.selectedPlanetId ?? null,
    openCard: decoded.state.planetCardOpen ?? false,
  };
}

/**
 * Читает `location.hash` один раз и убирает его из адреса.
 *
 * Повторный вызов возвращает null: приложение не должно применять ссылку
 * дважды (например, при повторном монтировании в StrictMode).
 */
export function takeInitialShared(win: Window = window): InitialShare | null {
  if (consumed) return null;

  consumed = true;

  const { hash, pathname, search } = win.location;

  if (hash === '') return null;

  const parsed = parseInitialShared(hash);

  try {
    win.history.replaceState(null, '', `${pathname}${search}`);
  } catch {
    // История недоступна — состояние всё равно уже разобрано.
  }

  return parsed;
}

/** Сбрасывает флаг чтения; нужно только тестам. */
export function resetInitialShared(): void {
  consumed = false;
}
