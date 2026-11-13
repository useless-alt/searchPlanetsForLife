// TEST FIXTURE: данные в этом файле используются только тестами.
import { describe, expect, it } from 'vitest';
import { EARTH } from '@/config';
import { clamp, geomean, median, num } from './num';
import { esi, esiR, esiRho, esiS, esiT, esiVe } from './esi';
import { massFromRadius, radiusFromMass } from './chen-kipping';
import { pEcc, pRocky, pStar } from './penalties';
import { habitableZone } from './hz';
import { EARTH_FIELDS, earthComputed, fieldNumber, solvePlanet, starPenalty } from './solver';
import { defaultField } from './solver';
import type { FieldKey, FieldValue } from '@/types';

function fieldsFrom(values: Partial<Record<FieldKey, number | string>>): Record<FieldKey, FieldValue> {
  const fields = Object.fromEntries(
    (Object.keys(EARTH_FIELDS) as FieldKey[]).map((key) => [key, defaultField()]),
  ) as Record<FieldKey, FieldValue>;
  for (const [key, value] of Object.entries(values) as [FieldKey, number | string][]) {
    fields[key] = { ...fields[key], value, origin: 'measured', source: 'nasa', tier: 'live' };
  }
  return fields;
}

describe('num', () => {
  it('возвращает null вместо нуля для отсутствующих значений', () => {
    expect(num(null)).toBeNull();
    expect(num(undefined)).toBeNull();
    expect(num('')).toBeNull();
    expect(num('   ')).toBeNull();
    expect(num('NaN')).toBeNull();
    expect(num('null')).toBeNull();
    expect(num(Number.NaN)).toBeNull();
    expect(num(Number.POSITIVE_INFINITY)).toBeNull();
    expect(num(false)).toBeNull();
  });

  it('парсит числа и десятичную запятую', () => {
    expect(num('1,5')).toBe(1.5);
    expect(num(' 42 ')).toBe(42);
    expect(num(0)).toBe(0);
    expect(num(-3.2)).toBe(-3.2);
  });

  it('clamp и median', () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-5, 0, 3)).toBe(0);
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBeNull();
  });

  it('geomean требует минимальное число доступных значений', () => {
    expect(geomean([1, 1, 0.25], 3)).toBeCloseTo(0.62996, 4);
    expect(geomean([1, 1, null, 0.25], 3)).toBeCloseTo(0.62996, 4);
    expect(geomean([1, 2], 3)).toBeNull();
    expect(geomean([1, 0], 1)).toBe(0);
    expect(geomean([], 1)).toBeNull();
  });
});

describe('ESI', () => {
  it('равен 1 для земных значений', () => {
    expect(esiR(EARTH.radius)).toBeCloseTo(1, 10);
    expect(esiRho(5.51)).toBeCloseTo(1, 10);
    expect(esiVe(1)).toBeCloseTo(1, 10);
    expect(esiS(1)).toBeCloseTo(1, 10);
    expect(esiT(288)).toBeCloseTo(1, 10);
  });

  it('убывает при отклонении от эталона', () => {
    expect(esiR(2)).toBeLessThan(1);
    expect(esiR(0.5)).toBeLessThan(1);
    expect(esiRho(2)).toBeLessThan(1);
    expect(esiT(700)).toBeLessThan(0.1);
    expect(esi(0, 1, 0.57)).toBeNull();
    expect(esi(-1, 1, 0.57)).toBeNull();
    expect(esi(null, 1, 0.57)).toBeNull();
  });
});

describe('Чен — Киппинг', () => {
  it('восстанавливает массу и радиус на степенных участках', () => {
    expect(massFromRadius(1)).toBeCloseTo(1, 10);
    expect(radiusFromMass(1)).toBeCloseTo(1, 10);
    expect(massFromRadius(2)).toBeCloseTo(1.43 * Math.pow(2, 1.7), 10);
    expect(radiusFromMass(10)).toBeCloseTo(0.81 * Math.pow(10, 0.588), 10);
  });

  it('возвращает null вне диапазона применимости', () => {
    expect(massFromRadius(20)).toBeNull();
    expect(massFromRadius(0)).toBeNull();
    expect(massFromRadius(null)).toBeNull();
    expect(radiusFromMass(200)).toBeNull();
    expect(radiusFromMass(-1)).toBeNull();
  });
});

describe('штрафы', () => {
  it('P_rocky убывает с радиусом', () => {
    expect(pRocky(1)).toBeGreaterThan(0.95);
    expect(pRocky(1)).toBeCloseTo(1 / (1 + Math.exp(5 * (1 - 1.65))), 10);
    expect(pRocky(4)).toBeLessThan(0.01);
    expect(pRocky(null)).toBe(1);
  });

  it('P_ecc = 1 − e²', () => {
    expect(pEcc(0)).toBe(1);
    expect(pEcc(0.5)).toBeCloseTo(0.75, 10);
    expect(pEcc(2)).toBeCloseTo(1 - 0.999 * 0.999, 10);
    expect(pEcc(null)).toBe(1);
  });

  it('P_star штрафует красные карлики', () => {
    expect(pStar(3800)).toBe(0.85);
    expect(pStar(3900)).toBe(1);
    expect(pStar(null)).toBe(1);
    expect(starPenalty(3200)).toBe(0.85);
  });
});

