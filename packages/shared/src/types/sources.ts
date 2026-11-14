import type { MergeStats, PlanetRecord, RawParamKey } from './planet';
import type { SourceId } from './provenance';

/**
 * Состояние источника данных (п. 8): обновлён, взят резерв, ошибка без резерва.
 */
export type SourceState = 'pending' | 'updated' | 'backup' | 'error_no_backup';

/** Статус одного источника для панели источников. */
export interface SourceStatus {
  /** Идентификатор источника. */
  source: SourceId;
  /** Текущее состояние источника. */
  state: SourceState;
  /** Дата и время резервной копии, если использовалась; иначе null. */
  backupAt: string | null;
  /** Сообщение об ошибке; null, если ошибки нет. */
  message: string | null;
}

/** Метаданные резервной копии источника (п. 8.1). */
export interface BackupMeta {
  /** Источник, к которому относится копия. */
  source: SourceId;
  /** Эндпоинт, из которого получены данные. */
  endpoint: string;
  /** Время получения данных (ISO 8601). */
  fetched_at: string;
  /** Число записей в копии. */
  record_count: number;
  /** Контрольная сумма содержимого. */
  checksum: string;
  /** Версия схемы данных. */
  schema_version: number;
}

/**
 * Причина неудачи получения данных источника (п. 8, задача 8).
 *
 * Значения перечисления используются и в журнале ошибок (п. 8.2),
 * и в статусе источника панели диагностики.
 */
export type FetchErrorReason =
  /** Превышено время ожидания ответа (AbortController). */
  | 'timeout'
  /** Отказ DNS или соединения (ENOTFOUND, ECONNREFUSED, EAI_AGAIN). */
  | 'dns_error'
  /** HTTP 4xx — запрос отклонён сервером. */
  | 'http_4xx'
  /** HTTP 5xx — ошибка на стороне сервера. */
  | 'http_5xx'
  /** Тело ответа не разбирается (не JSON, неизвестная форма). */
  | 'invalid_json'
  /** Ответ разобран, но строк нет. */
  | 'empty'
  /** В схеме источника нет обязательных колонок. */
  | 'schema_mismatch';

/**
 * Запись каталога источника — «сырой» черновик планеты (задача 8).
 *
 * Единицы внутри записи (п. 1.4): R, M — земные; `pl_orbsmax` — а.е.;
 * `pl_orbper` — сутки; `st_lum` — log10 солнечных; `sy_dist` — пк.
 *
 * Инварианты:
 * - `params` содержит только конечные числа; отсутствующие ключи опускаются;
 * - идентификаторы Gaia хранятся строками (никогда не проходят через `number`);
 * - `ra`/`dec` — градусы.
 */
export interface SourceRecord {
  /** Источник, из которого получена запись. */
  source: SourceId;
  /** Время получения данных (ISO 8601). */
  fetchedAt: string;
  /** Признак, что запись взята из резервной копии. */
  fromBackup: boolean;
  /** Имя планеты (обязательное: строка без имени пропускается). */
  planetName: string;
  /** Альтернативные имена планеты из каталога. */
  aliases: string[];
  /** Имя родительской звезды; null — если неизвестно. */
  hostname: string | null;
  /** Буква планеты у звезды (b..z); null — если не определена. */
  letter: string | null;
  /** Синонимы имени звезды (для кросс-сопоставления). */
  hostAliases: string[];
  /** Прямое восхождение [°]; null — если неизвестно. */
  ra: number | null;
  /** Склонение [°]; null — если неизвестно. */
  dec: number | null;
  /** Сырые параметры планеты и звезды в единицах п. 1.4. */
  params: Partial<Record<RawParamKey, number>>;
  /** Служебные поля источника (идентификаторы, статус). */
  extra: {
    /** Идентификатор Gaia DR3 (строка, без потерь точности). */
    gaiaDr3Id?: string;
    /** Идентификатор Gaia DR2 (строка, без потерь точности). */
    gaiaDr2Id?: string;
    /** Статус объекта в каталоге источника («confirmed», «candidate»…). */
    status?: string;
    /** Основной идентификатор объекта в Exo-MerCat. */
    mainId?: string;
  };
}

/**
 * Ключи звёздных параметров, которые дают Gaia и SIMBAD (задача 9).
 *
 * Имена совпадают с колонками каталогов (`st_teff`, `st_rad`, `st_mass`,
 * `st_lum`) и с вычисляемым расстоянием `sy_dist` (п. 1.4: пк).
 */
export type StarParamKey = 'st_teff' | 'st_rad' | 'st_mass' | 'st_lum' | 'sy_dist';

/**
 * Запись звёздного источника — Gaia или SIMBAD (задача 9, п. 5.1).
 *
 * Инварианты:
 * - `key.gaiaDr3Id` — строка (64-битный идентификатор Gaia не проходит
 *   через `number`: точность теряется);
 * - `params` содержит только конечные числа, отсутствующие ключи опускаются;
 * - `ra`/`dec` — градусы; `sy_dist` — пк; `st_lum` — log10(L/L☉).
 */
