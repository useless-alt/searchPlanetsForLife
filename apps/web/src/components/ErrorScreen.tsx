import { ru } from '../i18n/ru';
import { Banner, Button, Glass } from './ui';

/**
 * Экран ошибки первой загрузки (задача 12, п. 10.1).
 *
 * Кнопка «Повторить обновление» запускает `POST /api/refresh` и возвращает
 * приложение к шагу опроса статуса. Оформление — задача 12a: баннер ошибки
 * и одна кнопка, без лишних данных (п. 11.2).
 */

/** Пропсы экрана ошибки. */
export interface ErrorScreenProps {
  /** Повторный запуск обновления каталога. */
  onRefresh: () => void;
}

/** Экран ошибки с кнопкой повторного обновления. */
export default function ErrorScreen({ onRefresh }: ErrorScreenProps) {
  return (
    <Glass as="section" className="app-screen" aria-labelledby="error-title">
      <h2 className="app-screen__title" id="error-title">
        {ru['error.title']}
      </h2>

      <Banner tone="error">{ru['error.description']}</Banner>

      <Button variant="primary" onClick={onRefresh}>
        {ru['error.retry']}
      </Button>
    </Glass>
  );
}
