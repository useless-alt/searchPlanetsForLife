import { describe, expect, it } from 'vitest';

import type { ScoreBreakdown } from '../types/scoring';
import {
  CSV_BOM,
  CSV_DELIMITER,
  buildCsv,
  csvNumberCell,
  csvTextCell,
  type CsvMeta,
  type CsvRow,
} from './csv';
import { csvFileName } from './fileName';

/**
 * Тесты экспорта CSV (задача 20; 13.1, U42).
 *
 * Проверяются: состав и порядок колонок, BOM, экранирование, защита от
 * формул, полная точность чисел, пустые значения и имя файла.
 */

/** Разложение балла с предсказуемыми значениями. */
function score(overrides: Partial<ScoreBreakdown> = {}): ScoreBreakdown {
  return {
    mode: 'adaptive',
    ESI_R: 0.95,
    ESI_rho: 0.9,
    ESI_ve: 0.93,
    ESI_S: 0.88,
    ESI_T: 0.91,
    ESI_interior: 0.92,
    F_HZ: 0.85,
    HZD: 0.1,
    P_rocky: 1,
    P_ecc: 1,
    P_star: 1,
    Q_data: 0.96,
    index: 0.577,
    k: 4,
    n: 4,
    insufficient_data: false,
    T_s: 288,
    v_e: 1.1,
    ...overrides,
  };
}

/** Строка CSV с полным набором полей. */
function row(overrides: Partial<CsvRow> = {}): CsvRow {
  return {
    rank: 1,
    delta: 2,
    name: 'Планета',
    hostname: 'Звезда',
    score: score(),
    Q_data: 0.96,
    R: 1.02,
    M: 1,
    T_s: 288,
    e: 0.05,
    spectralClass: 'G',
    dist_pc: 12.3,
    provenance: { R: 'measured', M: 'physics', e: 'model' },
    insufficient: false,
    ...overrides,
  };
}

/** Настройки, попадающие в каждую строку. */
const META: CsvMeta = {
  mode: 'rhi',
  hzBounds: 'conservative',
  builtAt: '2026-11-14T09:00:00.000Z',
};

/** Ожидаемый порядок колонок из ТЗ (не импортируется из реализации). */
const EXPECTED_HEADERS = [
  'Ранг',
  'Сдвиг от упрощённого ESI',
  'Планета',
  'Система',
  'Индекс',
  'Q_data',
  'R [R⊕]',
  'M [M⊕]',
  'T_s [K]',
  'e',
  'Кл.',
  'd [пк]',
  'Происхождение R',
  'Происхождение M',
  'Происхождение e',
  'ESI недр',
  'F_HZ',
  'P_rocky',
  'P_ecc',
  'P_star',
  'Недостаточно данных',
  'Режим',
  'Границы зоны обитаемости',
  'Снимок данных',
];

/**
 * Разбирает CSV обратно в ячейки.
 *
 * Нужен, чтобы проверять значения, а не подстроки: экранирование кавычек,
 * разделителей и переводов строк восстанавливается символ в символ.
 */
function parseCsv(content: string): string[][] {
  const text = content.startsWith(CSV_BOM) ? content.slice(1) : content;
  const records: string[][] = [];
  let record: string[] = [];
  let field = '';
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index] ?? '';

    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }

      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === CSV_DELIMITER) {
      record.push(field);
      field = '';
    } else if (char === '\r' && text[index + 1] === '\n') {
      record.push(field);
      records.push(record);
      record = [];
      field = '';
      index += 1;
    } else {
      field += char;
    }
  }

  record.push(field);
  records.push(record);

  return records;
}

describe('buildCsv', () => {
  it('начинается с BOM и содержит все колонки в порядке ТЗ', () => {
    const csv = buildCsv([], META);

    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(parseCsv(csv)[0]).toEqual(EXPECTED_HEADERS);
  });

  it('экранирует запятую, кавычку и перевод строки', () => {
    const name = 'Планета, "Альфа"\nвторая строка';
    const csv = buildCsv([row({ name })], META);

    // В исходнике поле заключено в кавычки, внутренние кавычки удвоены.
    expect(csv).toContain('"Планета, ""Альфа""\nвторая строка"');
    expect(parseCsv(csv)[1]?.[2]).toBe(name);
  });

  it('защищает строковую формулу, но не числовой минус', () => {
    const csv = buildCsv([row({ name: '=SUM(A1)', delta: -5 })], META);
    const cells = parseCsv(csv)[1] ?? [];

    expect(cells[2]).toBe("'=SUM(A1)");
    expect(cells[1]).toBe('-5');
    expect(cells[1]?.startsWith("'")).toBe(false);
  });

  it('выводит пустую ячейку для null и нечисловых значений', () => {
    const csv = buildCsv(
      [
        row({
          M: null,
          delta: null,
          spectralClass: null,
          provenance: { R: null, M: null, e: null },
        }),
      ],
      META,
    );
    const cells = parseCsv(csv)[1] ?? [];

    expect(cells[1]).toBe('');
    expect(cells[7]).toBe('');
    expect(cells[10]).toBe('');
    expect(cells[12]).toBe('');
    expect(cells[13]).toBe('');
    expect(cells[14]).toBe('');
    expect(csvNumberCell(Number.NaN)).toBe('');
  });

  it('не усекает число до значимых цифр', () => {
    const precise = 0.30000000000000004;
    const csv = buildCsv([row({ R: precise })], META);

    expect(parseCsv(csv)[1]?.[6]).toBe(String(precise));
    expect(csvNumberCell(precise)).toBe(String(precise));
  });

  it('пишет по одной строке на строку таблицы в том же порядке', () => {
    const csv = buildCsv([row({ name: 'Первая' }), row({ name: 'Вторая' })], META);
    const records = parseCsv(csv);

    expect(records.length).toBe(3);
    expect(records[1]?.[2]).toBe('Первая');
    expect(records[2]?.[2]).toBe('Вторая');
  });

  it('не зависит от переключателя «Показать дополнительные данные»', () => {
    const rows = [row()];
    const withExtra = { ...META, showExtraData: true } as CsvMeta & { showExtraData: boolean };

    expect(buildCsv(rows, withExtra)).toBe(buildCsv(rows, META));
  });

  it('выводит русские названия происхождения и подписи режима', () => {
    const cells = parseCsv(buildCsv([row()], META))[1] ?? [];

    expect(cells[12]).toBe('Измерено');
    expect(cells[13]).toBe('Физика');
    expect(cells[14]).toBe('Модель');
    expect(cells[20]).toBe('нет');
    expect(cells[21]).toBe('RHI');
    expect(cells[22]).toBe('Консервативная');
    expect(cells[23]).toBe(META.builtAt);
  });

  it('защищает текстовые ячейки с недопустимым началом', () => {
    expect(csvTextCell('=1+1')).toBe("'=1+1");
    expect(csvTextCell('+7')).toBe("'+7");
    expect(csvTextCell('-7')).toBe("'-7");
    expect(csvTextCell('@cmd')).toBe("'@cmd");
    expect(csvTextCell('\tтекст')).toBe("'\tтекст");
    expect(csvTextCell('обычное')).toBe('обычное');
    expect(csvTextCell(null)).toBe('');
  });
});

describe('csvFileName', () => {
  it('собирает имя из режима и локальной даты', () => {
    expect(csvFileName('rhi', new Date(2026, 10, 14))).toBe('top50_rhi_2026-11-14.csv');
  });
});
