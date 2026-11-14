/**
 * Хранилище резервных копий источников (п. 8.1–8.2).
 */

/** Имя файла последней версии копии. */
export const BACKUP_LATEST_FILENAME = 'latest.json';

/** Формат имени версионной копии: <YYYYMMDD_HHMMSS>.json. */
export const BACKUP_VERSION_PATTERN = 'YYYYMMDD_HHMMSS';

/** Минимальное число хранимых версий на источник. */
export const BACKUP_MIN_VERSIONS = 5;

/** Версия схемы резервных копий. */
export const BACKUP_SCHEMA_VERSION = 1;
