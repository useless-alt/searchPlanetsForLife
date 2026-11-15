import { surfaceTemperature } from '../ranking/filters';
import type { ParamValue, Provenance, SourceId } from '../types/provenance';
import type { ResolvedPlanet } from '../types/solver';

/**
 * Объяснение происхождения параметра (задача 28; п. 4.3, 9.5, 10.1.4, 11.1).
 *
 * Для каждого расчетного значения карточки строится ответ на три вопроса:
 * откуда оно взялось, по какой формуле получено и насколько ему можно
 * доверять. Модуль чистый: только данные `ResolvedPlanet`, без React и DOM.
 */

/** Названия источников для диалога «Источник данных». */
export const SOURCE_NAMES: Record<SourceId, string> = {
  gaia: 'Gaia',
  exomast: 'Exo.MAST',
  nasa: 'NASA Exoplanet Archive',
  exoplanet_eu: 'Exoplanet.eu',
  simbad: 'SIMBAD',
  exomercat: 'Exo-MerCat',
};

/** Символы параметров для чипов панели реконструкции. */
export const PARAM_SYMBOLS: Record<string, string> = {
  R: 'R',
  M: 'M',
  e: 'e',
  d: 'd',
  P: 'P',
  S: 'S',
  T_eq: 'T_eq',
  T_s: 'T_s',
  rho: 'ρ',
  L: 'L',
  st_teff: 'T_eff',
  st_rad: 'R☉',
  st_mass: 'M☉',
  dist_pc: 'd',
};

/** Единицы параметров в единицах проекта (п. 1.4). */
export const PARAM_UNITS: Record<string, string> = {
  R: 'R⊕',
  M: 'M⊕',
  e: '',
  d: 'а.е.',
  P: 'дн',
  S: 'S⊕',
  T_eq: 'K',
  T_s: 'K',
  rho: 'г/см³',
  L: 'L☉',
  st_teff: 'K',
  st_rad: 'R☉',
  st_mass: 'M☉',
  dist_pc: 'пк',
};

/** Подписи параметров для диалога. */
export const PARAM_LABELS: Record<string, string> = {
  R: 'R — радиус планеты',
  M: 'M — масса планеты',
  e: 'e — эксцентриситет',
  d: 'd — большая полуось',
  P: 'P — период обращения',
  S: 'S — поток излучения',
  T_eq: 'T_eq — равновесная температура',
  T_s: 'T_s — температура поверхности',
  rho: 'ρ — средняя плотность',
  L: 'L — светимость звезды',
  st_teff: 'T_eff — температура звезды',
  st_rad: 'R☉ — радиус звезды',
  st_mass: 'M☉ — масса звезды',
  dist_pc: 'd — расстояние до системы',
};

/** Входные данные, показанные в объяснении. */
export interface ParamExplanationInput {
  /** Ключ параметра. */
  key: string;
  /** Подпись параметра. */
  label: string;
  /** Текущее значение; null — отсутствует. */
  value: number | null;
  /** Происхождение текущего значения. */
  provenance: Provenance | null;
}

/** Источник измеренного значения. */
export interface ParamExplanationSource {
  /** Идентификатор источника. */
  id: SourceId;
  /** Название источника. */
  name: string;
  /** Дата получения значения; null — неизвестна. */
  date: string | null;
  /** Значение пришло из резервной копии. */
  fromBackup: boolean;
}

/** Альтернативное значение другого источника. */
export interface ParamExplanationAlternative {
  /** Идентификатор источника. */
  source: SourceId;
  /** Значение в единицах проекта. */
  value: number;
  /** Дата получения значения; null — неизвестна. */
  date: string | null;
}

/** Полное объяснение одного параметра. */
export interface ParamExplanation {
  /** Ключ параметра. */
  key: string;
  /** Подпись параметра. */
  label: string;
  /** Значение; null — отсутствует. */
  value: number | null;
  /** Происхождение значения. */
  provenance: Provenance | null;
  /** Как получено значение; «Нет данных» при отсутствии. */
  how: string;
  /** Формула для моноширинного вывода; null — формулы нет. */
  formula: string | null;
  /** Оценка точности по уровню восстановления; null — нет значения. */
  accuracy: string | null;
  /** Входные значения расчёта с текущими значениями. */
  inputs: ParamExplanationInput[];
  /** Источник измеренного значения; null — значение не измерено. */
  source: ParamExplanationSource | null;
  /** Другие значения того же параметра. */
  alternatives: ParamExplanationAlternative[];
}

/** Описание формулы конкретного параметра. */
interface ParamRecipe {
  /** Пояснение «как получено». */
  how: string;
  /** Формула. */
  formula: string | null;
  /** Ключи входов. */
  inputs: readonly string[];
}

