/** Нормализация имён и разбор обозначений планет. */

export function normName(value: string): string {
  return value
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '');
}

export function splitAliases(value: string | null | undefined): string[] {
  if (!value) return [];
  return value
    .split(/[,;|]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** Последняя одиночная строчная буква b..z — обозначение планеты. */
export function planetLetter(name: string): string | null {
  const trimmed = name.trim();
  const patterns = [/\s([b-z])$/i, /[-_]([b-z])$/i, /\)([b-z])$/i, /(\d)([b-z])$/i];
  for (const re of patterns) {
    const m = trimmed.match(re);
    if (m) return m[1].toLowerCase();
  }
  return null;
}

/** Имя звезды без хвоста-буквы планеты. */
export function hostKey(name: string): string {
  let base = name.trim();
  const letter = planetLetter(base);
  if (letter) {
    const idx = base.toLowerCase().lastIndexOf(letter);
    if (idx > 0) base = base.slice(0, idx).replace(/[\s\-_]+$/, '');
  }
  return normName(base);
}

/** Угловое расстояние между двумя координатами, угловые секунды. */
export function angularSeparationArcsec(
  ra1: number,
  dec1: number,
  ra2: number,
  dec2: number,
): number {
  const toRad = Math.PI / 180;
  const dRa = (ra1 - ra2) * toRad;
  const dDec = (dec1 - dec2) * toRad;
  const meanDec = ((dec1 + dec2) / 2) * toRad;
  const x = dRa * Math.cos(meanDec);
  const y = dDec;
  return Math.sqrt(x * x + y * y) / toRad * 3600;
}

export function planetId(index: number, primaryName: string): string {
  return `p${index}-${normName(primaryName).slice(0, 24)}`;
}
