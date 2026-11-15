import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import App from './App';
import { takeInitialShared } from './share/initialShared';
import { appStore } from './state/store';

// U64: шрифты самохостятся через @fontsource, кириллица обязательна.
// Два семейства на всё приложение: Manrope (текст и заголовки) и
// JetBrains Mono (числа). Никаких запросов к CDN.
import '@fontsource/manrope/cyrillic-400.css';
import '@fontsource/manrope/cyrillic-500.css';
import '@fontsource/manrope/latin-400.css';
import '@fontsource/manrope/latin-500.css';
import '@fontsource/jetbrains-mono/cyrillic-400.css';
import '@fontsource/jetbrains-mono/latin-400.css';

import './styles/global.css';

const container = document.getElementById('root');

if (!container) {
  throw new Error('Не найден корневой элемент #root в index.html');
}

// --- 31 ---
// Отладочный доступ e2e: только dev или сборка с VITE_E2E=1. Модуль
// подключается динамически, поэтому в обычную production-сборку не попадает.
if (import.meta.env.DEV || import.meta.env.VITE_E2E === '1') {
  void import('./debug/exoDebug').then(({ installExoDebug }) => installExoDebug());
}
// --- /31 ---

// Ссылка на состояние разбирается до первого пересчёта: каталог считается
// один раз, уже с настройками, фильтрами и сортировкой из адреса (задача 20).
const debugWorlds =
  import.meta.env.DEV && new URLSearchParams(window.location.search).get('debug') === 'worlds';

if (debugWorlds) {
  // Галерея миров — только dev-инструмент (задача 25); в production-сборку
  // этот модуль не попадает благодаря динамическому импорту.
  void import('./debug/WorldsGallery').then(({ WorldsGallery }) => {
    createRoot(container).render(
      <StrictMode>
        <WorldsGallery />
      </StrictMode>,
    );
  });
} else {
  const initialShare = takeInitialShared();

  if (initialShare !== null) {
    appStore.getState().applyShared(initialShare.state);
  }

  createRoot(container).render(
    <StrictMode>
      <App initialShare={initialShare} />
    </StrictMode>,
  );
}
