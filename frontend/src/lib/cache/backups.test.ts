// TEST FIXTURE: данные в этом файле используются только тестами.
import { describe, expect, it } from 'vitest';
import {
  keysToRotate,
  latestKey,
  makeStamp,
  shouldAcceptRecordCount,
  versionKey,
} from './backups';

describe('shouldAcceptRecordCount', () => {
  it('принимает первую копию', () => {
    expect(shouldAcceptRecordCount(0, 100)).toBe(true);
  });

  it('отклоняет пустой и нечисловой ответ', () => {
    expect(shouldAcceptRecordCount(100, 0)).toBe(false);
    expect(shouldAcceptRecordCount(100, Number.NaN)).toBe(false);
    expect(shouldAcceptRecordCount(100, -5)).toBe(false);
  });

  it('требует не меньше 50% предыдущего объёма', () => {
    expect(shouldAcceptRecordCount(1000, 500)).toBe(true);
    expect(shouldAcceptRecordCount(1000, 499)).toBe(false);
    expect(shouldAcceptRecordCount(1000, 1001)).toBe(true);
  });
});

describe('keysToRotate', () => {
  it('удаляет самые старые версии сверх лимита', () => {
    const keys = ['20260101_000000', '20260102_000000', '20260103_000000', '20260104_000000'];
    expect(keysToRotate(keys, 3)).toEqual(['20260101_000000']);
    expect(keysToRotate(keys, 5)).toEqual([]);
  });

  it('не мутирует входной массив', () => {
    const keys = ['b', 'a'];
    keysToRotate(keys, 1);
    expect(keys).toEqual(['b', 'a']);
  });

  it('всегда оставляет хотя бы одну версию', () => {
    expect(keysToRotate(['a', 'b'], 0)).toEqual(['a']);
  });
});

describe('ключи IndexedDB', () => {
  it('формирует latest и версионный ключи', () => {
    expect(latestKey('nasa')).toBe('backups/nasa/latest');
    expect(versionKey('nasa', '20260101_120000')).toBe('backups/nasa/20260101_120000');
  });

  it('makeStamp использует локальное время', () => {
    const stamp = makeStamp(new Date(2026, 0, 2, 3, 4, 5));
    expect(stamp).toBe('20260102_030405');
  });
});
