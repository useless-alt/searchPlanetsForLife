import { useEffect } from 'react';
import { useStore } from 'zustand';

import ErrorScreen from './components/ErrorScreen';
import { Header } from './components/header/Header';
import LoadingScreen from './components/LoadingScreen';
import { formatMessage, ru } from './i18n/ru';
import { appStore, type AppStore } from './state/store';

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
 */

/** Пропсы приложения. */
export interface AppProps {
  /** Хранилище; в тестах подставляется изолированный экземпляр. */
  store?: AppStore;
}

/** Корневой компонент. */
export default function App({ store = appStore }: AppProps = {}) {
  const phase = useStore(store, (state) => state.phase);
  const sources = useStore(store, (state) => state.sources);
  const rows = useStore(store, (state) => state.rows);
  const counters = useStore(store, (state) => state.counters);
  const start = useStore(store, (state) => state.start);
  const refresh = useStore(store, (state) => state.refresh);

  useEffect(() => {
    void start();
  }, [start]);

  return (
    <div className="app-shell">
      <a className="app-skip-link" href="#app-main">
        {ru['app.skipToContent']}
      </a>

      <Header store={store} />

      <main className="app-main" id="app-main">
        {(phase === 'boot' || phase === 'loading') && <LoadingScreen sources={sources} />}

        {phase === 'error' && <ErrorScreen onRefresh={() => void refresh()} />}

        {phase === 'ready' && (
          <section className="app-screen" aria-labelledby="ready-title">
            <h2 className="app-screen__title" id="ready-title">
              {ru['ready.title']}
            </h2>
            <p className="app-screen__text">
              {formatMessage(ru['ready.summary'], {
                shown: rows.length,
                total: counters?.total ?? 0,
              })}
            </p>
          </section>
        )}
      </main>
    </div>
  );
}
