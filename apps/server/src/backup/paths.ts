/**
 * Раскладка файлов резервных копий (п. 8.1).
 *
 * ${BACKUP_DIR}/<source>/latest.json
 * ${BACKUP_DIR}/<source>/<YYYYMMDD_HHMMSS>.json
 * ${BACKUP_DIR}/exomast/<key>/…           — кэш по планетам (U6).
 *
 * Имена источников и ключей кэша приводятся к безопасному виду: допустимы
 * только символы `[a-z0-9._-]`, прочие заменяются на `_`. Пустые значения,
 * `.`, `..` и любые пути (с `/` или `\`) отклоняются ошибкой `invalid_key`.
 */

import path from 'node:path';

import { BACKUP_LATEST_FILENAME } from '@exo/shared';

import { BackupValidationError } from './errors';

/** Символы вне безопасного набора заменяются на `_`. */
const UNSAFE_CHARS = /[^a-z0-9._-]/g;

/** Шаблон имени версионной копии: `YYYYMMDD_HHMMSS.json` (UTC). */
export const VERSION_FILE_PATTERN = /^\d{8}_\d{6}\.json$/;

/**
 * Приводит имя каталога (источника или ключа кэша) к безопасному виду.
 *
 * @throws {BackupValidationError} `invalid_key` — пустое значение, `.`, `..`
 *   или путь с разделителем `/`/`\`.
 */
export function sanitizeSegment(value: string, label: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new BackupValidationError('invalid_key', `Пустое значение ${label} недопустимо`, label);
  }
  if (value.includes('/') || value.includes('\\')) {
    throw new BackupValidationError(
      'invalid_key',
      `Значение ${label} не должно содержать путь: «${value}»`,
      label,
    );
  }
  if (value === '.' || value === '..') {
    throw new BackupValidationError(
      'invalid_key',
      `Значение ${label} «${value}» зарезервировано системой`,
      label,
    );
  }
  const safe = value.replace(UNSAFE_CHARS, '_');
  if (safe.length === 0) {
    throw new BackupValidationError('invalid_key', `Пустое значение ${label} недопустимо`, label);
  }
  return safe;
}

/** Проверяет, что имя файла — версионная копия `YYYYMMDD_HHMMSS.json`. */
export function isVersionFileName(name: string): boolean {
  return VERSION_FILE_PATTERN.test(name);
}

/**
 * Формирует имя версионной копии из момента времени.
 * Время берётся в UTC (п. 8.2).
 */
export function formatVersionName(date: Date): string {
  const two = (value: number): string => String(value).padStart(2, '0');
  const day = `${date.getUTCFullYear()}${two(date.getUTCMonth() + 1)}${two(date.getUTCDate())}`;
  const time = `${two(date.getUTCHours())}${two(date.getUTCMinutes())}${two(date.getUTCSeconds())}`;
  return `${day}_${time}.json`;
}

/**
 * Возвращает каталог копий источника.
 *
 * @param root — корневой каталог хранилища (`BACKUP_DIR`);
 * @param source — безопасное имя источника;
 * @param key — безопасный ключ кэша (например, `PlanetRecord.id` для Exo.MAST).
 */
export function resolveBackupDirectory(root: string, source: string, key?: string): string {
  const base = path.join(root, source);
  return key === undefined ? base : path.join(base, key);
}

/** Имя файла последней версии копии (`latest.json`). */
export const LATEST_FILE_NAME = BACKUP_LATEST_FILENAME;
