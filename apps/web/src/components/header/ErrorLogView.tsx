import type { ErrorLogEntry } from '@exo/shared';
import { useEffect } from 'react';

import { ru, SOURCE_NAME_KEYS, type RuKey } from '../../i18n/ru';
import { formatDateTime } from '../../lib/formatDate';
import { Spinner, Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from '../ui';

/**
 * Журнал ошибок источников (задача 13; п. 8.2, 10.10.4).
 *
 * Таблица «Время / Источник / Причина / Использованная копия»: причина
 * сбоя переводится в человеческий текст, а не показывается кодом. Причины
 * описаны в п. 8: тайм-аут, отказ соединения, ошибки HTTP, некорректный
 * ответ, пустой ответ, несовпадение схемы и неудачное сохранение копии.
 *
 * Журнал запрашивается при открытии: компонент монтируется вместе с
 * окном журнала и вызывает `onLoad`.
 */

/** Ключи текстов причин сбоя (п. 8). */
const REASON_KEYS: Record<string, RuKey> = {
  timeout: 'errors.reason.timeout',
  dns_error: 'errors.reason.dns_error',
  http_4xx: 'errors.reason.http_4xx',
  http_5xx: 'errors.reason.http_5xx',
  invalid_json: 'errors.reason.invalid_json',
  empty: 'errors.reason.empty',
  schema_mismatch: 'errors.reason.schema_mismatch',
  backup_write_failed: 'errors.reason.backup_write_failed',
};

/** Текст причины сбоя; неизвестный код показывается как есть. */
function reasonText(reason: string): string {
  const key = REASON_KEYS[reason];

  return key === undefined ? reason : ru[key];
}

/** Пропсы журнала ошибок. */
export interface ErrorLogViewProps {
  /** Записи журнала. */
  entries: ErrorLogEntry[];
  /** Идёт загрузка журнала. */
  loading: boolean;
  /** Обработчик загрузки журнала; вызывается при открытии. */
  onLoad: () => void;
}

/** Журнал ошибок источников. */
export function ErrorLogView({ entries, loading, onLoad }: ErrorLogViewProps) {
  useEffect(() => {
    onLoad();
  }, [onLoad]);

  if (loading) return <Spinner label={ru['ui.loading']} />;

  if (entries.length === 0) return <p className="errors__empty">{ru['errors.empty']}</p>;

  return (
    <Table className="errors">
      <TableHead>
        <TableRow>
          <TableHeaderCell label={ru['errors.column.time']} />
          <TableHeaderCell label={ru['errors.column.source']} />
          <TableHeaderCell label={ru['errors.column.reason']} />
          <TableHeaderCell label={ru['errors.column.backup']} />
        </TableRow>
      </TableHead>
      <TableBody>
        {entries.map((entry) => (
          <TableRow key={`${entry.source}-${entry.time}-${entry.reason}`}>
            <TableCell className="ui-mono">{formatDateTime(entry.time)}</TableCell>
            <TableCell>{ru[SOURCE_NAME_KEYS[entry.source]]}</TableCell>
            <TableCell>{reasonText(entry.reason)}</TableCell>
            <TableCell className="ui-mono">
              {entry.backupUsed === null ? ru['errors.noBackup'] : formatDateTime(entry.backupUsed)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
