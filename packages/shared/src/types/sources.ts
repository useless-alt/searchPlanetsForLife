import type { SourceId } from './provenance';

/**
 * Состояние источника данных (п. 8): обновлён, взят резерв, ошибка без резерва.
 */
export type SourceState = 'pending' | 'updated' | 'backup' | 'error_no_backup';

/** Статус одного источника для панели источников. */
export interface SourceStatus {
  /** Идентификатор источника. */
  source: SourceId;
  /** Текущее состояние источника. */
  state: SourceState;
  /** Дата и время резервной копии, если использовалась; иначе null. */
  backupAt: string | null;
  /** Сообщение об ошибке; null, если ошибки нет. */
  message: string | null;
}

/** Метаданные резервной копии источника (п. 8.1). */
export interface BackupMeta {
  /** Источник, к которому относится копия. */
  source: SourceId;
  /** Эндпоинт, из которого получены данные. */
  endpoint: string;
  /** Время получения данных (ISO 8601). */
  fetched_at: string;
  /** Число записей в копии. */
  record_count: number;
  /** Контрольная сумма содержимого. */
  checksum: string;
  /** Версия схемы данных. */
  schema_version: number;
}

/** Запись журнала ошибок (последние 50, п. 8). */
export interface ErrorLogEntry {
  /** Источник, на котором возникла ошибка. */
  source: SourceId;
  /** Время ошибки (ISO 8601). */
  time: string;
  /** Причина ошибки. */
  reason: string;
  /** Дата использованной резервной копии; null, если копии нет. */
  backupUsed: string | null;
}
