/**
 * Порядок отрисовки объектов 3D-сцены системы (задача 22; п. 9.1).
 *
 * Меньшее значение рисуется раньше. Орбита и зона обитаемости рисуются
 * поверх звезды и планеты, чтобы не исчезать за диском светила.
 */

/** Звезда. */
export const RENDER_ORDER_STAR = 0;

/** Планета. */
export const RENDER_ORDER_PLANET = 1;

/** Корона звезды (задача 25): сразу за диском, до планетных оболочек. */
export const RENDER_ORDER_CORONA = 1;

/** Атмосфера планеты (задача 25). */
export const RENDER_ORDER_ATMOSPHERE = 2;

/** Облака планеты (задача 25). */
export const RENDER_ORDER_CLOUDS = 3;

/** Зона обитаемости (задача 24). */
export const RENDER_ORDER_HZ = 5;

/** Орбита (задача 23). */
export const RENDER_ORDER_ORBIT = 10;

/** Короткие имена порядка отрисовки. */
export const star = RENDER_ORDER_STAR;
export const planet = RENDER_ORDER_PLANET;
export const corona = RENDER_ORDER_CORONA;
export const atmosphere = RENDER_ORDER_ATMOSPHERE;
export const clouds = RENDER_ORDER_CLOUDS;
export const hz = RENDER_ORDER_HZ;
export const orbit = RENDER_ORDER_ORBIT;

/** Порядок отрисовки по имени объекта. */
export const RENDER_ORDER = {
  star: RENDER_ORDER_STAR,
  planet: RENDER_ORDER_PLANET,
  corona: RENDER_ORDER_CORONA,
  atmosphere: RENDER_ORDER_ATMOSPHERE,
  clouds: RENDER_ORDER_CLOUDS,
  hz: RENDER_ORDER_HZ,
  orbit: RENDER_ORDER_ORBIT,
} as const;
