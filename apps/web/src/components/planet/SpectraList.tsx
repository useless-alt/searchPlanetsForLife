import type { SpectrumMeta } from '@exo/shared';
import { useState } from 'react';
import { useStore } from 'zustand';

import { ru } from '../../i18n/ru';
import { formatNum } from '../../lib/format';
import { appStore, type AppStore } from '../../state/store';
import { Button, Spinner } from '../ui';

/**
 * Список спектров Exo.MAST (задача 28; п. 7.3, 10.7.5).
 *
 * Показывает имя файла и тип; по кнопке «Показать сведения» — число строк
 * данных, столбцов, диапазон первого столбца и до трёх строк заголовка.
 * Заголовок выводится только текстом: разметка из файла не исполняется.
 */

/** Пропсы списка. */
export interface SpectraListProps {
  /** Планета. */
  planetId: string;
  /** Имена файлов; null — список не получен. */
  files: string[] | null;
  /** Хранилище; в тестах подставляется изолированный экземпляр. */
  store?: AppStore;
}

/** Подпись типа спектра. */
function kindLabel(meta: SpectrumMeta): string {
  if (meta.kind === 'transmission') return ru['spectra.type.transmission'];
  if (meta.kind === 'emission') return ru['spectra.type.emission'];
  return ru['spectra.type.other'];
}

/** Тип по имени файла (до загрузки сведений). */
function fileNameKind(file: string): string {
  const name = file.toLowerCase();

  if (name.includes('transmission')) return ru['spectra.type.transmission'];
  if (name.includes('emission')) return ru['spectra.type.emission'];
  return ru['spectra.type.other'];
}

/** Диапазон по первому столбцу. */
function rangeText(meta: SpectrumMeta): string {
  if (meta.firstColumnMin === null || meta.firstColumnMax === null) return ru['spectra.noRange'];

  return `${formatNum(meta.firstColumnMin)} — ${formatNum(meta.firstColumnMax)}`;
}

/** Список спектров. */
export function SpectraList({ planetId, files, store = appStore }: SpectraListProps) {
  const spectra = useStore(store, (state) => state.exoMast[planetId]?.spectra ?? {});
  const loadSpectrum = useStore(store, (state) => state.loadSpectrum);
  /** Свёрнутые сведения по файлам (по умолчанию раскрыты после загрузки). */
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  if (files === null || files === undefined) {
    return <p className="planet-card__note">{ru['spectra.notLoaded']}</p>;
  }

  if (files.length === 0) {
    return <p className="planet-card__note">{ru['spectra.empty']}</p>;
  }

  return (
    <ul className="spectra-list" data-help-key="card.spectrum" data-ui-text>
      {files.map((file) => {
        const entry = spectra[file];
        const ready = entry?.state === 'ready' && entry.meta !== null;
        const isCollapsed = collapsed[file] === true;

        return (
          <li key={file} className="spectra-list__item">
            <div className="spectra-list__head">
              <span className="spectra-list__name">{file}</span>
              <span className="spectra-list__kind">{fileNameKind(file)}</span>
              <Button
                variant="secondary"
                size="sm"
                loading={entry?.state === 'loading'}
                aria-expanded={ready ? !isCollapsed : undefined}
                onClick={() => {
                  if (ready) {
                    setCollapsed((previous) => ({ ...previous, [file]: !isCollapsed }));
                    return;
                  }

                  void loadSpectrum(planetId, file);
                }}
              >
                {ready && !isCollapsed ? ru['spectra.hide'] : ru['spectra.show']}
              </Button>
            </div>

            {entry?.state === 'loading' ? (
              <Spinner size="sm" label={ru['spectra.loading']} />
            ) : null}

            {entry?.state === 'error' ? (
              <p className="planet-card__note" role="status">
                {ru['spectra.error']}
              </p>
            ) : null}

            {ready && !isCollapsed && entry.meta !== null ? (
              <div className="spectra-list__meta">
                <p className="spectra-list__type">{kindLabel(entry.meta)}</p>
                <dl className="spectra-list__facts">
                  <div>
                    <dt>{ru['spectra.dataLines']}</dt>
                    <dd>{entry.meta.dataLines}</dd>
                  </div>
                  <div>
                    <dt>{ru['spectra.columns']}</dt>
                    <dd>{entry.meta.columns}</dd>
                  </div>
                  <div>
                    <dt>{ru['spectra.firstColumn']}</dt>
                    <dd>{rangeText(entry.meta)}</dd>
                  </div>
                </dl>
                {entry.meta.headerLines.length === 0 ? null : (
                  <div className="spectra-list__header">
                    <span className="spectra-list__label">{ru['spectra.header']}</span>
                    {entry.meta.headerLines.map((line, index) => (
                      <p key={`${file}-header-${String(index)}`}>{line}</p>
                    ))}
                  </div>
                )}
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
