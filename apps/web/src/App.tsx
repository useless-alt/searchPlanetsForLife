import { useEffect, useRef, useState } from 'react';
import { useStore } from 'zustand';

import ErrorScreen from './components/ErrorScreen';
import { Header } from './components/header/Header';
import { PlanetPanel } from './components/planet/PlanetPanel';
import { ReconstructionPanel } from './components/planet/ReconstructionPanel';
import { RefreshPlanetButton } from './components/planet/RefreshPlanetButton';
import { LinkFallbackDialog } from './components/share/LinkFallbackDialog';
import { TopTable } from './components/table/TopTable';
import { Toolbar } from './components/toolbar/Toolbar';
import { ToastHost, showToast } from './components/ui/Toast';
import LoadingScreen from './components/LoadingScreen';
import { TooltipProvider } from './help/TooltipProvider';
import { ru } from './i18n/ru';
import { useShareActions } from './share/useShareActions';
import type { InitialShare } from './share/initialShared';
import { registerSlot } from './slots';
import { appStore, type AppStore } from './state/store';
import { ViewportView } from './components/viewport/ViewportView';

/**
 * Корневой компонент приложения.
 *
 * Задача 12: каркас без оформления и без панелей функций (они появятся
 * в задачах 13–20). Компонент отвечает только за фазы загрузки:
 * `boot`/`loading` — экран источников, `error` — экран ошибки, `ready` —
 * краткая сводка загруженного каталога.
 *
 * Задача 12a: каркас собран на токенах (`styles/tokens.css`), добавлена
 * ссылка «к содержимому» — первая в порядке обхода с клавиатуры.
 *
 * Задача 13: сверху шапка (задача 13) с режимами, счётчиками, источниками
 * и обновлением; название приложения перенесено в шапку, поэтому в основной
 * части его больше нет.
 *
 * Задача 14: под шапкой панель инструментов с поиском и панелью
 * «Параметры модели» (13.2).
 *
 * Задача 16: вместо сводки загруженного каталога показывается таблица
 * Топ-50 (10.5): колонки, сортировка, теги и пустые состояния.
 *
 * Задача 17: приложение обёрнуто провайдером подсказок — все элементы с
 * `data-help-key` получают пояснение при наведении или фокусе.
 *
 * Задача 20: приложение подключает действия «CSV» и «Ссылка», очередь
 * уведомлений и восстановление выбранной планеты из ссылки.
 */

// 3D-холст регистрируется один раз на всё приложение (U40, задача 21).
registerSlot('viewport', ViewportView);
// Панель реконструкции и кнопка обновления — задача 28.
registerSlot('reconstruction', ReconstructionPanel);
registerSlot('refreshPlanet', RefreshPlanetButton);

/** Пропсы приложения. */
export interface AppProps {
  /** Хранилище; в тестах подставляется изолированный экземпляр. */
  store?: AppStore;
  /** Разобранная ссылка на состояние (задача 20). */
  initialShare?: InitialShare | null;
}

/** Корневой компонент. */
export default function App({ store = appStore, initialShare = null }: AppProps = {}) {
  const phase = useStore(store, (state) => state.phase);
  const sources = useStore(store, (state) => state.sources);
  const planetCardOpen = useStore(store, (state) => state.planetCardOpen);
  const catalogIndex = useStore(store, (state) => state.catalogIndex);
  const start = useStore(store, (state) => state.start);
  const refresh = useStore(store, (state) => state.refresh);
  const applyShared = useStore(store, (state) => state.applyShared);
  const selectPlanet = useStore(store, (state) => state.selectPlanet);
  const setPlanetCardOpen = useStore(store, (state) => state.setPlanetCardOpen);
  const { fallbackLink, closeFallback } = useShareActions(store);

  const [selectionApplied, setSelectionApplied] = useState(false);
  const shareApplied = useRef(false);

  // Состояние из ссылки попадает в хранилище до запуска первого пересчёта.
  // `main.tsx` делает то же до отрисовки; повторный вызов безвреден.
  useEffect(() => {
    if (shareApplied.current || initialShare === null) return;

    shareApplied.current = true;
    applyShared(initialShare.state);

    if (initialShare.versionMismatch) showToast(ru['share.versionMismatch']);
  }, [applyShared, initialShare]);

  useEffect(() => {
    void start();
  }, [start]);

  // Выбранная планета проверяется по каталогу: только после загрузки видно,
  // существует ли она (U45). Иначе показываем уведомление и не меняем выбор.
  useEffect(() => {
    if (initialShare === null || phase !== 'ready' || selectionApplied) return;

    setSelectionApplied(true);

    if (initialShare.planetId === null) return;

    if (catalogIndex[initialShare.planetId] !== undefined) {
      selectPlanet(initialShare.planetId);

      if (initialShare.openCard) setPlanetCardOpen(true);
    } else {
      showToast(ru['share.planetNotFound']);
    }
  }, [catalogIndex, initialShare, phase, selectPlanet, selectionApplied, setPlanetCardOpen]);

  return (
    <TooltipProvider store={store}>
      <div className="app-shell">
        {/* 27a: фон-космос под содержимым (U63). В 3D-сцену ничего не добавляется. */}
        <div className="space-bg" aria-hidden="true">
          <div className="space-bg__nebula" />
          <div className="space-bg__stars space-bg__stars--far" />
          <div className="space-bg__stars space-bg__stars--near" />
          <div className="space-bg__noise" />
        </div>

        <a className="app-skip-link" href="#app-main">
          {ru['app.skipToContent']}
        </a>

        <Header store={store} />

        <main className={`app-main${planetCardOpen ? ' app-main--with-panel' : ''}`} id="app-main">
          {(phase === 'boot' || phase === 'loading') && <LoadingScreen sources={sources} />}

          {phase === 'error' && <ErrorScreen onRefresh={() => void refresh()} />}

          {phase === 'ready' && (
            <>
              <Toolbar store={store} />
              <TopTable store={store} />
              <PlanetPanel store={store} />
            </>
          )}
        </main>

        <ToastHost />

        <LinkFallbackDialog
          open={fallbackLink !== null}
          link={fallbackLink ?? ''}
          onClose={closeFallback}
        />
      </div>
    </TooltipProvider>
  );
}