export interface StarRecord {
  /** Источник: `gaia` или `simbad`. */
  source: 'gaia' | 'simbad';
  /** Время получения данных (ISO 8601). */
  fetchedAt: string;
  /** Признак, что запись взята из резервной копии. */
  fromBackup: boolean;
  /** Ключ записи: по чему источник ищет звезду. */
  key: {
    /** Идентификатор Gaia DR3 (строка, без потерь точности). */
    gaiaDr3Id?: string;
    /** Исходное имя звезды, по которому шёл запрос (SIMBAD). */
    hostQuery?: string;
  };
  /** Основной идентификатор звезды в источнике; null — если неизвестен. */
  mainId: string | null;
  /** Альтернативные идентификаторы звезды (для кросс-матча). */
  aliases: string[];
  /** Прямое восхождение [°]; null — если неизвестно. */
  ra: number | null;
  /** Склонение [°]; null — если неизвестно. */
  dec: number | null;
  /** Звёздные параметры в единицах п. 1.4. */
  params: Partial<Record<StarParamKey, number>>;
  /** Служебные поля источника. */
  extra: {
    /** Спектральный тип (SIMBAD); null — если неизвестен. */
    spType?: string | null;
  };
}

/**
 * Свойства планеты из Exo.MAST (задача 9, п. 5.1; ленивый источник, 10.1.4).
 *
 * `raw` — выбранный словарь ответа без изменений (включая поля `_unit`,
 * `_ref`, `_url`), чтобы карточка могла показать источник каждого числа.
 * `extracted` — значения в единицах п. 1.4, отобранные по таблице
 * `EXOMAST_FIELD_MAP` адаптера Exo.MAST (ключ, единица, множитель перевода).
 */
export interface ExoMastProps {
  /** Идентификатор планеты (стабильный ID, U17). */
  planetId: string;
  /** Время получения данных (ISO 8601). */
  fetchedAt: string;
  /** Признак, что данные взяты из резервной копии. */
  fromBackup: boolean;
  /** Каталог-источник (`nexsci`, `exoplanets.org` иное); null — если не указан. */
  catalog: string | null;
  /** Выбранный словарь ответа без изменений. */
  raw: Record<string, unknown>;
  /** Извлечённые параметры в единицах п. 1.4. */
  extracted: Partial<Record<RawParamKey, number>>;
}

/**
 * Фаза жизненного цикла каталога (п. 10.1, 10.10).
 *
 * `loading` — идёт первая сборка, снимка ещё нет;
 * `ready` — снимок есть (в том числе во время повторного обновления);
 * `error` — первая сборка не удалась и снимка нет;
 * `idle` — сборка ещё не запускалась.
 */
export type PipelinePhase = 'idle' | 'loading' | 'ready' | 'error';

/** Ответ `GET /api/status` (задача 11, п. 10.1, 10.10). */
export interface StatusResponse {
  /** Фаза загрузки каталога. */
  phase: PipelinePhase;
  /** Идёт повторное обновление при наличии снимка. */
  refreshing: boolean;
  /** Время начала текущей (или последней) сборки; null — сборок не было. */
  startedAt: string | null;
  /** Время завершения последней сборки; null — сборка ещё не завершалась. */
  finishedAt: string | null;
  /** Статусы всех шести источников в порядке рангов. */
  sources: SourceStatus[];
  /** Есть ли готовый снимок каталога. */
  hasSnapshot: boolean;
}

/** Заголовок снимка каталога (задача 11). */
export interface CatalogSnapshotHeader {
  /** SHA-256 (hex) от JSON.stringify списка планет. */
  id: string;
  /** Время сборки снимка (ISO 8601). */
  builtAt: string;
  /** Число планет в снимке. */
  planetCount: number;
  /** Версия схемы резервных копий (`BACKUP_SCHEMA_VERSION`). */
  schemaVersion: number;
}

/** Ответ `GET /api/catalog` (задача 11). */
export interface CatalogResponse {
  /** Заголовок снимка. */
  snapshot: CatalogSnapshotHeader;
  /** Планеты после дедупликации и слияния. */
  planets: PlanetRecord[];
  /** Статусы источников на момент ответа. */
  sources: SourceStatus[];
  /** Статистика слияния. */
  stats: MergeStats;
}

/** Запись журнала ошибок (последние 50, п. 8). */
export interface ErrorLogEntry {
  /** Источник, на котором возникла ошибка. */
  source: SourceId;
  /** Время ошибки (ISO 8601). */
  time: string;
  /** Причина ошибки. */
  reason: string;
  /** Дата использованной резервной копии; null, если копии нет. */
  backupUsed: string | null;
}
