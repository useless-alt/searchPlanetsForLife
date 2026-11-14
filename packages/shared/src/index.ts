/**
 * @exo/shared — общий пакет монорепо.
 *
 * Чистый TypeScript без DOM и Node API: типы, константы, физика, индексы,
 * ранжирование (глобальный контекст, п. 1.3).
 *
 * Сейчас в пакете: доменные типы и каталог констант (задача 2),
 * физический решатель Уровня А (задача 3).
 * Остальная вычислительная логика (Уровни Б/В, индексы, ранжирование)
 * добавляется в задачах 4–6.
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

export const SHARED_PACKAGE_READY = true;
