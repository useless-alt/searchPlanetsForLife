/**
 * Системы координат 3D-карты Галактики (задача 21; п. 6.1, U44).
 *
 * Исходные данные каталогов — экваториальные координаты ICRS (ra, dec)
 * и расстояние `dist_pc` в парсеках. Точка карты строится один раз на снимок
 * каталога и дальше не пересчитывается (п. 6.1).
 *
 * Соглашения:
 * - галактические координаты: X — к центру Галактики, Y — к l = 90°,
 *   Z — к северному полюсу Галактики;
 * - сцена Three.js: ось Y направлена вверх, поэтому
 *   `(x, y, z)_scene = (x_gal, z_gal, -y_gal)`;
 * - 1 единица сцены = 1 парсек, Земля находится в начале координат.
 *
 * Функции чистые: при отсутствии или нефизичности любого входа возвращается
 * `null` — планета не размещается на карте (U44).
 */

/** Трёхмерный вектор сцены или галактических координат. */
export interface Vec3 {
  /** Координата X. */
  x: number;
  /** Координата Y. */
  y: number;
  /** Координата Z. */
  z: number;
}

/**
 * Матрица перехода ICRS → галактические координаты, по строкам.
 *
 * Стандартные коэффициенты преобразования (матрица Hipparcos/ICRS).
 */
const ICRS_TO_GALACTIC = [
  [-0.0548755604, -0.8734370902, -0.4838350155],
  [0.4941094279, -0.44482963, 0.7469822445],
  [-0.867666149, -0.1980763734, 0.4559837762],
] as const;

/** Градусы в радианы. */
function degreesToRadians(value: number): number {
  return (value * Math.PI) / 180;
}

/**
 * Переводит экваториальные координаты ICRS в галактические (п. 6.1, U44).
 *
 * @param raDeg Прямое восхождение [°]; null — координата неизвестна.
 * @param decDeg Склонение [°]; null — координата неизвестна.
 * @param distPc Расстояние до системы [пк]; null или `<= 0` — неизвестно.
 * @returns Галактический вектор в парсеках или null, если планета не размещается.
 */
export function icrsToGalactic(
  raDeg: number | null,
  decDeg: number | null,
  distPc: number | null,
): Vec3 | null {
  if (
    raDeg === null ||
    decDeg === null ||
    distPc === null ||
    !Number.isFinite(raDeg) ||
    !Number.isFinite(decDeg) ||
    !Number.isFinite(distPc) ||
    distPc <= 0
  ) {
    return null;
  }

  const ra = degreesToRadians(raDeg);
  const dec = degreesToRadians(decDeg);
  const cosDec = Math.cos(dec);

  // Вектор ICRS: направление на объект, умноженное на расстояние.
  const x = cosDec * Math.cos(ra) * distPc;
  const y = cosDec * Math.sin(ra) * distPc;
  const z = Math.sin(dec) * distPc;

  const rowX = ICRS_TO_GALACTIC[0];
  const rowY = ICRS_TO_GALACTIC[1];
  const rowZ = ICRS_TO_GALACTIC[2];

  return {
    x: rowX[0] * x + rowX[1] * y + rowX[2] * z,
    y: rowY[0] * x + rowY[1] * y + rowY[2] * z,
    z: rowZ[0] * x + rowZ[1] * y + rowZ[2] * z,
  };
}

/**
 * Переводит координаты ICRS сразу в систему сцены Three.js (п. 6.1, U44).
 *
 * Галактическая плоскость становится плоскостью XZ, ось Y смотрит вверх:
 * `(x, y, z)_scene = (x_gal, z_gal, -y_gal)`.
 *
 * @param raDeg Прямое восхождение [°]; null — координата неизвестна.
 * @param decDeg Склонение [°]; null — координата неизвестна.
 * @param distPc Расстояние до системы [пк]; null или `<= 0` — неизвестно.
 * @returns Позиция в сцене в парсерах или null, если планета не размещается.
 */
export function icrsToScene(
  raDeg: number | null,
  decDeg: number | null,
  distPc: number | null,
): Vec3 | null {
  const galactic = icrsToGalactic(raDeg, decDeg, distPc);

  if (galactic === null) return null;

  return { x: galactic.x, y: galactic.z, z: -galactic.y };
}
