import { describe, expect, it } from 'vitest';

import { makeParam, nullParam } from '../physics/provenance';
import type { ParamValue } from '../types/provenance';

import { hzAvailability, type HzAvailabilityDetail } from './hzAvailability';
import { makeScaleModel, type ScaleInput, type ScaleMode } from './scale';

/**
 * Тесты доступности слоя зоны обитаемости (задача 24; п. 11.4).
 *
 * Проверяется, что слой опирается на готовые `detail.hz` и честно сообщает,
 * каких величин не хватает; границы при этом не угадываются.
 */

/** Измеренное значение или null. */
function value(number: number | null): ParamValue {
  return number === null ? nullParam() : makeParam(number, 'measured');
}

/** Поля планеты для модели масштаба. */
function scaleInput(overrides: Partial<Record<keyof ScaleInput, number | null>> = {}): ScaleInput {
  return {
    R: value(overrides.R === undefined ? 1 : overrides.R),
    d: value(overrides.d === undefined ? 1 : overrides.d),
    e: value(overrides.e === undefined ? 0 : overrides.e),
    L: value(overrides.L === undefined ? 1 : overrides.L),
    st_rad: value(overrides.st_rad === undefined ? 1 : overrides.st_rad),
    st_teff: value(overrides.st_teff === undefined ? 5780 : overrides.st_teff),
  };
}

/** Деталь с готовыми границами 0.75…1.77 а.е. */
function detail(
  overrides: {
    hz?: { d_in: number; d_out: number } | null;
    st_teff?: number | null;
    L?: number | null;
    st_rad?: number | null;
    d?: number | null;
  } = {},
): HzAvailabilityDetail {
  return {
    hz: overrides.hz === undefined ? { d_in: 0.7504, d_out: 1.7678 } : overrides.hz,
    resolved: {
      st_teff: value(overrides.st_teff === undefined ? 5780 : overrides.st_teff),
      L: value(overrides.L === undefined ? 1 : overrides.L),
      st_rad: value(overrides.st_rad === undefined ? 1 : overrides.st_rad),
      d: value(overrides.d === undefined ? 1 : overrides.d),
    },
  };
}

/** Модель масштаба или ошибка, если она не строится. */
function scale(
  mode: ScaleMode,
  overrides: Partial<Record<keyof ScaleInput, number | null>> = {},
): NonNullable<ReturnType<typeof makeScaleModel>> {
  const model = makeScaleModel(scaleInput(overrides), mode);

  if (model === null) throw new Error('Модель масштаба не построена');

  return model;
}

describe('hzAvailability', () => {
  it('полный набор данных — зона доступна', () => {
    const result = hzAvailability(detail(), scale('overview'));

    expect(result.available).toBe(true);
    expect(result.missing).toEqual([]);
    expect(result.reason).toBeNull();
  });

  it('нет температуры звезды — причина называет температуру', () => {
    const result = hzAvailability(
      detail({ st_teff: null, hz: null }),
      scale('overview', { st_teff: null }),
    );

    expect(result.available).toBe(false);
    expect(result.missing).toContain('температура звезды');
    expect(result.reason).toContain('температура звезды');
  });

  it('нет светимости и радиуса звезды — причина называет светимость или радиус', () => {
    const result = hzAvailability(detail({ L: null, st_rad: null, hz: null }), {
      nominal: false,
    });

    expect(result.available).toBe(false);
    expect(result.missing).toContain('светимость или радиус звезды');
    expect(result.reason).toContain('светимость или радиус звезды');
  });

  it('нет большой полуоси — причина называет орбиту, масштаб условный', () => {
    const model = scale('overview', { d: null });
    const result = hzAvailability(detail({ d: null, hz: null }), model);

    expect(model.nominal).toBe(true);
    expect(result.available).toBe(false);
    expect(result.missing).toContain('большая полуось орбиты');
    expect(result.reason).toContain('большая полуось орбиты');
  });

  it('несколько пропусков перечислены через запятую', () => {
    const result = hzAvailability(detail({ st_teff: null, L: null, st_rad: null, hz: null }), {
      nominal: false,
    });

    expect(result.missing).toEqual(['температура звезды', 'светимость или радиус звезды']);
    expect(result.reason).toBe('Не хватает: температура звезды, светимость или радиус звезды');
  });

  it('d_out ≤ d_in (hz = null) — зона недоступна без выдуманных границ', () => {
    const result = hzAvailability(detail({ hz: null }), scale('overview'));

    expect(result.available).toBe(false);
    expect(result.reason).not.toBeNull();
    expect(result.reason).toContain('не рассчитаны');
  });

  it('условное расстояние делает зону недоступной даже при готовых границах', () => {
    const nominal = {
      ...scale('overview'),
      nominal: true,
    };
    const result = hzAvailability(detail(), nominal);

    expect(result.available).toBe(false);
    expect(result.missing).toContain('большая полуось орбиты');
  });
});
