/**
 * Ошибки получения данных источников (задача 8, п. 8.2).
 *
 * Любая неудача запроса к TAP-эндпоинту — это `SourceFetchError`
 * с машиночитаемым `reason`: журнал ошибок и панель диагностики
 * показывают причину без разбора текстов сообщений.
 */

import type { FetchErrorReason } from '@exo/shared';

/**
 * Ошибка получения данных источника.
 *
 * `reason` определяет, какой резерв использовать (п. 8.2):
 * причина не влияет на сами данные — она только объясняет отказ.
 */
export class SourceFetchError extends Error {
  /** Машиночитаемая причина ошибки. */
  readonly reason: FetchErrorReason;

  /** HTTP-статус ответа, если он известен; иначе null. */
  readonly status: number | null;

  /** Дополнительные сведения (первые символы тела ответа и т. п.). */
  readonly detail: string | null;

  constructor(
    reason: FetchErrorReason,
    message: string,
    options?: { status?: number | null; detail?: string | null },
  ) {
    super(message);
    this.name = 'SourceFetchError';
    this.reason = reason;
    this.status = options?.status ?? null;
    this.detail = options?.detail ?? null;
    Object.setPrototypeOf(this, SourceFetchError.prototype);
  }
}

/**
 * Проверяет, что значение — экземпляр `SourceFetchError`.
 * Вспомогательная функция для тестов и вызывающего кода.
 */
export function isSourceFetchError(value: unknown): value is SourceFetchError {
  return value instanceof SourceFetchError;
}
