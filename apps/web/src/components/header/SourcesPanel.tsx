import { SOURCES, type SourceId, type SourceStatus } from '@exo/shared';

import { ExtraOnly } from '../../extra/ExtraOnly';
import { formatMessage, ru, SOURCE_NAME_KEYS } from '../../i18n/ru';
import { formatDateTime } from '../../lib/formatDate';
import { appStore, type AppStore } from '../../state/store';
import { Button, Panel } from '../ui';
import { MAST_SOURCE_ID } from './SourcesButton';

/**
 * Панель источников (задача 13; п. 8.3, 10.10.4).
 *
 * Строка на каждый из шести источников: название и текущий статус.
 * Статусы взяты из п. 8.3 дословно: «Обновлено», «Используется резервная
 * копия от {дата/время}», «Ошибка: резервной копии нет». Источник, который
 * не запрашивался, показан как «Не запрашивался»; для ленивого Exo.MAST —
 * «Запрашивается при приближении к планете» (10.1.4).
 *
 * Кнопки панели: «Повторить обновление» (10.10.4) и «Журнал ошибок».
 * Продолжение работы на резервных данных — это закрытие панели, отдельной
 * кнопки для него нет.
 *
 * Технические подписи (идентификатор и время построения снимка, число
 * записей) — служебные данные: они видны только в режиме «Показать
 * дополнительные данные» (задача 18, п. 11.2).
 */

/** Текст состояния источника (п. 8.3). */
function sourceStateText(status: SourceStatus | undefined, source: SourceId): string {
  switch (status?.state) {
    case 'updated':
      return ru['source.state.updated'];
    case 'backup':
      return formatMessage(ru['source.state.backup'], {
        date: formatDateTime(status.backupAt),
      });
    case 'error_no_backup':
      return ru['source.state.error_no_backup'];
    default:
      return source === MAST_SOURCE_ID
        ? ru['sources.state.pendingMast']
        : ru['sources.state.pending'];
  }
}

/** Пропсы панели источников. */
export interface SourcesPanelProps {
  /** Открыта ли панель. */
  open: boolean;
  /** Статусы шести источников. */
  sources: SourceStatus[];
  /** Идёт обновление каталога. */
  refreshing: boolean;
  /** Идентификатор снимка каталога; null — снимок ещё не загружен. */
  snapshotId?: string | null;
  /** Время сборки снимка (ISO 8601). */
  builtAt?: string | null;
  /** Число записей в снимке. */
  recordCount?: number;
  /** Хранилище; в тестах подставляется изолированный экземпляр. */
  store?: AppStore;
  /** Обработчик закрытия панели. */
  onClose: () => void;
  /** Обработчик кнопки «Повторить обновление». */
  onRetry: () => void;
  /** Обработчик кнопки «Журнал ошибок». */
  onOpenErrorLog: () => void;
}

/** Панель источников. */
export function SourcesPanel({
  open,
  sources,
  refreshing,
  snapshotId = null,
  builtAt = null,
  recordCount = 0,
  store = appStore,
  onClose,
  onRetry,
  onOpenErrorLog,
}: SourcesPanelProps) {
  const bySource = new Map(sources.map((status) => [status.source, status]));

  return (
    <Panel open={open} title={ru['sources.title']} onClose={onClose}>
      <ul className="sources">
        {SOURCES.map((source) => {
          const status = bySource.get(source.id);

          return (
            <li
              key={source.id}
              className="sources__row"
              data-source={source.id}
              data-state={status?.state ?? 'pending'}
            >
              <span className="sources__name">{ru[SOURCE_NAME_KEYS[source.id]]}</span>
              <span className="sources__state">{sourceStateText(status, source.id)}</span>
            </li>
          );
        })}
      </ul>

      <ExtraOnly id="sources.technical" store={store}>
        <p className="sources__technical">
          {formatMessage(ru['sources.technical'], {
            snapshot: snapshotId ?? '—',
            date: formatDateTime(builtAt),
            count: recordCount,
          })}
        </p>
      </ExtraOnly>

      <div className="sources__actions">
        <Button variant="secondary" onClick={onRetry} loading={refreshing}>
          {ru['sources.retry']}
        </Button>
        <Button variant="ghost" onClick={onOpenErrorLog}>
          {ru['sources.errorLog']}
        </Button>
      </div>
    </Panel>
  );
}
