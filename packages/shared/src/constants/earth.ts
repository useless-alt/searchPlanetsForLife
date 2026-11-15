import { makeParam, nullParam } from '../physics/provenance';
import type { PlanetRecord, RawParamKey } from '../types/planet';
import type { ParamValue } from '../types/provenance';

/**
 * Эталонная запись «Земля (эталон)» (задача 15; п. 13.3, U11, U35).
 *
 * Значения взяты из ТЗ и все помечены `measured`: эталон не восстанавливается
 * решателем и не зависит от каталога. `pl_insol`, `pl_eqt` и `st_lum`
 * намеренно отсутствуют — контрольные S, T_s и L должны получиться
 * из физических формул, а не быть подставленными.
 */

/** Измеренное значение эталонной записи. */
function measured(value: number): ParamValue {
  return makeParam(value, 'measured');
}

/**
 * Эталонная запись Земли для калибровки интерфейса.
 *
 * `R = 1 R⊕`, `M = 1 M⊕`, `d = 1 а.е.`, `P = 365.25 сут`, `e = 0.0167`,
 * `st_teff = 5772 K`, `st_rad = 1 R☉`, `st_mass = 1 M☉`.
 */
export const EARTH_REFERENCE_RECORD: PlanetRecord = {
  id: 'earth-reference',
  name: 'Земля (эталон)',
  aliases: [],
  hostname: 'Солнце',
  letter: null,
  hostAliases: [],
  sources: [],
  warnings: [],
  params: {
    pl_rade: measured(1),
    pl_bmasse: measured(1),
    pl_orbsmax: measured(1),
    pl_orbper: measured(365.25),
    pl_orbeccen: measured(0.0167),
    pl_insol: nullParam(),
    pl_eqt: nullParam(),
    st_teff: measured(5772),
    st_rad: measured(1),
    st_mass: measured(1),
    st_lum: nullParam(),
    sy_dist: nullParam(),
    ra: nullParam(),
    dec: nullParam(),
  } satisfies Record<RawParamKey, ParamValue>,
};

/** Эталонные значения, которые показывает диагностический блок (13.3). */
export const EARTH_REFERENCE_VALUES = {
  /** Радиус [R⊕]. */
  R: 1,
  /** Масса [M⊕]. */
  M: 1,
  /** Температура поверхности [К]. */
  T_s: 288,
} as const;
