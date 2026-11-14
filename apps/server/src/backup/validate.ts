/**
 * Проверка данных перед записью резервной копии (п. 8.2).
 *
 * Проверки выполняются до любых операций с диском: при ошибке файлы
 * не создаются и не изменяются.
 */

import { BackupValidationError } from './errors';

/** Что проверять перед записью. */
export interface BackupValidationOptions {
  /** Число записей в payload (должно быть больше нуля). */
  recordCount: number;
  /** Обязательные поля записи; если заданы — проверяется первая запись. */
  requiredFields?: string[];
}

/**
 * Возвращает массив записей payload: сам payload, если это массив,
 * либо `payload.rows`, если это объект с массивом `rows`.
 * Если записей нет — `null`.
 */
export function extractRows(payload: unknown): unknown[] | null {
  if (Array.isArray(payload)) return payload;
  if (payload !== null && typeof payload === 'object') {
    const rows = (payload as { rows?: unknown }).rows;
    if (Array.isArray(rows)) return rows;
  }
  return null;
}

/**
 * Проверяет, что payload сериализуется в JSON и обратно разбирается.
 *
 * @throws {BackupValidationError} `invalid_json`.
 */
export function validateJsonPayload(payload: unknown): void {
  try {
    const serialized = JSON.stringify(payload);
    if (serialized === undefined) {
      throw new Error('payload не сериализуется в JSON');
    }
    JSON.parse(serialized);
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new BackupValidationError('invalid_json', 'payload не является корректным JSON', reason);
  }
}

/**
 * Проверяет, что в первой записи присутствуют все обязательные поля.
 *
 * Поле считается отсутствующим, если его нет в записи либо его значение —
 * `undefined` или `null` (данных по полю нет).
 *
 * @throws {BackupValidationError} `missing_fields`.
 */
export function validateRequiredFields(
  payload: unknown,
  requiredFields: readonly string[] | undefined,
): void {
  if (!requiredFields || requiredFields.length === 0) return;
  const rows = extractRows(payload);
  if (!rows || rows.length === 0) return;
  const first = rows[0];
  if (first === null || typeof first !== 'object') return;
  const record = first as Record<string, unknown>;
  const missing = requiredFields.filter((field) => {
    if (!(field in record)) return true;
    const value = record[field];
    return value === undefined || value === null;
  });
  if (missing.length > 0) {
    throw new BackupValidationError(
      'missing_fields',
      `В первой записи нет обязательных полей: ${missing.join(', ')}`,
      missing.join(', '),
    );
  }
}

/**
 * Полная проверка payload перед записью (п. 8.2).
 *
 * Порядок проверок: `invalid_json` → `empty` → `missing_fields`.
 *
 * @throws {BackupValidationError}
 */
export function validateBackupPayload(payload: unknown, options: BackupValidationOptions): void {
  validateJsonPayload(payload);
  if (!Number.isFinite(options.recordCount) || options.recordCount <= 0) {
    throw new BackupValidationError(
      'empty',
      `Число записей должно быть больше нуля, получено ${options.recordCount}`,
      String(options.recordCount),
    );
  }
  validateRequiredFields(payload, options.requiredFields);
}
