import { SOURCE_PRIORITY, type SourceId, type SourceStatus } from '@exo/shared';

import { formatMessage, ru } from '../../i18n/ru';
import { Button } from '../ui';

/**
 * Кнопка «Источники (N/N + MAST)» в шапке (задача 13; п. 8.3, 13.1).
 *
 * В скобках — число доступных источников из пяти статических: в счёт входят
 * источники со статусом «обновлено» и «используется резервная копия»
 * (U33). Exo.MAST показан отдельно: он ленивый, его состояние — цветной
 * индикатор с текстовой подписью, а не число.
 *
 * Если хотя бы один статический источник работает на резервной копии или
 * не имеет копии вовсе, на кнопке появляется индикатор предупреждения.
 */

/** Идентификатор ленивого источника Exo.MAST (п. 10.1.4). */
export const MAST_SOURCE_ID: SourceId = 'exomast';

/** Статические источники: все, кроме Exo.MAST (п. 5, 10.1.4). */
export const STATIC_SOURCE_IDS: readonly SourceId[] = SOURCE_PRIORITY.filter(
  (id) => id !== MAST_SOURCE_ID,
);

/** Состояние источника считается доступным, если данные свежие или взяты из копии. */
function isAvailable(state: SourceStatus['state']): boolean {
  return state === 'updated' || state === 'backup';
}

/** Пропсы кнопки источников. */
export interface SourcesButtonProps {
  /** Статусы шести источников. */
  sources: SourceStatus[];
  /** Обработчик клика: открыть панель источников. */
  onOpen: () => void;
}

/** Кнопка «Источники (N/N + MAST)». */
export function SourcesButton({ sources, onOpen }: SourcesButtonProps) {
  const bySource = new Map(sources.map((status) => [status.source, status]));

  const staticSources = STATIC_SOURCE_IDS.map((id) => bySource.get(id));

  const available = staticSources.filter(
    (status) => status !== undefined && isAvailable(status.state),
  ).length;

  const hasProblem = staticSources.some(
    (status) =>
      status !== undefined && (status.state === 'backup' || status.state === 'error_no_backup'),
  );

  const mast = bySource.get(MAST_SOURCE_ID);
  const mastState = mast?.state ?? 'pending';

  const label = formatMessage(ru['header.sources'], {
    available,
    total: STATIC_SOURCE_IDS.length,
  });

  const mastLabel = ru[`sources.mast.${mastState}`];

  return (
    <Button
      variant="secondary"
      size="sm"
      className="header__sources-button"
      onClick={onOpen}
      aria-label={label}
    >
      <span className="header__sources-label">{label}</span>
      {hasProblem ? <span className="header__dot header__dot--warning" aria-hidden="true" /> : null}
      <span
        className="header__dot header__dot--mast"
        data-state={mastState}
        role="img"
        aria-label={mastLabel}
      />
    </Button>
  );
}
