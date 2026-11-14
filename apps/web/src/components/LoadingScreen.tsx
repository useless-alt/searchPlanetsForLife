import { SOURCES, type SourceId, type SourceStatus } from '@exo/shared';

import { formatMessage, ru, type RuKey } from '../i18n/ru';
import { Spinner } from './ui';

/**
 * Экран загрузки каталога (задача 12, п. 10.1).
 *
 * Пока сервер собирает снимок, показываются все шесть источников и их
 * текущие статусы: «Обновлено», «Используется резервная копия от {дата}»,
 * «Ошибка: резервной копии нет» (п. 8.3). Оформление — задача 12a: только
 * токены, чистый экран без лишних данных (п. 11.2).
 */

/** Названия источников из словаря. */
const SOURCE_NAME_KEYS: Record<SourceId, RuKey> = {
  gaia: 'source.gaia',
  exomast: 'source.exomast',
  nasa: 'source.nasa',
  exoplanet_eu: 'source.exoplanet_eu',
  simbad: 'source.simbad',
  exomercat: 'source.exomercat',
};

/** Дата резервной копии в коротком русском формате. */
function formatBackupDate(value: string | null): string {
  if (value === null) return '—';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' });
}

/** Текст состояния одного источника (п. 8.3). */
function sourceStateText(status: SourceStatus | undefined): string {
  switch (status?.state) {
    case 'updated':
      return ru['source.state.updated'];
    case 'backup':
      return formatMessage(ru['source.state.backup'], {
        date: formatBackupDate(status.backupAt),
      });
    case 'error_no_backup':
      return ru['source.state.error_no_backup'];
    default:
      return ru['source.state.pending'];
  }
}

/** Пропсы экрана загрузки. */
export interface LoadingScreenProps {
  /** Статусы источников; отсутствующий источник показывается как «Ожидание…». */
  sources: SourceStatus[];
}

/** Экран «Загрузка данных…» со списком источников. */
export default function LoadingScreen({ sources }: LoadingScreenProps) {
  const bySource = new Map(sources.map((status) => [status.source, status]));

  return (
    <section className="app-screen" aria-labelledby="loading-title">
      <h2 className="app-screen__title" id="loading-title">
        {ru['loading.title']}
      </h2>

      <Spinner label={ru['ui.loading']} />

      <h3>{ru['loading.sourcesTitle']}</h3>

      <ul className="app-sources">
        {SOURCES.map((source) => {
          const status = bySource.get(source.id);

          return (
            <li
              key={source.id}
              className="app-source"
              data-source={source.id}
              data-state={status?.state ?? 'pending'}
            >
              <span className="app-source__name">{ru[SOURCE_NAME_KEYS[source.id]]}</span>
              <span className="app-source__state">{sourceStateText(status)}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
