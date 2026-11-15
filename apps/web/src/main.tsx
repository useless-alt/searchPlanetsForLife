import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import App from './App';
import { takeInitialShared } from './share/initialShared';
import { appStore } from './state/store';
import './styles/global.css';

const container = document.getElementById('root');

if (!container) {
  throw new Error('Не найден корневой элемент #root в index.html');
}

// Ссылка на состояние разбирается до первого пересчёта: каталог считается
// один раз, уже с настройками, фильтрами и сортировкой из адреса (задача 20).
const initialShare = takeInitialShared();

if (initialShare !== null) {
  appStore.getState().applyShared(initialShare.state);
}

createRoot(container).render(
  <StrictMode>
    <App initialShare={initialShare} />
  </StrictMode>,
);
