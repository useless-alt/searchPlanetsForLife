import type { SourceRecord } from '@exo/shared';

/** Английские названия греческих букв для normalizeName (п. 7.2). */
const GREEK_NAMES: Readonly<Record<string, string>> = {
  α: 'alpha',
  β: 'beta',
  γ: 'gamma',
  δ: 'delta',
  ε: 'epsilon',
  ζ: 'zeta',
  η: 'eta',
  θ: 'theta',
  ι: 'iota',
  κ: 'kappa',
  λ: 'lambda',
  μ: 'mu',
  ν: 'nu',
  ξ: 'xi',
  ο: 'omicron',
  π: 'pi',
  ρ: 'rho',
  σ: 'sigma',
  ς: 'sigma',
  τ: 'tau',
  υ: 'upsilon',
  φ: 'phi',
  χ: 'chi',
  ψ: 'psi',
  ω: 'omega',
};

const COMBINING_MARKS = /\p{M}+/gu;
const GREEK_LETTERS = /[α-ως]/g;
const NON_ASCII_ALNUM = /[^a-z0-9]/g;

/**
 * Канонический ключ имени для сопоставления записей (п. 7.2).
 *
 * Unicode NFKD → удаление диакритики → нижний регистр → названия греческих
 * букв → удаление ведущих префиксов SIMBAD → только [a-z0-9].
 * Пустой результат означает отсутствие ключа и возвращается как null.
 */
export function normalizeName(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;

  let text = value.normalize('NFKD').replace(COMBINING_MARKS, '').toLowerCase();
  text = text.replace(GREEK_LETTERS, (letter) => GREEK_NAMES[letter] ?? letter);

  // Префиксы могут идти друг за другом: «NAME * V* …».
  let previous = '';
  while (previous !== text) {
    previous = text;
    text = text.replace(/^\s*\*{1,2}\s*/, '');
    text = text.replace(/^\s*v\*\s*/, '');
    text = text.replace(/^\s*name(?:\s+|$)/, '');
  }

  const normalized = text.replace(NON_ASCII_ALNUM, '');
  return normalized === '' ? null : normalized;
}

/** Канонический ключ буквы компонента; пустая строка и null → null (п. 7.2). */
export function normalizeLetter(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const normalized = value.toLowerCase().replace(NON_ASCII_ALNUM, '');
  return normalized === '' ? null : normalized;
}

/** Множество нормализованных имён планеты и её алиасов для R1. */
export function nameKeys(record: Pick<SourceRecord, 'planetName' | 'aliases'>): Set<string> {
  const keys = new Set<string>();
  const ownName = normalizeName(record.planetName);
  if (ownName !== null) keys.add(ownName);
  for (const alias of record.aliases) {
    const key = normalizeName(alias);
    if (key !== null) keys.add(key);
  }
  return keys;
}

/** Множество нормализованных имён хоста и его алиасов для R2 (п. 7.2). */
export function hostKeys(record: Pick<SourceRecord, 'hostname' | 'hostAliases'>): Set<string> {
  const keys = new Set<string>();
  const hostname = normalizeName(record.hostname);
  if (hostname !== null) keys.add(hostname);
  for (const alias of record.hostAliases) {
    const key = normalizeName(alias);
    if (key !== null) keys.add(key);
  }
  return keys;
}
