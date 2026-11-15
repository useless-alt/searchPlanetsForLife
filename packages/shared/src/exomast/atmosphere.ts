/**
 * Состав атмосферы из Exo.MAST (задача 28; п. 9.1, 9.3; U26, U52).
 *
 * Разовый ответ `include_info=true` (фикстура
 * `exomast-wasp-12b-info.json`) не содержит описаний столбцов, поэтому
 * ключей состава атмосферы, подтверждённых документацией архива, нет:
 * `EXOMAST_ATMOSPHERE_KEYS` пуст. Список остаётся явной точкой расширения —
 * как только описание столбцов появится, достаточно добавить ключи здесь,
 * и 3D-сцена (задача 25, `applyHints`) получит молекулы без правок логики.
 *
 * Пока ключей нет, `extractAtmosphere` возвращает пустой результат:
 * подсказки к отрисовке не применяются.
 */

/** Ключи ответа Exo.MAST с составом атмосферы (U26, U52). */
export const EXOMAST_ATMOSPHERE_KEYS: readonly string[] = [];

/** Символы Unicode-подстрочных цифр. */
const SUBSCRIPT_DIGITS: Record<string, string> = {
  '\u2080': '0',
  '\u2081': '1',
  '\u2082': '2',
  '\u2083': '3',
  '\u2084': '4',
  '\u2085': '5',
  '\u2086': '6',
  '\u2087': '7',
  '\u2088': '8',
  '\u2089': '9',
};

/** Результат разбора состава атмосферы. */
export interface ExoMastAtmosphere {
  /** Молекулы в виде `H2O`, `CH4`, `CO2`; повторов нет. */
  molecules: string[];
  /** Ключи ответа, в которых найдены молекулы. */
  keys: string[];
}

/** Частые формулы в каноническом виде (ключ — нижний регистр). */
const KNOWN_MOLECULES: Record<string, string> = {
  h2o: 'H2O',
  ch4: 'CH4',
  co2: 'CO2',
  co: 'CO',
  o2: 'O2',
  o3: 'O3',
  n2: 'N2',
  h2: 'H2',
  he: 'He',
  nh3: 'NH3',
  so2: 'SO2',
  hcn: 'HCN',
  tio: 'TiO',
  vo: 'VO',
  na: 'Na',
  k: 'K',
  fe: 'Fe',
  mg: 'Mg',
  sio: 'SiO',
  c2h2: 'C2H2',
  h2s: 'H2S',
  ch3oh: 'CH3OH',
};

/**
 * Приводит запись молекулы к каноническому виду `H2O` (задача 28, п. 7.3).
 *
 * Подстрочные цифры заменяются обычными. Для известных формул берётся
 * канонический регистр (`H2O`, `CH4`, `CO2`); для остальных — первая буква
 * заглавная, остальные строчные (`water` → `Water`).
 */
export function normalizeMoleculeName(value: string): string {
  const digits = value.replace(/[\u2080-\u2089]/g, (char) => SUBSCRIPT_DIGITS[char] ?? char);
  const compact = digits.replace(/\s+/g, '');
  const known = KNOWN_MOLECULES[compact.toLowerCase()];

  if (known !== undefined) return known;

  let result = '';
  let previousWasLetter = false;

  for (const char of compact) {
    if (/[A-Za-z]/.test(char)) {
      result += previousWasLetter ? char.toLowerCase() : char.toUpperCase();
      previousWasLetter = true;
    } else {
      result += char;
      previousWasLetter = false;
    }
  }

  return result;
}

/** Разбивает строку состава на отдельные записи. */
function splitMolecules(value: string): string[] {
  return value
    .split(/[,;|\s]+/)
    .map((item) => item.trim())
    .filter((item) => item !== '');
}

/**
 * Извлекает молекулы из выбранного словаря Exo.MAST.
 *
 * - значения-строки и массивы строк разбираются по `[,;|\s]+`;
 * - ключи сравниваются без учёта регистра;
 * - повторы удаляются, порядок сохраняется;
 * - пустой ключ или пустое значение ничего не добавляют.
 *
 * @param raw Выбранный словарь ответа Exo.MAST.
 * @param keys Ключи состава атмосферы; по умолчанию — проверенный список
 *   `EXOMAST_ATMOSPHERE_KEYS` (сейчас пуст, U26).
 */
export function extractAtmosphere(
  raw: Record<string, unknown>,
  keys: readonly string[] = EXOMAST_ATMOSPHERE_KEYS,
): ExoMastAtmosphere {
  const molecules: string[] = [];
  const foundKeys: string[] = [];
  const seen = new Set<string>();
  const wanted = keys.map((key) => key.toLowerCase());

  for (const [rawKey, rawValue] of Object.entries(raw)) {
    const index = wanted.indexOf(rawKey.toLowerCase());
    if (index < 0) continue;

    const values =
      typeof rawValue === 'string'
        ? [rawValue]
        : Array.isArray(rawValue)
          ? rawValue.filter((item): item is string => typeof item === 'string')
          : [];

    let found = false;

    for (const value of values) {
      for (const item of splitMolecules(value)) {
        const molecule = normalizeMoleculeName(item);
        if (molecule === '' || seen.has(molecule)) continue;

        seen.add(molecule);
        molecules.push(molecule);
        found = true;
      }
    }

    if (found) foundKeys.push(keys[index] ?? rawKey);
  }

  return { molecules, keys: foundKeys };
}
