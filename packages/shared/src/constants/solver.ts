/**
 * Константы каскадного решателя пропусков (п. 1).
 */

/** Эффективная температура Солнца [К]. */
export const SUN_TEFF_K = 5772;

/** Суток в году. */
export const DAYS_PER_YEAR = 365.25;

/** Коэффициент равновесной температуры: T_eq = T_EQ_COEFF · S^0.25. */
export const T_EQ_COEFF = 255;

/** Добавка к равновесной температуре за сдвиг нулевой точки: T_s = T_eq + GREENHOUSE_DELTA_K. */
export const GREENHOUSE_DELTA_K = 33;

/** Плотность Земли [г/см³]. */
export const RHO_EARTH = 5.51;

/** Минимальное число доступных субиндексов k для полноценного расчёта. */
export const K_MIN = 3;

/**
 * Границы модели Чен — Киппинг (Уровень Б, п. 1; U5 в реестре решений).
 *
 *   R → M:  R < CHEN_R_BREAKPOINT → M = R^CHEN_R_LOW_EXPONENT;
 *           R ≥ CHEN_R_BREAKPOINT → M = CHEN_R_HIGH_COEFFICIENT · R^CHEN_R_HIGH_EXPONENT.
 *           Верхней границы для R нет: формула действует при всех R ≥ 1.23.
 *   M → R:  M < CHEN_M_BREAKPOINT → R = M^CHEN_M_LOW_EXPONENT;
 *           CHEN_M_BREAKPOINT ≤ M < CHEN_M_MAX → R = CHEN_M_HIGH_COEFFICIENT · M^CHEN_M_HIGH_EXPONENT;
 *           M ≥ CHEN_M_MAX → null (неопределён только этот случай).
 */

/** Граница радиуса между двумя ветвями закона R → M [R⊕]. */
export const CHEN_R_BREAKPOINT = 1.23;

/** Показатель степени в нижней ветви закона R → M. */
export const CHEN_R_LOW_EXPONENT = 3.58;

/** Коэффициент в верхней ветви закона R → M. */
export const CHEN_R_HIGH_COEFFICIENT = 1.43;

/** Показатель степени в верхней ветви закона R → M. */
export const CHEN_R_HIGH_EXPONENT = 1.7;

/** Граница массы между двумя ветвями закона M → R [M⊕]. */
export const CHEN_M_BREAKPOINT = 2.04;

/** Верхняя граница применимости закона M → R [M⊕]. */
export const CHEN_M_MAX = 132;

/** Показатель степени в нижней ветви закона M → R. */
export const CHEN_M_LOW_EXPONENT = 0.279;

/** Коэффициент в верхней ветви закона M → R. */
export const CHEN_M_HIGH_COEFFICIENT = 0.81;

/** Показатель степени в верхней ветви закона M → R. */
export const CHEN_M_HIGH_EXPONENT = 0.588;