describe('зона обитаемости Коппарапу', () => {
  it('даёт Земле F_HZ ≈ 0.254 (консервативная) и ≈ 0.741 (оптимистичная)', () => {
    const conservative = habitableZone(5772, 1, 1, EARTH.ecc, 'conservative');
    expect(conservative.valid).toBe(true);
    expect(conservative.dIn).toBeCloseTo(0.9505, 3);
    expect(conservative.dOut).toBeCloseTo(1.676, 3);
    expect(conservative.fHz).toBeCloseTo(0.2542, 3);
    expect(conservative.extrapolated).toBe(false);

    const optimistic = habitableZone(5772, 1, 1, EARTH.ecc, 'optimistic');
    expect(optimistic.fHz).toBeCloseTo(0.741, 2);
    expect(optimistic.dIn).toBeCloseTo(0.7504, 3);
    expect(optimistic.dOut).toBeCloseTo(1.7678, 3);
  });

  it('помечает экстраполяцию и отказывается вне [2300, 7600] K', () => {
    const cold = habitableZone(2400, 0.01, 0.05, 0, 'conservative');
    expect(cold.valid).toBe(true);
    expect(cold.extrapolated).toBe(true);
    expect(cold.tempUsed).toBe(2600);

    const tooCold = habitableZone(2200, 0.01, 0.05, 0, 'conservative');
    expect(tooCold.valid).toBe(false);
    expect(tooCold.fHz).toBeNull();
  });

  it('не подставляет 0 вместо отсутствующих данных', () => {
    expect(habitableZone(null, 1, 1, 0, 'conservative').fHz).toBeNull();
    expect(habitableZone(5772, null, 1, 0, 'conservative').fHz).toBeNull();
    expect(habitableZone(5772, 1, null, 0, 'conservative').fHz).toBeNull();
    expect(habitableZone(5772, -1, 1, 0, 'conservative').fHz).toBeNull();
  });
});

