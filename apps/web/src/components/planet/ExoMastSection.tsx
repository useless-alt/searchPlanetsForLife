import type { ExoMastProps } from '@exo/shared';
import { useStore } from 'zustand';

import type { ExoMastErrorReason } from '../../exomast/api';
import type { ExoMastEntry } from '../../exomast/slice';
import { ExtraOnly } from '../../extra/ExtraOnly';
import { formatMessage, ru } from '../../i18n/ru';
import { formatDateTime } from '../../lib/formatDate';
import { appStore, type AppStore } from '../../state/store';
import { Spinner } from '../ui';
import { SpectraList } from './SpectraList';

/**
 * Раздел «Атмосфера и спектры» карточки планеты (задача 28; п. 7.3, 10.7.5).
 *
 * Показывает одно из шести состояний загрузки, состав атмосферы, список
 * спектров и, в режиме служебных данных, первые ключи сырого ответа.
 */

/** Пропсы раздела. */
export interface ExoMastSectionProps {
  /** Планета; null — карточка закрыта. */
  planetId: string | null;
  /** Хранилище; в тестах подставляется изолированный экземпляр. */
  store?: AppStore;
}

/** Ключи причин ошибок. */
const REASON_KEYS: Record<ExoMastErrorReason, keyof typeof ru> = {
  timeout: 'errors.reason.timeout',
  dns_error: 'errors.reason.dns_error',
  http_4xx: 'errors.reason.http_4xx',
  http_5xx: 'errors.reason.http_5xx',
  invalid_json: 'errors.reason.invalid_json',
  empty: 'errors.reason.empty',
  schema_mismatch: 'errors.reason.schema_mismatch',
  planet_not_found: 'exomast.reason.planetNotFound',
  spectrum_not_listed: 'exomast.reason.spectrumNotListed',
};

/** Причина ошибки по-русски. */
export function exoMastReasonText(reason: ExoMastErrorReason | null): string {
  if (reason === null) return ru['exomast.reason.unknown'];

  return ru[REASON_KEYS[reason]] ?? ru['exomast.reason.unknown'];
}

/** Обрезает значение сырого поля до 120 символов. */
function rawValue(value: unknown): string {
  let text: string;

  try {
    text = typeof value === 'string' ? value : JSON.stringify(value);
  } catch {
    text = String(value);
  }

  return text.length > 120 ? `${text.slice(0, 120)}…` : text;
}

/** Первые 200 ключей сырого ответа. */
export function rawPreview(raw: Record<string, unknown>): string {
  return Object.entries(raw)
    .slice(0, 200)
    .map(([key, value]) => `${key}: ${rawValue(value)}`)
    .join('\n');
}

/** Строка статуса Exo.MAST. */
function StatusLine({ entry }: { entry: ExoMastEntry | null }) {
  if (entry === null || entry.state === 'idle') {
    return <p className="exomast__status">{ru['exomast.status.idle']}</p>;
  }

  if (entry.state === 'loading') {
    return (
      <p className="exomast__status" role="status">
        <Spinner size="sm" label={ru['exomast.status.loading']} />
        <span>{ru['exomast.status.loading']}</span>
      </p>
    );
  }

  if (entry.state === 'updated') {
    return (
      <p className="exomast__status">
        {formatMessage(ru['exomast.status.updated'], {
          date: entry.props === null ? ru['exomast.noDate'] : formatDateTime(entry.props.fetchedAt),
        })}
      </p>
    );
  }

  if (entry.state === 'backup') {
    return (
      <p className="exomast__status">
        {formatMessage(ru['exomast.status.backup'], {
          date: entry.props === null ? ru['exomast.noDate'] : formatDateTime(entry.props.fetchedAt),
        })}
      </p>
    );
  }

  if (entry.props !== null) {
    return (
      <p className="exomast__status exomast__status--error" role="status">
        {formatMessage(ru['exomast.status.errorWithProps'], {
          reason: exoMastReasonText(entry.errorReason),
        })}
      </p>
    );
  }

  return (
    <p className="exomast__status exomast__status--error" role="status">
      {formatMessage(ru['exomast.status.errorNoProps'], {
        reason: exoMastReasonText(entry.errorReason),
      })}
    </p>
  );
}

/** Состав атмосферы. */
function AtmosphereLine({ props }: { props: ExoMastProps }) {
  const molecules = props.atmosphere?.molecules ?? [];

  return (
    <p className="exomast__atmosphere">
      {molecules.length === 0
        ? ru['exomast.atmosphere.none']
        : formatMessage(ru['exomast.atmosphere.value'], { molecules: molecules.join(', ') })}
    </p>
  );
}

/** Раздел Exo.MAST в карточке планеты. */
export function ExoMastSection({ planetId, store = appStore }: ExoMastSectionProps) {
  const entry = useStore(store, (state) =>
    planetId === null ? undefined : state.exoMast[planetId],
  );

  if (planetId === null) return null;

  const props = entry?.props ?? null;

  return (
    <section
      className="planet-exomast"
      aria-label={ru['exomast.title']}
      data-help-key="card.exomast"
      data-layer="panel"
      data-cluster="planet"
      data-ui-text
    >
      <h3 className="planet-card__subtitle">{ru['exomast.title']}</h3>

      <StatusLine entry={entry ?? null} />

      {props === null ? null : (
        <>
          <AtmosphereLine props={props} />

          <div className="planet-exomast__spectra">
            <h4 className="planet-exomast__subtitle">{ru['spectra.title']}</h4>
            <SpectraList planetId={planetId} files={props.spectraFiles} store={store} />
          </div>

          <ExtraOnly id="card.exomast.raw" store={store}>
            <pre className="planet-exomast__raw">{rawPreview(props.raw)}</pre>
          </ExtraOnly>
        </>
      )}
    </section>
  );
}