/** Формулы и входы параметров (задача 28, п. 7.3). */
const RECIPES: Record<string, ParamRecipe> = {
  L: {
    how: 'Закон Стефана — Больцмана: светимость звезды по её радиусу и температуре.',
    formula: 'L = R☉² · (T / 5772)⁴',
    inputs: ['st_rad', 'st_teff'],
  },
  d: {
    how: 'Третий закон Кеплера: расстояние по массе звезды и периоду обращения.',
    formula: 'd = (M☉ · (P / 365.25)²)^(1/3)',
    inputs: ['st_mass', 'P'],
  },
  P: {
    how: 'Третий закон Кеплера: период по расстоянию и массе звезды.',
    formula: 'P = 365.25 · √(d³ / M☉)',
    inputs: ['d', 'st_mass'],
  },
  S: {
    how: 'Поток излучения: светимость звезды, расстояние и эксцентриситет орбиты.',
    formula: 'S = L / (d² · √(1 − e²))',
    inputs: ['L', 'd', 'e'],
  },
  T_eq: {
    how: 'Равновесная температура из потока излучения.',
    formula: 'T_eq = 255 · S^0.25',
    inputs: ['S'],
  },
  T_s: {
    how: 'Температура поверхности: равновесная температура плюс парниковый сдвиг 33 K.',
    formula: 'T_s = T_eq + 33 K',
    inputs: ['T_eq'],
  },
  rho: {
    how: 'Средняя плотность по массе и радиусу планеты.',
    formula: 'ρ = 5.51 · M / R³',
    inputs: ['M', 'R'],
  },
  M: {
    how: 'Модель Чена — Киппинга: масса по радиусу планеты.',
    formula: 'M = R^3.58 при R < 1.23, иначе M = 1.43 · R^1.70',
    inputs: ['R'],
  },
  R: {
    how: 'Модель Чена — Киппинга: радиус по массе планеты.',
    formula: 'R = M^0.279 при M < 2.04, R = 0.81 · M^0.588 при 2.04 ≤ M < 132',
    inputs: ['M'],
  },
  e: {
    how: 'Эксцентриситет не измерен, принят равным 0.',
    formula: null,
    inputs: [],
  },
};

/** Точность по происхождению значения (задача 28, п. 7.3). */
const ACCURACY: Record<Provenance, string> = {
  measured: 'Измерено напрямую; точность указана в источнике',
  physics: 'Уровень А — погрешность менее 2%',
  model: 'Уровень Б — погрешность около 15–25%',
  estimate: 'Допущение, точность неизвестна',
};

/** Текст отсутствующего значения. */
export const NO_DATA_TEXT = 'Нет данных';

/** Значение параметра из `ResolvedPlanet`; T_s считается из T_eq. */
function readParam(planet: ResolvedPlanet, key: string): ParamValue | null {
  if (key === 'T_s') {
    const value = surfaceTemperature(planet.T_eq.value);

    if (value === null) return null;

    return {
      value,
      provenance: planet.T_eq.provenance,
      source: planet.T_eq.source,
      sourceDate: planet.T_eq.sourceDate,
      fromBackup: planet.T_eq.fromBackup,
      // Альтернативы T_eq пересчитываются тем же сдвигом, что и в таблице.
      alternatives: planet.T_eq.alternatives.map((alternative) => ({
        ...alternative,
        value: alternative.value + 33,
      })),
    };
  }

  const record = planet as unknown as Record<string, ParamValue | undefined>;
  return record[key] ?? null;
}

/** Подпись параметра; для неизвестного ключа возвращается сам ключ. */
function labelFor(key: string): string {
  return PARAM_LABELS[key] ?? key;
}

/** Входные данные рецепта с текущими значениями планеты. */
function inputsFor(planet: ResolvedPlanet, keys: readonly string[]): ParamExplanationInput[] {
  return keys.map((key) => {
    const param = readParam(planet, key);

    return {
      key,
      label: labelFor(key),
      value: param?.value ?? null,
      provenance: param?.provenance ?? null,
    };
  });
}

/**
 * Объясняет происхождение параметра.
 *
 * Для отсутствующего значения возвращается «Нет данных» и пустые поля;
 * для измеренного — источник, дата, признак резервной копии и альтернативы;
 * для расчётного — формула, точность и входные значения.
 *
 * @param key Ключ параметра (`R`, `M`, `T_s`, `L`, `st_teff`…).
 * @param resolved Разрешённая планета.
 */
export function explainParam(key: string, resolved: ResolvedPlanet): ParamExplanation {
  const param = readParam(resolved, key);
  const value = param?.value ?? null;
  const provenance = value === null ? null : (param?.provenance ?? null);
  const recipe = RECIPES[key];
  const base: ParamExplanation = {
    key,
    label: labelFor(key),
    value,
    provenance,
    how: NO_DATA_TEXT,
    formula: null,
    accuracy: null,
    inputs: [],
    source: null,
    alternatives: [],
  };

  if (provenance === null || param === null) return base;

  if (provenance === 'measured') {
    return {
      ...base,
      how: 'Измерено напрямую в каталоге.',
      accuracy: ACCURACY.measured,
      source:
        param.source === null
          ? null
          : {
              id: param.source,
              name: SOURCE_NAMES[param.source],
              date: param.sourceDate,
              fromBackup: param.fromBackup,
            },
      alternatives: param.alternatives.map((alternative) => ({
        source: alternative.source,
        value: alternative.value,
        date: alternative.sourceDate,
      })),
    };
  }

  if (recipe === undefined) {
    return {
      ...base,
      how: 'Значение восстановлено, формула не описана.',
      accuracy: ACCURACY[provenance],
    };
  }

  return {
    ...base,
    how: recipe.how,
    formula: recipe.formula,
    accuracy: ACCURACY[provenance],
    inputs: inputsFor(resolved, recipe.inputs),
  };
}