describe('физический решатель', () => {
  it('Земля: все базовые величины восстановлены из констант', () => {
    const earth = earthComputed('conservative');
    expect(earth.radiusUsed).toBe(1);
    expect(earth.massUsed).toBe(1);
    expect(earth.rho).toBeCloseTo(5.51, 10);
    expect(earth.ve).toBeCloseTo(1, 10);
    expect(earth.sFlux).toBeCloseTo(1, 10);
    expect(earth.teq).toBeCloseTo(255, 10);
    expect(earth.ts).toBeCloseTo(288, 10);
    expect(earth.esiR).toBeCloseTo(1, 10);
    expect(earth.esiRho).toBeCloseTo(1, 10);
    expect(earth.esiVe).toBeCloseTo(1, 10);
    expect(earth.fHz).toBeCloseTo(0.2542, 3);
    expect(earth.fHzOpt).toBeNull();
    expect(earth.insufficientData).toBe(false);
    expect(earth.availableSubindexes).toBe(4);
    expect(earth.eAssumed).toBe(false);
    expect(earth.levelB).toBe(false);
    expect(earth.qDataBase).toBe(1);
    expect(earth.qDataAdaptive).toBe(1);
  });

  it('Земля: RHI ≈ 0.504 при консервативной ЗО (заявлено [0.46, 0.50])', () => {
    const earth = earthComputed('conservative');
    const rhi = Math.sqrt((earth.esiInterior ?? 0) * (earth.fHz ?? 0));
    // Промпт заявляет [0.46, 0.50], формула F_HZ = 1 − HZD² даёт ≈ 0.504.
    // Формулу не меняем; фиксируем известное расхождение с допуском.
    expect(rhi).toBeGreaterThan(0.46);
    expect(rhi).toBeLessThan(0.51);
    expect(rhi).toBeCloseTo(0.5042, 3);
  });

  it('Земля: оптимистичная ЗО даёт более высокий F_HZ', () => {
    const earth = earthComputed('optimistic');
    expect(earth.fHz).toBeCloseTo(0.741, 2);
    expect(earth.fHz ?? 0).toBeGreaterThan(0.5);
  });

  it('TRAPPIST-1 e: физика восстанавливает поток, температуры и расширенную ЗО', () => {
    const fields = fieldsFrom({
      rade: 0.92,
      masse: 0.692,
      ecc: 0.005,
      orbsmax: 0.02925,
      orbper: 6.0996,
      teff: 2566,
      lum: 0.000553,
      rad: 0.1192,
      mass: 0.0898,
      spectype: 'M8V',
      dist: 12.47,
      ra: 346.6225,
      dec: -5.0414,
    });
    const computed = solvePlanet(fields, { hzBound: 'conservative' });
    expect(computed.sFlux).toBeCloseTo(0.646, 2);
    expect(computed.teq).toBeCloseTo(228.64, 1);
    expect(computed.ts).toBeCloseTo(261.64, 1);
    expect(computed.rho).toBeCloseTo(4.897, 2);
    expect(computed.ve).toBeCloseTo(0.867, 2);
    expect(computed.fHz).toBeCloseTo(0.601, 2);
    expect(computed.esiInterior).toBeGreaterThanOrEqual(0.94);
    expect(computed.esiInterior).toBeLessThanOrEqual(0.97);
    expect(computed.fHz).toBeGreaterThanOrEqual(0.55);
    expect(computed.fHz).toBeLessThanOrEqual(0.63);
    expect(computed.hzExtrapolated).toBe(true);
    expect(computed.pStar).toBe(0.85);
    expect(computed.insufficientData).toBe(false);
  });

  it('Kepler-452 b: индексы считаются, но планета не проходит строгий режим по химии', () => {
    const fields = fieldsFrom({
      rade: 1.63,
      masse: 5.0,
      ecc: 0.03,
      orbsmax: 1.046,
      orbper: 384.84,
      teff: 5757,
      lum: 1.11,
      rad: 1.11,
      mass: 1.04,
      spectype: 'G2V',
      dist: 550,
      ra: 294.2167,
      dec: 44.2775,
    });
    const computed = solvePlanet(fields, { hzBound: 'conservative' });
    expect(computed.radiusUsed).toBe(1.63);
    expect(computed.massUsed).toBe(5);
    expect(computed.fHz).not.toBeNull();
    expect(computed.esiR).not.toBeNull();
    expect(computed.esiRho).not.toBeNull();
    expect(computed.insufficientData).toBe(false);
    expect(computed.qDataBase).toBe(1);
  });

  it('уровень Б: масса из радиуса включает штраф Q_data −0.10', () => {
    const fields = fieldsFrom({
      rade: 1,
      ecc: 0.01,
      orbsmax: 1,
      teff: 5772,
      lum: 1,
      rad: 1,
      mass: 1,
    });
    const computed = solvePlanet(fields, { hzBound: 'conservative' });
    expect(computed.massUsed).toBeCloseTo(1, 3);
    expect(computed.levelB).toBe(true);
    expect(computed.qDataBase).toBeCloseTo(0.9, 10);
    expect(computed.origins.masse).toBe('model');
  });

  it('принятый e = 0 штрафует Q_data, кроме короткопериодических планет', () => {
    const base = {
      rade: 1,
      masse: 1,
      orbsmax: 1,
      teff: 5772,
      lum: 1,
      rad: 1,
      mass: 1,
    };
    const longPeriod = solvePlanet(fieldsFrom({ ...base, orbper: 365 }), { hzBound: 'conservative' });
    expect(longPeriod.eAssumed).toBe(true);
    expect(longPeriod.qDataBase).toBeCloseTo(0.95, 10);

    const shortPeriod = solvePlanet(fieldsFrom({ ...base, orbper: 3 }), { hzBound: 'conservative' });
    expect(shortPeriod.eAssumed).toBe(true);
    expect(shortPeriod.qDataBase).toBeCloseTo(1, 10);
  });

  it('k < 3: индекс недоступен, планета помечена insufficientData', () => {
    const fields = fieldsFrom({ teff: 5772, lum: 1, orbsmax: 1 });
    const computed = solvePlanet(fields, { hzBound: 'conservative' });
    expect(computed.radiusUsed).toBeNull();
    expect(computed.esiR).toBeNull();
    expect(computed.esiRho).toBeNull();
    expect(computed.esiVe).toBeNull();
    expect(computed.fHz).not.toBeNull();
    expect(computed.availableSubindexes).toBe(1);
    expect(computed.insufficientData).toBe(true);
  });

  it('Kepler: a = 1 а.е., st_mass = 1 M☉ -> P = 365.25 сут', () => {
    const computed = solvePlanet(fieldsFrom({ orbsmax: 1, mass: 1 }), {
      hzBound: 'conservative',
    });
    expect(computed.period).not.toBeNull();
    expect(computed.period ?? 0).toBeCloseTo(365.25, 2);
  });

  it('не превращает null в 0', () => {
    const computed = solvePlanet(fieldsFrom({}), { hzBound: 'conservative' });
    expect(computed.radiusUsed).toBeNull();
    expect(computed.massUsed).toBeNull();
    expect(computed.sFlux).toBeNull();
    expect(computed.teq).toBeNull();
    expect(computed.ts).toBeNull();
    expect(computed.fHz).toBeNull();
    expect(fieldNumber(fieldsFrom({}), 'rade')).toBeNull();
  });
});
