/**
 * @exo/shared — общий пакет монорепо.
 *
 * Чистый TypeScript без DOM и Node API: типы, константы, физика, индексы,
 * ранжирование (глобальный контекст, п. 1.3).
 *
 * Сейчас в пакете: доменные типы и каталог констант (задача 2),
 * физический решатель Уровней А/Б/В (задачи 3–4), формулы индексов
 * (задача 5), режимы, фильтры, сортировка и ранжирование Топ-50 (задача 6),
 * нормализация поискового запроса (задача 14), эталонная запись
 * «Земля (эталон)» и шкала калибровки (задача 15; 13.3, U35),
 * экспорт CSV и переносимое состояние ссылки (задача 20; 13.1, U42, U45),
 * система координат 3D-карты Галактики и цвет звезды (задача 21; п. 6, U44),
 * математическое ядро 3D-сцены системы (задача 22; п. 9.1, 9.4, U46–U50),
 * кеплеровская геометрия орбиты (задача 23; п. 11.3, U46, U49),
 * доступность слоя зоны обитаемости (задача 24; п. 11.4),
 * процедурный вид звезды и миров (задача 25; п. 9.1, 9.3, U41, U51, U52),
 * ленивый Exo.MAST и объяснение происхождения параметров (задача 28; п. 4.3,
 * 7.3, 9.5, 10.1.4, 11.1; U26, U52).
 */

export * from './types/index';
export * from './constants/index';
export * from './exomast/atmosphere';
export * from './exomast/fieldMap';
export * from './exomast/spectraMeta';
export * from './physics/provenance';
export * from './physics/levelA';
export * from './physics/levelB';
export * from './physics/levelC';
export * from './physics/solver';
export * from './indices/esi';
export * from './indices/hz';
export * from './indices/penalties';
export * from './indices/quality';
export * from './indices/indexes';
export * from './indices/decomposition';
export * from './ranking/presets';
export * from './ranking/score';
export * from './ranking/filters';
export * from './ranking/sort';
export * from './ranking/ranking';
export * from './ranking/format';
export * from './text/searchKey';
export * from './world/index';
export * from './share/types';
export * from './share/encode';
export * from './share/decode';
export * from './export/csv';
export * from './export/fileName';
export * from './galaxy/frames';
export * from './galaxy/starColor';
export * from './scene/constants';
export * from './scene/starRadius';
export * from './scene/scale';
export * from './scene/cameraPlan';
export * from './scene/hzAvailability';
export * from './scene/orbitMath';
export * from './scene/renderOrder';

// --- 27a ---
export * from './testing/dataset';

export const SHARED_PACKAGE_READY = true;
