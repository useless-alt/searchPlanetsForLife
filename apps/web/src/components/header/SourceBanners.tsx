import type { SourceStatus } from '@exo/shared';

import { formatMessage, ru, SOURCE_NAME_KEYS } from '../../i18n/ru';
import { formatDateTime } from '../../lib/formatDate';
import { Banner } from '../ui';
import { MAST_SOURCE_ID } from './SourcesButton';

/**
 * Баннеры источников под шапкой (задача 13; п. 8.3, 8.4, 10.1.8).
 *
 * Для каждого источника на резервной копии — «Не удалось обновить {источник}.
 * Используются резервные данные от {дата/время}»; для источника без копии —
 * «{источник}. Источник пропущен: резервной копии нет». Все строки
 * собираются в один баннер.
 *
 * Баннер не закрывается: по п. 8.4 факт сбоя показывается всегда, пока
 * условие не исчезло. Если все источники обновлены, баннера нет.
 *
 * Exo.MAST в баннер не входит: его сбой показывается в панели источников
 * и в карточке планеты (10.7.5).
 */

/** Пропсы баннеров источников. */
export interface SourceBannersProps {
  /** Статусы шести источников. */
  sources: SourceStatus[];
}

/** Баннеры источников. */
export function SourceBanners({ sources }: SourceBannersProps) {
  const lines: string[] = [];
  let hasError = false;

  for (const status of sources) {
    if (status.source === MAST_SOURCE_ID) continue;

    if (status.state === 'backup') {
      lines.push(
        formatMessage(ru['banner.source.backup'], {
          source: ru[SOURCE_NAME_KEYS[status.source]],
          date: formatDateTime(status.backupAt),
        }),
      );
    } else if (status.state === 'error_no_backup') {
      hasError = true;
      lines.push(
        formatMessage(ru['banner.source.error_no_backup'], {
          source: ru[SOURCE_NAME_KEYS[status.source]],
        }),
      );
    }
  }

  if (lines.length === 0) return null;

  return (
    <div className="header__banners">
      <Banner tone={hasError ? 'error' : 'warning'}>
        {lines.map((line) => (
          <span key={line} className="header__banner-line">
            {line}
          </span>
        ))}
      </Banner>
    </div>
  );
}
