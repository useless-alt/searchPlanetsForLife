import { ru } from './i18n/ru';

/**
 * Корневой компонент приложения.
 *
 * TIER 1 (задача 1): только заголовок из словаря `ru`. Состав интерфейса
 * появляется в задачах 12–20.
 */
export default function App() {
  return (
    <main>
      <h1>{ru['app.title']}</h1>
    </main>
  );
}
