/**
 * Реестр служебных данных (задача 18; п. 11.2, U12, U36, U37).
 *
 * Единственный список того, что скрыто по умолчанию и показывается режимом
 * «Показать дополнительные данные». Скрывать служебные данные иначе, чем
 * через `ExtraOnly` и запись этого реестра, нельзя: тест сверяет состав
 * реестра с `docs/extra-data.md`, а задачи 19 и 24–28 дополняют его.
 *
 * Расчёты и функции режим не меняет — он влияет только на видимость.
 */

/** Запись реестра: что скрыто, где и почему. */
export interface ExtraEntry {
  /** Идентификатор элемента; он же значение атрибута `data-extra`. */
  readonly id: string;
  /** Место в интерфейсе. */
  readonly where: string;
  /** Что именно скрыто и на какой пункт ТЗ ссылается запись. */
  readonly description: string;
}

/** Полный список скрываемых элементов. */
export const EXTRA_REGISTRY = [
  {
    id: 'header.counters',
    where: 'шапка',
    description: '«Всего в базе: N | Рассчитано: N₁ | В строго измеренных: N₂» (4.1)',
  },
  {
    id: 'table.delta',
    where: 'таблица',
    description:
      'колонка «Ранг и сдвиг» (Δ), также включается переключателем «Сравнить с упрощённым ESI» (U36)',
  },
  {
    id: 'table.qdata',
    where: 'таблица',
    description: 'колонка и бейджи Q_data (4.2)',
  },
  {
    id: 'table.sourcesCount',
    where: 'таблица',
    description: 'подпись «N ист.»',
  },
  {
    id: 'table.tagExo',
    where: 'таблица',
    description: 'тег «эксп.» (U37)',
  },
  {
    id: 'toolbar.qBadge',
    where: 'панель инструментов',
    description: 'бейдж порога Q_data, кроме случая qMin > 0.75 (активный фильтр скрывать нельзя)',
  },
  {
    id: 'scene.qdata',
    where: '3D-вьюпорт',
    description: 'бейдж Q_data в сцене (10.9.7)',
  },
  {
    id: 'map.unplaced',
    where: '3D-карта Галактики',
    description: 'подпись «Без координат: N» у планет без ra/dec/dist_pc (U44)',
  },
  {
    id: 'sources.technical',
    where: 'панель источников',
    description: 'технические подписи (идентификатор и время построения снимка, число записей)',
  },
  {
    id: 'card.qdata',
    where: 'карточка планеты',
    description: 'бейдж Q_data («Высокая / Средняя / Оценочная», 10.7)',
  },
  {
    id: 'card.alternatives',
    where: 'карточка планеты',
    description: 'альтернативные значения других источников под строкой параметра (10.7)',
  },
  {
    id: 'card.decomp.sub',
    where: 'карточка планеты',
    description: 'вложенные входы ESI_R, ESI_ρ и ESI_ve в декомпозиции режима RHI (10.7)',
  },
  {
    id: 'card.exomast.raw',
    where: 'карточка планеты',
    description: 'первые 200 ключей сырого ответа Exo.MAST (задача 28)',
  },
  {
    id: 'card.exomast.values',
    where: 'карточка планеты',
    description: 'значения Exo.MAST, отличающиеся от каталожных, в строке параметра (задача 28)',
  },
] as const satisfies readonly ExtraEntry[];

/** Идентификатор скрываемого элемента. */
export type ExtraId = (typeof EXTRA_REGISTRY)[number]['id'];

/** Идентификаторы всех записей реестра в порядке объявления. */
export const EXTRA_IDS: readonly ExtraId[] = EXTRA_REGISTRY.map((entry) => entry.id);

/** Проверяет, что строка — известный идентификатор реестра. */
export function isExtraId(value: string): value is ExtraId {
  return (EXTRA_IDS as readonly string[]).includes(value);
}

/** Запись реестра по идентификатору; `undefined` — записи нет. */
export function getExtraEntry(id: ExtraId): ExtraEntry | undefined {
  return EXTRA_REGISTRY.find((entry) => entry.id === id);
}
