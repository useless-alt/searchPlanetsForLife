import type { ParamValue, Provenance, ResolvedPlanet, SourceId } from '@exo/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildHelp } from './builders';
import { registerHelp, resetHelpRegistry, resolveEntry } from './registry';

/**
 * Тесты построителей и реестра подсказок (задача 17; п. 11.1, 11.7).
 *
 * Проверяются строка значения, блок «Откуда значение», пометка резервной
 * копии, отсутствие динамики без кэша, порядок блоков и полнота словаря.
 */

const NBSP = '\u00a0';

afterEach(() => {
  resetHelpRegistry();
  vi.restoreAllMocks();
});

/** Значение параметра без источника. */
function nullParam(): ParamValue {
  return {
    value: null,
    provenance: null,
    source: null,
    sourceDate: null,
    fromBackup: false,
    alternatives: [],
  };
}

/** Значение параметра с происхождением. */
function makeParam(
  value: number,
  provenance: Provenance,
  source: SourceId | null = provenance === 'measured' ? 'nasa' : null,
  fromBackup = false,
): ParamValue {
  return {
    value,
    provenance,
    source,
    sourceDate: null,
    fromBackup,
    alternatives: [],
  };
}

/** Разрешённая планета с заданными параметрами. */
function planet(overrides: Partial<ResolvedPlanet> = {}): ResolvedPlanet {
  return {
    id: 'planet-1',
    R: nullParam(),
    M: nullParam(),
    e: nullParam(),
    d: nullParam(),
    P: nullParam(),
    S: nullParam(),
    T_eq: nullParam(),
    rho: nullParam(),
    L: nullParam(),
    st_teff: nullParam(),
    st_rad: nullParam(),
    st_mass: nullParam(),
    dist_pc: nullParam(),
    ra: nullParam(),
    dec: nullParam(),
    flags: {
      insufficient_data: false,
      levelB_mass: false,
      levelB_radius: false,
      e_assumed_zero: false,
      excluded_subindices: [],
      k: 4,
      n: 4,
      strict_complete: true,
      available: {
        ESI_R: true,
        ESI_rho: true,
        ESI_ve: true,
        ESI_S: true,
        ESI_T: true,
        F_HZ: true,
      },
    },
    ...overrides,
  };
}

/** Текст блока по подписи. */
function blockText(content: ReturnType<typeof buildHelp>, label: string): string | undefined {
  return content?.blocks.find((block) => block.label === label)?.text;
}

describe('buildHelp: строка значения и происхождение', () => {
  it('показывает пересчёт и физическое происхождение радиуса', () => {
    const content = buildHelp('val.R', {
      planetId: 'planet-1',
      resolved: planet({ R: makeParam(0.39, 'physics') }),
    });

    expect(content?.valueLine).toBe(`Значение: 0.39 R⊕ ≈ 2${NBSP}485 км`);
    expect(blockText(content, 'origin')).toBe('Физика');
  });

  it('называет источник измеренного значения', () => {
    const content = buildHelp('val.R', {
      planetId: 'planet-1',
      resolved: planet({ R: makeParam(1, 'measured', 'nasa') }),
    });

    expect(blockText(content, 'origin')).toBe('Измерено (NASA Exoplanet Archive)');
  });

  it('показывает модель Чена — Киппинга', () => {
    const content = buildHelp('val.M', {
      planetId: 'planet-1',
      resolved: planet({ M: makeParam(6.07, 'model') }),
    });

    expect(blockText(content, 'origin')).toBe('Модель (Чен — Киппинг)');
  });

  it('добавляет пометку резервной копии', () => {
    const content = buildHelp('val.M', {
      planetId: 'planet-1',
      resolved: planet({ M: makeParam(1, 'measured', 'nasa', true) }),
    });

    expect(blockText(content, 'origin')).toBe(
      'Измерено (NASA Exoplanet Archive) · из резервной копии',
    );
  });

  it('без кэша планеты оставляет только статический текст', () => {
    const content = buildHelp('val.R', { planetId: 'planet-1', resolved: null });

    expect(content?.valueLine).toBeUndefined();
    expect(blockText(content, 'origin')).toBeUndefined();
    expect(blockText(content, 'what')).toBe('размер планеты по сравнению с Землёй');
  });

  it('считает температуру поверхности как T_eq + 33 K', () => {
    const content = buildHelp('val.T_s', {
      planetId: 'planet-1',
      resolved: planet({ T_eq: makeParam(255, 'physics') }),
    });

    expect(content?.valueLine).toBe('Значение: 288 K = +15 °C');
    expect(blockText(content, 'origin')).toBe(
      'Физика (равновесная температура 255·S^0.25 (+33 K))',
    );
  });
});

