/**
 * Пользовательские строки приложения (глобальный контекст, п. 1.4).
 *
 * Все строки интерфейса хранятся здесь. Строки из ТЗ копируются дословно.
 */

import type { SourceId } from '@exo/shared';

export const ru = {
  'app.title': 'Топ-50 обитаемости экзопланет',
  'app.skipToContent': 'К содержимому',

  // Источники (п. 5, 5.1; глобальный контекст, п. 1.6).
  'source.gaia': 'Gaia',
  'source.exomast': 'Exo.MAST',
  'source.nasa': 'NASA Exoplanet Archive',
  'source.exoplanet_eu': 'Exoplanet.eu',
  'source.simbad': 'SIMBAD',
  'source.exomercat': 'Exo-MerCat',

  // Состояния источника (п. 8.3).
  'source.state.pending': 'Ожидание…',
  'source.state.updated': 'Обновлено',
  'source.state.backup': 'Используется резервная копия от {date}',
  'source.state.error_no_backup': 'Ошибка: резервной копии нет',

  // Экран загрузки (п. 10.1).
  'loading.title': 'Загрузка данных…',
  'loading.sourcesTitle': 'Источники',

  // Экран ошибки (п. 10.1).
  'error.title': 'Не удалось загрузить каталог',
  'error.description':
    'Сервер не вернул снимок каталога. Проверьте соединение и повторите обновление.',
  'error.retry': 'Повторить обновление',

  // Готовый каркас (оформление и панели — задачи 12a–20).
  'ready.title': 'Каталог загружен',
  'ready.summary': 'Строк в таблице: {shown}. Всего планет: {total}.',

  // Служебные строки библиотеки компонентов (задача 12a).
  'ui.close': 'Закрыть',
  'ui.loading': 'Загрузка…',
  'ui.sort.ascending': 'Сортировать по возрастанию',
  'ui.sort.descending': 'Сортировать по убыванию',

  // Происхождение значения (п. 4.3, 11.1; U15).
  'provenance.measured': 'Измерено',
  'provenance.physics': 'Физика',
  'provenance.model': 'Модель',
  'provenance.estimate': 'Оценка',

  // Бейджи карточки планеты и 3D-сцены (п. 10.8, 11.3).
  'badge.reconstructed': 'Реконструкция по расчётной модели',
  'badge.insufficient': 'Недостаточно данных для отрисовки',
  'badge.low': 'Низк.',
  'badge.extrapolated': 'ЗО: экстраполяция',

  // Пустое состояние (п. 10.4).
  'empty.title': 'Ни одной планеты',
  'empty.description': 'Ослабьте фильтры и сбросьте настройки.',

  // Шапка (задача 13; п. 4.1, 13.1).
  'header.counters':
    'Всего в базе: {total} | Рассчитано: {computed} | В строго измеренных: {strict}',
  'header.modeLabel': 'Режим расчёта',
  'header.overview': 'Обзор',
  'header.csv': 'CSV',
  'header.link': 'Ссылка',
  'header.methodology': 'Методика',
  'header.sources': 'Источники ({available}/{total} + MAST)',
  'header.refresh': 'Обновить данные',
  'header.refreshing': 'Обновляем каталог…',
  'header.planetBadge': 'Открыть карточку планеты {name}',

  // Панель источников (задача 13; п. 8.3, 10.10.4).
  'sources.title': 'Источники',
  'sources.retry': 'Повторить обновление',
  'sources.errorLog': 'Журнал ошибок',
  'sources.state.pending': 'Не запрашивался',
  'sources.state.pendingMast': 'Запрашивается при приближении к планете',
  'sources.mast.pending': 'Exo.MAST: не запрашивался',
  'sources.mast.updated': 'Exo.MAST: обновлён',
  'sources.mast.backup': 'Exo.MAST: используется резервная копия',
  'sources.mast.error_no_backup': 'Exo.MAST: ошибка, резервной копии нет',
  'sources.warning': 'Есть источники, которые не удалось обновить',

  // Баннеры источников (задача 13; п. 8.3, 10.1.8).
  'banner.source.backup': 'Не удалось обновить {source}. Используются резервные данные от {date}',
  'banner.source.error_no_backup': '{source}. Источник пропущен: резервной копии нет',

  // Журнал ошибок (задача 13; п. 8.2).
  'errors.title': 'Журнал ошибок',
  'errors.column.time': 'Время',
  'errors.column.source': 'Источник',
  'errors.column.reason': 'Причина',
  'errors.column.backup': 'Использованная копия',
  'errors.empty': 'Ошибок нет',
  'errors.noBackup': '—',
  'errors.reason.timeout': 'Превышено время ожидания',
  'errors.reason.dns_error': 'Не удалось подключиться к серверу',
  'errors.reason.http_4xx': 'Сервер отклонил запрос',
  'errors.reason.http_5xx': 'Ошибка на стороне сервера',
  'errors.reason.invalid_json': 'Получены некорректные данные',
  'errors.reason.empty': 'Источник вернул пустой ответ',
  'errors.reason.schema_mismatch': 'Структура данных не соответствует ожидаемой',
  'errors.reason.backup_write_failed': 'Не удалось сохранить резервную копию',
} as const;

/** Ключ строки в словаре `ru`. */
export type RuKey = keyof typeof ru;

/** Значение строки по ключу. */
export type RuString = (typeof ru)[RuKey];

/**
 * Ключи названий источников (п. 5, 5.1).
 *
 * Один словарь на экран загрузки, панель источников и баннеры: название
 * источника не должно расходиться между местами.
 */
export const SOURCE_NAME_KEYS: Record<SourceId, RuKey> = {
  gaia: 'source.gaia',
  exomast: 'source.exomast',
  nasa: 'source.nasa',
  exoplanet_eu: 'source.exoplanet_eu',
  simbad: 'source.simbad',
  exomercat: 'source.exomercat',
};

/**
 * Подставляет значения в шаблон вида `{name}`.
 *
 * Неизвестный ключ остаётся в строке как есть — так пропуск переменной
 * заметен сразу, а не превращается в «undefined».
 */
export function formatMessage(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = values[key];

    return value === undefined ? match : String(value);
  });
}
