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
  'stub.caption': 'недостаточно данных для отрисовки',
  'badge.low': 'Низк.',
  'badge.extrapolated': 'ЗО: экстраполяция',
  'provenance.none': 'Нет данных',

  // Классы миров (задача 19; п. 9.3, U41).
  'world.earthlike': 'Землеподобный мир (океан + облака, 230–330 K)',
  'world.ice': 'Ледяной мир (ниже 230 K)',
  'world.desert': 'Пустынный мир (330–700 K)',
  'world.lava': 'Лавовый мир (700 K и выше)',
  'world.mini_neptune': 'Мини-нептун (1.65–6 R⊕)',
  'world.gas_giant': 'Газовый гигант (больше 6 R⊕)',
  'world.unknown': 'Класс не определён',

  // Карточка планеты (задача 19; п. 10.7, 13.5).
  'planet.backToMap': '← Карта Галактики',
  'planet.close': 'Закрыть',
  'planet.hint': 'Нажмите на звезду или планету для приближения',
  'planet.notInTop': 'Планета не входит в текущий Топ-50',
  'planet.viewport.empty': '3D-сцена появится после загрузки',
  'planet.params.title': 'Параметры',
  'planet.params.column': 'Параметр',
  'planet.params.value': 'Значение',
  'planet.star.title': 'Звезда',
  'planet.params.radius': 'R',
  'planet.params.mass': 'M',
  'planet.params.density': 'ρ',
  'planet.params.eccentricity': 'e',
  'planet.params.semiMajor': 'd',
  'planet.params.period': 'P',
  'planet.params.rotation': 'Вращение',
  'planet.rotation.locked':
    'Приливной захват: обращена к звезде одной стороной (оценка по периоду обращения и типу звезды)',
  'planet.rotation.assumed':
    'Условное вращение: {hours} ч (в каталогах нет данных о периоде вращения)',
  'planet.rotation.stub': 'Не определено',
  'planet.params.flux': 'S',
  'planet.params.tSurface': 'T_s',
  'planet.params.starTemp': 'T звезды',
  'planet.params.starRadius': 'R',
  'planet.params.starLuminosity': 'L',
  'planet.params.starMass': 'M',
  'planet.params.distance': 'd',
  'planet.origin.label': 'Происхождение',
  'planet.alternatives': 'Другие значения: {source} {value}',
  'planet.hz.title': 'Зона обитаемости',
  'planet.hz.bounds': 'Границы: {bounds}',
  'planet.hz.missing': 'Границы не рассчитаны: не хватает {list}',
  'planet.hz.missingStTeff': 'T звезды',
  'planet.hz.missingL': 'L☉',
  'planet.hz.missingD': 'd',
  'planet.hz.missingFallback': 'данных',
  'planet.hz.dIn': 'd_in',
  'planet.hz.dOut': 'd_out',
  'planet.hz.HZD': 'HZD',
  'planet.hz.F_HZ': 'F_HZ',
  'planet.decomp.title': 'Декомпозиция балла',
  'planet.decomp.notApplicable': 'Планета не оценивается в текущем режиме',
  'planet.decomp.columns.metric': 'Показатель',
  'planet.decomp.columns.value': 'Значение',
  'planet.decomp.columns.cumulative': 'Балл после применения',
  'planet.decomp.excluded': 'исключён',
  'planet.decomp.disabled': 'не учитывается',
  'planet.decomp.delta': '−{value} п.п.',
  'planet.decomp.row.ESI_R': 'ESI_R',
  'planet.decomp.row.ESI_rho': 'ESI_ρ',
  'planet.decomp.row.ESI_ve': 'ESI_ve',
  'planet.decomp.row.ESI_S': 'ESI_S',
  'planet.decomp.row.ESI_interior': 'ESI_interior',
  'planet.decomp.row.F_HZ': 'F_HZ',
  'planet.decomp.row.ESI4': 'ESI₄',
  'planet.decomp.row.base': 'Базовый балл',
  'planet.decomp.row.P_rocky': 'P_rocky',
  'planet.decomp.row.P_ecc': 'P_ecc',
  'planet.decomp.row.P_star': 'P_star',
  'planet.decomp.row.Q_data': 'Q_data',
  'planet.decomp.row.result': 'Итоговый индекс',
  'planet.action.showOnMap': 'Показать на карте',
  'planet.action.fly': 'Приблизить',
  'planet.action.noCoords': 'Нет координат',
  'planet.action.refresh': 'Обновить данные планеты',

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

  // --- 27a: меню «Ещё» (U66) ---
  'header.more': 'Ещё',

  // «Ссылка» на состояние (задача 20; 13.1, U45).
  'share.copied': 'Ссылка скопирована',
  'share.planetNotFound': 'Планета из ссылки не найдена',
  'share.versionMismatch': 'Ссылка создана в другой версии приложения',
  'share.fallback.title': 'Ссылка на состояние',
  'share.fallback.description':
    'Браузер не разрешил доступ к буферу обмена. Скопируйте ссылку вручную: текст уже выделен.',
  'share.fallback.label': 'Ссылка',
  'share.fallback.close': 'Закрыть',

  // Режим «Показать дополнительные данные» (задача 18; п. 11.2).
  'extra.toggle': 'Показать дополнительные данные',

  // Панель инструментов и поиск (задача 14; п. 13.2).
  'toolbar.label': 'Панель инструментов',
  'toolbar.filters': 'Фильтры',
  'toolbar.candidates': 'Показывать кандидатов',
  'toolbar.resetSettings': 'Сбросить настройки',
  'toolbar.resetFilters': 'Сбросить фильтры',
  'search.label': 'Поиск планеты или звезды…',
  'search.listLabel': 'Подсказки поиска',
  'search.found': 'Найдено: {count}',
  'search.outsideTop': 'вне Топ-50',

  // Таблица Топ-50 (задача 16; п. 4.2, 10.5, 10.6, 13.4).
  'table.title': 'Топ-50',
  'table.columns.rank': '№',
  'table.columns.delta': 'Δ',
  'table.columns.planet': 'Планета',
  'table.columns.index': 'Индекс',
  'table.columns.qdata': 'Q_data',
  'table.columns.radius': 'R [R⊕]',
  'table.columns.mass': 'M [M⊕]',
  'table.columns.tSurface': 'T_s [K]',
  'table.columns.eccentricity': 'e',
  'table.columns.spectralClass': 'Кл.',
  'table.columns.distance': 'd [пк]',
  'table.columns.action': 'Действие',
  'table.sources': '{count} ист.',
  'table.tag.lowReliability': 'Низк.',
  'table.tag.exo': 'эксп.',
  'table.q.high': 'Высокая',
  'table.q.medium': 'Средняя',
  'table.q.estimated': 'Оценочная',
  'table.q.label': '{level} {value}%',
  'table.insufficient': 'Недостаточно данных',
  'table.compareClassic': 'Сравнить с упрощённым ESI',
  'table.compareClassicNote': 'Режим совпадает с эталоном сравнения',
  'table.fly': 'Приблизить',
  'table.outsideTop': 'Выбранная планета {name} не входит в текущий Топ-50',
  'table.openCard': 'Открыть карточку',
  'table.empty.noMatch': 'Нет планет, подходящих под текущие настройки',
  'table.empty.noData': 'В режиме «{mode}» нет планет с достаточными данными',
  'table.empty.chooseMode': 'Выбрать другой режим',

  // Панель фильтров и «Земля (эталон)» (задача 15; п. 10.5, 13.3, U11, U35).
  'filters.title': 'Фильтры',
  'filters.spectralClass': 'Спектральный класс звезды',
  'filters.radius': 'Радиус планеты R [R⊕]',
  'filters.tSurface': 'Температура поверхности T_s [K]',
  'filters.e': 'Эксцентриситет орбиты e [0..1]',
  'filters.min': 'Мин',
  'filters.max': 'Макс',
  'filters.tsMinPlaceholder': 'напр., 230',
  'filters.tsMaxPlaceholder': 'напр., 330',
  'filters.apply': 'Применить фильтры',
  'filters.matching': 'Подходит планет: {matching} из {total}',
  'filters.empty': 'Ни одна планета не подходит. Ослабьте фильтры.',
  'filters.earth': 'Земля (эталон)',
  'filters.earth.reference': '1.00 R⊕ / 1.00 M⊕ / 288 K',
  'filters.earth.fHz': 'F_HZ = {value}',
  'filters.earth.optimisticNote': 'Эталонное значение 0.74 относится к оптимистичным границам',
  'filters.earth.share': 'Доля пройденных проверок: {share} %',
  'filters.earth.level': 'Уровень калибровки: {level}',
  'filters.calibration.high': 'Высокая',
  'filters.calibration.medium': 'Средняя',
  'filters.calibration.low': 'Оценочная',
  'filters.error.notNumber': 'Введите число',
  'filters.error.negative': 'Значение должно быть не меньше 0',
  'filters.error.eccentricity': 'Значение от 0 до 1',
  'filters.error.minAboveMax': 'Минимум больше максимума',

  // Панель «Параметры модели» (задача 14; п. 3.2, 4.1, 10.4).
  'params.button': 'Параметры модели',
  'params.title': 'Параметры модели',
  'params.penalties': 'Штрафы',
  'params.badgeQ': 'Q ≥ {value}%',
  'params.hzBounds': 'Границы зоны обитаемости',
  'params.hz.conservative': 'Консервативная',
  'params.hz.optimistic': 'Оптимистичная',
  'params.rocky': 'Отсекать мини-нептуны по разрыву Фултона (R > 1.65 R⊕)',
  'params.ecc': 'Учитывать штраф за эксцентриситет орбиты (1 − e²)',
  'params.star': 'Понижать рейтинг планет у красных карликов (T_eff < 3900 K)',
  'params.qdata': 'Учитывать коэффициент достоверности данных (Q_data)',
  'params.qMin': 'Минимальная достоверность Q_data',
  'params.qMinValue': '{value} %',
  'params.apply': 'Применить',
  'params.reset': 'Сбросить настройки',
  'params.disabledPenalties': 'В этом режиме штрафы не применяются',
  'params.disabledHz': 'В этом режиме зона обитаемости не используется',
  'params.close': 'Закрыть',

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
  'sources.technical': 'Снимок: {snapshot} · Собран: {date} · Записей: {count}',

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

  // 3D-карта Галактики (задача 21; п. 6, 10.8; U44).
  'map.earth': 'Земля',
  'map.scaleRing': '{value} пк',
  'map.loading': 'Загрузка карты…',
  'map.webglError': 'Не удалось запустить 3D-графику',
  'map.webglErrorHint': 'Метки Топ-50 доступны списком ниже.',
  'map.leadersList': 'Метки Топ-50',
  'map.overview': 'Обзор',
  'map.fly': 'Приблизить',
  'map.searchTooMany': 'Найдено {count}, слишком много для подсветки',
  'map.unplaced': 'Без координат: {count}',
  'map.line.index': 'Индекс: {value}',
  'map.line.params': 'R: {radius} R⊕ · T_s: {temp} K · d: {distance} пк · Кл. {spectral}',

  // 3D-сцена системы (задача 22; п. 9.1, 10.9; U38, U47).
  'scene.viewport': '3D-сцена',
  'scene.starUnavailable': 'Недостаточно данных звезды для выбора цели',
  'scene.detailError': 'Не удалось загрузить данные планеты',
  'scene.targetLabel': 'Цель приближения',
  'scene.planet': 'Планета',
  'scene.star': 'Звезда',
  'scene.scaleLabel': 'Масштаб',
  'scene.overviewMode': 'Обзорный',
  'scene.realMode': '1:1',
  'scene.orbit': 'Орбита',
  'scene.orbitMissing': 'Не хватает: большая полуось орбиты (нет периода или массы звезды)',
  'scene.orbitNominal': 'Расстояние до звезды неизвестно',
  'scene.hz': 'Зона обитаемости',
  'scene.hzUnavailable': 'Зона обитаемости не показана: {reason}',
  'scene.back': 'Назад',
  'scene.chooseAnother': 'Выбрать другую планету',
  'scene.flying': 'Перелёт…',
  'scene.overview': 'Обзор',
  'scene.nominalNote': 'Положение условное: расстояние до звезды неизвестно',
  'scene.nominalReason': 'Неизвестна большая полуось орбиты',
  'scene.nominalSizeReason': 'Размеры объектов неизвестны',
  'scene.nominalSizeNote': 'Режим 1:1 недоступен: размеры объектов неизвестны',
  'scene.starMissing': 'Не хватает: {list}',
  'scene.gap.stTeff': 'температура звезды',
  'scene.gap.starRadius': 'светимость или радиус звезды',
  'scene.gap.starFallback': 'данных звезды',
  'scene.layerUnavailable': 'Недостаточно данных для слоя',

  // Данные реконструкции и источники параметров (задача 28; 4.3, 9.5, 13.5).
  'reconstruction.title': 'Данные реконструкции',
  'reconstruction.showAll': 'Показать все параметры',
  'reconstruction.allMeasured': 'Все ключевые параметры измерены напрямую',
  'reconstruction.loading': 'Загрузка параметров…',
  'reconstruction.noValue': '—',
  'paramSource.close': 'Закрыть',
  'paramSource.value': 'Значение',
  'paramSource.origin': 'Происхождение',
  'paramSource.how': 'Как получено',
  'paramSource.accuracy': 'Точность',
  'paramSource.accuracyUnknown': 'Точность неизвестна',
  'paramSource.inputs': 'Входные данные',
  'paramSource.noInputs': 'Расчёт не использует других параметров',
  'paramSource.inputKey': 'Параметр',
  'paramSource.inputValue': 'Значение',
  'paramSource.inputOrigin': 'Происхождение',
  'paramSource.source': 'Источник',
  'paramSource.noSource': 'Значение восстановлено, измеренного источника нет',
  'paramSource.sourceValue': '{name}, {date}',
  'paramSource.noDate': 'дата неизвестна',
  'paramSource.fromBackup': ' · из резервной копии',
  'paramSource.alternatives': 'Другие значения',
  'paramSource.alternative': '{name}: {value} ({date})',
  'paramSource.noValue': '—',

  // Exo.MAST: статусы, атмосфера и спектры (задача 28; 7.3, 10.7.5).
  'exomast.title': 'Атмосфера и спектры',
  'exomast.status.idle': 'Данные Exo.MAST ещё не запрашивались',
  'exomast.status.loading': 'Загрузка данных Exo.MAST…',
  'exomast.status.updated': 'Данные Exo.MAST получены {date}',
  'exomast.status.backup': 'Используются сохранённые данные Exo.MAST от {date}',
  'exomast.status.errorWithProps':
    'Не удалось обновить Exo.MAST: {reason}. Используются ранее загруженные данные',
  'exomast.status.errorNoProps': 'Данные Exo.MAST недоступны: {reason}',
  'exomast.noDate': 'дата неизвестна',
  'exomast.atmosphere.value': 'Состав атмосферы: {molecules}',
  'exomast.atmosphere.none': 'В данных Exo.MAST нет сведений о составе атмосферы',
  'exomast.value': 'Exo.MAST: {value}',
  'exomast.toast.updated': 'Данные Exo.MAST обновлены',
  'exomast.reason.planetNotFound': 'планета не найдена в Exo.MAST',
  'exomast.reason.spectrumNotListed': 'файл отсутствует в списке спектров',
  'exomast.reason.unknown': 'неизвестная причина',
  'spectra.title': 'Спектры',
  'spectra.show': 'Показать сведения',
  'spectra.hide': 'Скрыть сведения',
  'spectra.loading': 'Загрузка сведений о спектре…',
  'spectra.error': 'Не удалось получить сведения о спектре',
  'spectra.dataLines': 'Строк данных',
  'spectra.columns': 'Столбцов',
  'spectra.firstColumn': 'Диапазон по первому столбцу',
  'spectra.header': 'Заголовок файла',
  'spectra.empty': 'Спектры для этой планеты не найдены',
  'spectra.notLoaded': 'Список спектров не получен',
  'spectra.noRange': '—',
  'spectra.type.transmission': 'Спектр пропускания',
  'spectra.type.emission': 'Спектр излучения',
  'spectra.type.other': 'Другой спектр',
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