describe('buildHelp: порядок и подписи блоков', () => {
  it('выводит what → units → why → origin', () => {
    registerHelp('val.R', {
      title: 'R',
      what: 'размер планеты',
      units: '1.00 = Земля',
      why: 'сравнение размеров',
    });

    const content = buildHelp('val.R', {
      planetId: 'planet-1',
      resolved: planet({ R: makeParam(1, 'measured') }),
    });

    expect(content?.blocks.map((block) => block.label)).toEqual(['what', 'units', 'why', 'origin']);
  });

  it('для элементов управления подписывает блок «Зачем нужно»', () => {
    const content = buildHelp('mode.adaptive');

    expect(content?.whyLabel).toBe('Зачем нужно');
    expect(content?.blocks.map((block) => block.label)).toEqual(['what', 'why']);
  });

  it('добавляет причину недоступности и недостающие параметры', () => {
    const scene = buildHelp('scene.scale', { disabledReason: 'режим 1:1' });
    const stub = buildHelp('stub.missing', { missing: ['R', 'M'] });

    expect(blockText(scene, 'why')).toContain('Недоступно: режим 1:1');
    expect(blockText(stub, 'what')).toBe('Для достоверной картинки не хватает: R, M');
  });

  it('добавляет строки параметров метки карты', () => {
    const content = buildHelp('map.label', { lines: ['R = 1.02', 'M = 1.00'] });

    expect(blockText(content, 'what')).toContain('R = 1.02 · M = 1.00');
  });
});

describe('реестр', () => {
  it('разрешает все ключи задач 13–16', () => {
    const keys = [
      'mode.adaptive',
      'mode.rhi',
      'mode.classic_esi',
      'mode.strict',
      'params.hzBounds',
      'params.rocky',
      'params.ecc',
      'params.star',
      'params.qdata',
      'params.qMin',
      'filters.spectralClass',
      'filters.radius',
      'filters.tSurface',
      'filters.e',
      'filters.earth',
      'filters.earthShare',
      'search.field',
      'col.rank',
      'col.delta',
      'col.index',
      'col.Q_data',
      'col.R',
      'col.M',
      'col.T_s',
      'col.e',
      'col.class',
      'col.dist_pc',
      'val.R',
      'val.M',
      'val.T_s',
      'val.e',
      'val.dist_pc',
      'val.index',
      'val.Q_data',
      'badge.q.high',
      'badge.q.medium',
      'badge.q.estimated',
      'badge.origin.measured',
      'badge.origin.physics',
      'badge.origin.model',
      'badge.origin.estimate',
      'badge.recon',
      'badge.noData',
      'tag.exo',
      'tag.lowReliability',
      'scene.target',
      'scene.scale',
      'scene.orbit',
      'scene.hz',
      'scene.reset',
      'stub.missing',
      'map.label',
      'extra.toggle',
      'unit.R_earth',
      'unit.M_earth',
      'unit.K',
      'unit.pc',
      'unit.au',
      'unit.R_sun',
      'unit.L_sun',
      'unit.day',
    ];

    for (const key of keys) expect(resolveEntry(key), key).not.toBeNull();
  });

  it('col, val и unit указывают на одну запись величины', () => {
    expect(resolveEntry('col.R')).toBe(resolveEntry('val.R'));
    expect(resolveEntry('unit.R_earth')).toBe(resolveEntry('R_earth'));
  });

  it('неизвестный ключ не показывает подсказку и пишет ошибку в тестах', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(buildHelp('unknown.scope')).toBeNull();
    expect(spy).toHaveBeenCalled();
  });

  it('хранит дословные формулировки таблицы 11.7', () => {
    expect(resolveEntry('R')?.units).toBe('1.00 = Земля (≈6 371 км); 0.39 R⊕ ≈ 2 485 км');
    expect(resolveEntry('M')?.units).toBe('1.00 = Земля (≈5.97·10²⁴ кг); 6.07 M⊕ ≈ 3.6·10²⁵ кг');
  });
});
