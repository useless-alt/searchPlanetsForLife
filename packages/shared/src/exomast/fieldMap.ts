import { MJUP_IN_MEARTH, RJUP_IN_REARTH } from '../constants/units';
import type { RawParamKey } from '../types/planet';

/**
 * Таблица извлекаемых полей Exo.MAST (задача 9; задача 28, п. 7.3).
 *
 * Разово снятый ответ `GET exoplanets/wasp-12b/properties/?include_info=true`
 * (фикстура `apps/server/src/sources/fixtures/exomast-wasp-12b-info.json`)
 * не содержит отдельного блока описаний столбцов: ключи ответа совпадают
 * с ответом без `include_info`, а единицы приходят только в полях
 * `<ключ>_unit`. Поэтому в таблицу входят **только** поля, у которых
 * единица однозначно записана в самом ответе и совпадает с ожидаемой;
 * описание столбца взять неоткуда (U26, `docs/open-questions.md`).
 *
 * Единицы проекта — п. 1.4: R⊕, M⊕, R☉, M☉, а.е., сутки, К, пк, S⊕.
 *
 * Перечень (ключ → ожидаемая единица → поле единицы → множитель):
 * - `Teff` → `K` → `Teff_unit` → 1 (`st_teff`, К);
 * - `Rs` → `R_sun` → `Rs_unit` → 1 (`st_rad`, R☉);
 * - `Ms` → `M_sun` → `Ms_unit` → 1 (`st_mass`, M☉);
 * - `distance` → `pc` → `distance_unit` → 1 (`sy_dist`, пк);
 * - `Rp` → `R_Jupiter` → `Rp_unit` → 11.209 (`pl_rade`, R⊕);
 * - `Mp` → `M_Jupiter` → `Mp_unit` → 317.83 (`pl_bmasse`, M⊕);
 * - `Tp` → `K` → `Tp_unit` → 1 (`pl_eqt`, К);
 * - `orbital_period` → `d` → `orbital_period_unit` → 1 (`pl_orbper`, сутки);
 * - `orbital_distance` → `AU` → `orbital_distance_unit` → 1 (`pl_orbsmax`, а.е.);
 * - `eccentricity` → безразмерная → `eccentricity_unit` (пусто или null) → 1
 *   (`pl_orbeccen`).
 */
export interface ExoMastFieldSpec {
  /** Ключ значения в ответе Exo.MAST. */
  key: string;
  /** Ключ единицы измерения в ответе (`<key>_unit`). */
  unitKey: string;
  /** Ожидаемая единица измерения (как она записана в ответе). */
  unit: string;
  /** Множитель перевода в единицы проекта (п. 1.4). */
  multiplier: number;
  /** Источник единицы: поле `<key>_unit` того же ответа. */
  unitSource: string;
}

/** Логическое поле → ключ, единица и множитель перевода. */
export const EXOMAST_FIELD_MAP: Readonly<Record<string, ExoMastFieldSpec>> = {
  st_teff: {
    key: 'Teff',
    unitKey: 'Teff_unit',
    unit: 'K',
    multiplier: 1,
    unitSource: 'Teff_unit',
  },
  st_rad: {
    key: 'Rs',
    unitKey: 'Rs_unit',
    unit: 'R_sun',
    multiplier: 1,
    unitSource: 'Rs_unit',
  },
  st_mass: {
    key: 'Ms',
    unitKey: 'Ms_unit',
    unit: 'M_sun',
    multiplier: 1,
    unitSource: 'Ms_unit',
  },
  sy_dist: {
    key: 'distance',
    unitKey: 'distance_unit',
    unit: 'pc',
    multiplier: 1,
    unitSource: 'distance_unit',
  },
  pl_rade: {
    key: 'Rp',
    unitKey: 'Rp_unit',
    unit: 'R_Jupiter',
    multiplier: RJUP_IN_REARTH,
    unitSource: 'Rp_unit',
  },
  pl_bmasse: {
    key: 'Mp',
    unitKey: 'Mp_unit',
    unit: 'M_Jupiter',
    multiplier: MJUP_IN_MEARTH,
    unitSource: 'Mp_unit',
  },
  pl_eqt: {
    key: 'Tp',
    unitKey: 'Tp_unit',
    unit: 'K',
    multiplier: 1,
    unitSource: 'Tp_unit',
  },
  pl_orbper: {
    key: 'orbital_period',
    unitKey: 'orbital_period_unit',
    unit: 'd',
    multiplier: 1,
    unitSource: 'orbital_period_unit',
  },
  pl_orbsmax: {
    key: 'orbital_distance',
    unitKey: 'orbital_distance_unit',
    unit: 'AU',
    multiplier: 1,
    unitSource: 'orbital_distance_unit',
  },
  pl_orbeccen: {
    key: 'eccentricity',
    unitKey: 'eccentricity_unit',
    unit: '',
    multiplier: 1,
    unitSource: 'eccentricity_unit',
  },
};

/** Логические ключи таблицы (для проверок и карточки). */
export const EXOMAST_FIELD_KEYS: readonly RawParamKey[] = Object.keys(
  EXOMAST_FIELD_MAP,
) as RawParamKey[];
