import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { parseSpectrum, SpectrumParseError, spectrumKind } from './spectraMeta';

const SAMPLE = readFileSync(
  fileURLToPath(
    new URL('../../../../apps/server/src/sources/fixtures/spectrum-sample.txt', import.meta.url),
  ),
  'utf8',
);

describe('parseSpectrum', () => {
  it('читает заголовок, строки данных, столбцы и диапазон первого столбца', () => {
    const meta = parseSpectrum(SAMPLE, 'WASP-12b_transmission_Kreidberg2015.txt');

    expect(meta.kind).toBe('transmission');
    expect(meta.headerLines).toHaveLength(3);
    expect(meta.headerLines[0]).toBe('WASP-12b transmission spectrum');
    expect(meta.headerLines[1]).toBe('This file contains:');
    expect(meta.dataLines).toBe(13);
    expect(meta.columns).toBe(4);
    expect(meta.firstColumnMin).toBeCloseTo(0.867, 9);
    expect(meta.firstColumnMax).toBeCloseTo(1.6315, 9);
  });

  it('тип определяется по имени файла без учёта регистра', () => {
    expect(spectrumKind('X_TRANSMISSION_2020.dat')).toBe('transmission');
    expect(spectrumKind('x-emission.txt')).toBe('emission');
    expect(spectrumKind('x-other.txt')).toBe('other');
  });

  it('бинарное содержимое — ошибка invalid_json', () => {
    const error = (() => {
      try {
        parseSpectrum('abc\u0000def', 'x.txt');
        return null;
      } catch (reason: unknown) {
        return reason;
      }
    })();

    expect(error).toBeInstanceOf(SpectrumParseError);
    expect((error as SpectrumParseError).reason).toBe('invalid_json');
  });

  it('разделители запятая, точка с запятой и табуляция поддерживаются', () => {
    const meta = parseSpectrum('# h\n1,2\n3;4\t5\nнет чисел\n', 'a.dat');

    expect(meta.headerLines).toEqual(['h']);
    expect(meta.dataLines).toBe(2);
    expect(meta.columns).toBe(3);
    expect(meta.firstColumnMin).toBe(1);
    expect(meta.firstColumnMax).toBe(3);
  });

  it('пустой файл даёт нулевые значения и null в диапазоне', () => {
    const meta = parseSpectrum('', 'empty.txt');

    expect(meta.headerLines).toEqual([]);
    expect(meta.dataLines).toBe(0);
    expect(meta.columns).toBe(0);
    expect(meta.firstColumnMin).toBeNull();
    expect(meta.firstColumnMax).toBeNull();
  });
});
