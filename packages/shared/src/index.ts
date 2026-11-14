/**
 * @exo/shared — общий пакет монорепо.
 *
 * Чистый TypeScript без DOM и Node API: типы, константы, физика, индексы,
 * ранжирование (глобальный контекст, п. 1.3).
 *
 * Сейчас в пакете: доменные типы и каталог констант (задача 2),
 * физический решатель Уровней А/Б/В (задачи 3–4), формулы индексов
 * (задача 5), режимы, фильтры, сортировка и ранжирование Топ-50 (задача 6).
 */

export * from './types/index';
export * from './constants/index';
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
export * from './ranking/presets';
export * from './ranking/score';
export * from './ranking/filters';
export * from './ranking/sort';
export * from './ranking/ranking';
export * from './ranking/format';

export const SHARED_PACKAGE_READY = true;
