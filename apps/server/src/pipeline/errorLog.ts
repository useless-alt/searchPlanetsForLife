/**
 * Журнал ошибок загрузки источников (задача 11, п. 8.2, U31).
 *
 * Журнал хранится в файле `data/error-log.jsonl` (append-only): одна строка —
 * одна запись JSON. При старте сервера последние 200 строк считываются
 * в память, поэтому эндпоинт `GET /api/errors` не читает диск на каждый
 * запрос. Новые записи дописываются в файл и в память.
 */

import { appendFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import type { ErrorLogEntry } from '@exo/shared';

/** Путь файла журнала по умолчанию (относительно рабочего каталога). */
export const DEFAULT_ERROR_LOG_PATH = 'data/error-log.jsonl';

/** Сколько последних строк считывается в память при старте (U31). */
export const ERROR_LOG_LOAD_LIMIT = 200;

/** Максимальный размер журнала в памяти процесса. */
export const ERROR_LOG_MEMORY_LIMIT = 1000;

/** Максимальное число записей в ответе `GET /api/errors`. */
export const ERROR_LOG_MAX_LIMIT = 1000;

/** Интерфейс журнала ошибок. */
export interface ErrorLog {
  /** Считывает последние строки файла в память (вызывается при старте). */
  load(limit?: number): Promise<void>;
  /** Дописывает запись в файл и в память. */
  append(entry: ErrorLogEntry): Promise<void>;
  /** Последние N записей, новые первыми. */
  recent(limit?: number): ErrorLogEntry[];
}

/** Настройки журнала. */
export interface ErrorLogOptions {
  /** Путь к файлу журнала; по умолчанию {@link DEFAULT_ERROR_LOG_PATH}. */
  filePath?: string;
  /** Сколько последних записей хранить в памяти. */
  memoryLimit?: number;
}

/**
 * Проверяет форму записи журнала (для чтения файла).
 *
 * Повреждённые строки пропускаются: журнал не должен мешать запуску.
 */
export function isErrorLogEntry(value: unknown): value is ErrorLogEntry {
  if (value === null || typeof value !== 'object') return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.source === 'string' &&
    typeof entry.time === 'string' &&
    typeof entry.reason === 'string' &&
    (entry.backupUsed === null || typeof entry.backupUsed === 'string')
  );
}

/**
 * Создаёт журнал ошибок.
 *
 * Запись в файл не отменяет результата загрузки: сбой журнала только
 * выводится в консоль (п. 10.1.3 — сбой вспомогательного хранилища
 * не должен ронять конвейер).
 */
export function createErrorLog(options: ErrorLogOptions = {}): ErrorLog {
  const filePath = options.filePath ?? DEFAULT_ERROR_LOG_PATH;
  const memoryLimit = Math.max(1, options.memoryLimit ?? ERROR_LOG_MEMORY_LIMIT);
  let memory: ErrorLogEntry[] = [];

  function trim(): void {
    if (memory.length > memoryLimit) {
      memory = memory.slice(memory.length - memoryLimit);
    }
  }

  async function load(limit: number = ERROR_LOG_LOAD_LIMIT): Promise<void> {
    let raw: string;
    try {
      raw = await readFile(filePath, 'utf8');
    } catch {
      return;
    }

    const lines = raw.split(/\r?\n/).filter((line) => line.trim() !== '');
    const tail = limit > 0 ? lines.slice(-limit) : [];
    const entries: ErrorLogEntry[] = [];
    for (const line of tail) {
      try {
        const parsed: unknown = JSON.parse(line);
        if (isErrorLogEntry(parsed)) entries.push(parsed);
      } catch {
        // Одна повреждённая строка не должна скрывать остальные записи.
      }
    }
    memory = entries.slice(-memoryLimit);
  }

  async function append(entry: ErrorLogEntry): Promise<void> {
    memory.push(entry);
    trim();
    try {
      await mkdir(path.dirname(filePath), { recursive: true });
      await appendFile(filePath, `${JSON.stringify(entry)}\n`, 'utf8');
    } catch (error: unknown) {
      console.warn('[error-log] не удалось дописать запись журнала:', error);
    }
  }

  function recent(limit: number = ERROR_LOG_LOAD_LIMIT): ErrorLogEntry[] {
    const safeLimit = Number.isFinite(limit)
      ? Math.min(ERROR_LOG_MAX_LIMIT, Math.max(0, Math.trunc(limit)))
      : ERROR_LOG_LOAD_LIMIT;
    if (safeLimit === 0) return [];
    return memory.slice(-safeLimit).reverse();
  }

  return { load, append, recent };
}
