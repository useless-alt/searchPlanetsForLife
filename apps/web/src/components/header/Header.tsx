import { useCallback, useState } from 'react';
import { useStore } from 'zustand';

import { ExtraOnly } from '../../extra/ExtraOnly';
import { ru } from '../../i18n/ru';
import { appStore, type AppStore } from '../../state/store';
import { Button, Modal, Spinner } from '../ui';
import { Counters } from './Counters';
import { ErrorLogView } from './ErrorLogView';
import { ExtraToggle } from './ExtraToggle';
import { ModeSwitch } from './ModeSwitch';
import { SelectedPlanetBadge } from './SelectedPlanetBadge';
import { SourceBanners } from './SourceBanners';
import { SourcesButton } from './SourcesButton';
import { SourcesPanel } from './SourcesPanel';

/**
 * Шапка приложения (задача 13; п. 4.1, 10.2, 10.3, 10.10, 13.1).
 *
 * Состав слева направо: название приложения, счётчики (только при
 * `showExtraData`, п. 11.2 и U12), переключатель режимов, бейдж выбранной
 * планеты, «Обзор», «CSV», «Ссылка», «Методика», «Источники (N/N + MAST)»,
 * «Обновить данные» и переключатель «Показать дополнительные данные»
 * (задача 18) — справа от обновления.
 *
 * Счётчики и технические подписи панели источников обёрнуты в `ExtraOnly`:
 * другой способ скрывать служебные данные не используется.
 *
 * Действия «CSV», «Ссылка» и «Методика» подключаются задачами 17 и 20 через
 * реестр действий: пока действие не зарегистрировано, кнопка недоступна.
 *
 * Обновление не блокирует интерфейс: во время него показывается индикатор,
 * кнопка недоступна, но остальные элементы работают (10.10.5).
 */

/** Пропсы шапки. */
export interface HeaderProps {
  /** Хранилище; в тестах подставляется изолированный экземпляр. */
  store?: AppStore;
}

/** Шапка приложения. */
export function Header({ store = appStore }: HeaderProps = {}) {
  const phase = useStore(store, (state) => state.phase);
  const counters = useStore(store, (state) => state.counters);
  const mode = useStore(store, (state) => state.settings.mode);
  const sources = useStore(store, (state) => state.sources);
  const snapshotId = useStore(store, (state) => state.snapshotId);
  const builtAt = useStore(store, (state) => state.builtAt);
  const selectedPlanetId = useStore(store, (state) => state.selectedPlanetId);
  const catalogIndex = useStore(store, (state) => state.catalogIndex);
  const actions = useStore(store, (state) => state.actions);
  const refreshing = useStore(store, (state) => state.refreshing);
  const errorLog = useStore(store, (state) => state.errorLog);
  const errorLogLoading = useStore(store, (state) => state.errorLogLoading);

  const setMode = useStore(store, (state) => state.setMode);
  const setPlanetCardOpen = useStore(store, (state) => state.setPlanetCardOpen);
  const requestCameraReset = useStore(store, (state) => state.requestCameraReset);
  const refresh = useStore(store, (state) => state.refresh);
  const loadErrorLog = useStore(store, (state) => state.loadErrorLog);

  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [errorLogOpen, setErrorLogOpen] = useState(false);

  /** Открывает журнал ошибок и запрашивает его содержимое. */
  const handleOpenErrorLog = useCallback(() => {
    setErrorLogOpen(true);
  }, []);

  /** Загружает журнал ошибок при открытии окна журнала. */
  const handleLoadErrorLog = useCallback(() => {
    void loadErrorLog();
  }, [loadErrorLog]);

  // Планета, выпавшая из Топ-50, остаётся в бейдже (10.3.5).
  const planetName =
    selectedPlanetId === null ? null : (catalogIndex[selectedPlanetId]?.name ?? selectedPlanetId);

  return (
    <>
      <header className="header">
        <div className="header__inner">
          <h1 className="header__title">{ru['app.title']}</h1>

          <ExtraOnly id="header.counters" store={store}>
            <Counters counters={counters} />
          </ExtraOnly>

          <ModeSwitch
            value={mode}
            disabled={phase !== 'ready'}
            onChange={(next) => setMode(next)}
          />

          {planetName !== null ? (
            <SelectedPlanetBadge name={planetName} onOpen={() => setPlanetCardOpen(true)} />
          ) : null}

          <div className="header__actions">
            <Button variant="ghost" size="sm" onClick={requestCameraReset}>
              {ru['header.overview']}
            </Button>

            <Button
              variant="ghost"
              size="sm"
              disabled={actions.exportCsv === null}
              onClick={() => actions.exportCsv?.()}
            >
              {ru['header.csv']}
            </Button>

            <Button
              variant="ghost"
              size="sm"
              disabled={actions.copyLink === null}
              onClick={() => actions.copyLink?.()}
            >
              {ru['header.link']}
            </Button>

            <Button
              variant="ghost"
              size="sm"
              disabled={actions.openMethodology === null}
              onClick={() => actions.openMethodology?.()}
            >
              {ru['header.methodology']}
            </Button>

            <SourcesButton sources={sources} onOpen={() => setSourcesOpen(true)} />

            <Button
              variant="primary"
              size="sm"
              disabled={refreshing}
              onClick={() => void refresh()}
            >
              {ru['header.refresh']}
            </Button>

            <ExtraToggle store={store} />

            {refreshing ? <Spinner label={ru['header.refreshing']} size="sm" /> : null}
          </div>
        </div>
      </header>

      <SourceBanners sources={sources} />

      <SourcesPanel
        open={sourcesOpen}
        sources={sources}
        refreshing={refreshing}
        snapshotId={snapshotId}
        builtAt={builtAt}
        recordCount={Object.keys(catalogIndex).length}
        store={store}
        onClose={() => setSourcesOpen(false)}
        onRetry={() => void refresh()}
        onOpenErrorLog={handleOpenErrorLog}
      />

      <Modal
        open={errorLogOpen}
        onClose={() => setErrorLogOpen(false)}
        title={ru['errors.title']}
        className="ui-modal--wide"
      >
        <ErrorLogView entries={errorLog} loading={errorLogLoading} onLoad={handleLoadErrorLog} />
      </Modal>
    </>
  );
}
