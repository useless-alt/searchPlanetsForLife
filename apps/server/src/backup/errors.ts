/**
 * Ошибки хранилища резервных копий (п. 8.2).
 *
 * Любая ошибка проверки данных до записи на диск — это `BackupValidationError`
 * с машиночитаемым `reason`: файлы при этом не меняются.
 */

/** Причина ошибки хранилища резервных копий. */
export type BackupErrorReason =
  /** payload не проходит JSON.parse(JSON.stringify(payload)). */
  | 'invalid_json'
  /** recordCount <= 0 — сохранять нечего. */
  | 'empty'
  /** В первой записи отсутствует обязательное поле. */
  | 'missing_fields'
  /** Недопустимый источник или ключ кэша (путь, пустое значение, `.`/`..`). */
  | 'invalid_key'
  /** Имя версии некорректно или версия повреждена. */
  | 'invalid_version'
  /** Файл версии не найден. */
  | 'not_found';

/**
 * Ошибка валидации резервной копии (п. 8.2).
 *
 * Бросается до изменения файлов на диске: диск остаётся в прежнем состоянии.
 */
export class BackupValidationError extends Error {
  /** Машиночитаемая причина ошибки. */
  readonly reason: BackupErrorReason;

  /** Дополнительные сведения (что именно не так) — для журнала ошибок. */
  readonly detail: string | undefined;

  constructor(reason: BackupErrorReason, message: string, detail?: string) {
    super(message);
    this.name = 'BackupValidationError';
    this.reason = reason;
    this.detail = detail;
    Object.setPrototypeOf(this, BackupValidationError.prototype);
  }
}

/**
 * Проверяет, что значение — экземпляр `BackupValidationError`.
 * Вспомогательная функция для тестов и вызывающего кода.
 */
export function isBackupValidationError(value: unknown): value is BackupValidationError {
  return value instanceof BackupValidationError;
}
