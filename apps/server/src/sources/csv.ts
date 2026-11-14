/**
 * Разбор CSV-ответов TAP (RFC 4180) — задача 8.
 *
 * Нужен как запасной путь для источников, которые не отдают JSON
 * (раздел «ПАРСЕР ОТВЕТОВ» ТЗ): кавычки, удвоенные кавычки `""`,
 * запятые и переводы строк внутри кавычек.
 *
 * Все значения остаются строками; пустая строка означает отсутствие
 * значения (`null`) — числа приводятся позже через `toNum`.
 */

/** Разобранная CSV-таблица: массив строк, каждая строка — массив полей. */
export type CsvTable = string[][];

/** Строка CSV как объект: имя колонки → значение (пустая строка → `null`). */
export type CsvRecord = Record<string, string | null>;

/**
 * Разбирает CSV-текст в таблицу строк.
 *
 * Поддерживаются: запятая-разделитель, CRLF и LF, кавычки с удвоением
 * `""` внутри, переводы строк внутри кавычек. Значение `null` невозможно:
 * на этом уровне все поля — строки.
 */
export function parseCsv(text: string): CsvTable {
  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: CsvTable = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let index = 0;

  const pushField = (): void => {
    row.push(field);
    field = '';
  };

  const pushRow = (): void => {
    pushField();
    rows.push(row);
    row = [];
  };

  while (index < source.length) {
    const char = source[index] as string;

    if (inQuotes) {
      if (char === '"') {
        if (source[index + 1] === '"') {
          field += '"';
          index += 2;
          continue;
        }
        inQuotes = false;
        index += 1;
        continue;
      }
      field += char;
      index += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      index += 1;
      continue;
    }
    if (char === ',') {
      pushField();
      index += 1;
      continue;
    }
    if (char === '\r' || char === '\n') {
      if (char === '\r' && source[index + 1] === '\n') index += 1;
      pushRow();
      index += 1;
      continue;
    }
    field += char;
    index += 1;
  }

  // Последняя строка без завершающего перевода строки.
  if (field !== '' || row.length > 0) pushRow();

  return rows;
}

/**
 * Разбирает CSV-текст в строки-объекты: первая строка — заголовок.
 *
 * Имена колонок приводятся к нижнему регистру (как и в JSON-ответах).
 * Пустое поле даёт `null`; недостающие поля — тоже `null`.
 */
export function parseCsvRows(text: string): CsvRecord[] {
  const table = parseCsv(text);
  const header = table[0];
  if (!header) return [];

  const names = header.map((name) => name.trim().toLowerCase());
  const records: CsvRecord[] = [];

  for (let index = 1; index < table.length; index += 1) {
    const values = table[index] as string[];
    if (values.length === 1 && (values[0] ?? '') === '') continue; // пустая строка в конце файла

    const record: CsvRecord = {};
    names.forEach((name, columnIndex) => {
      if (name === '') return;
      const value = values[columnIndex];
      record[name] = value === undefined || value === '' ? null : value;
    });
    records.push(record);
  }

  return records;
}
