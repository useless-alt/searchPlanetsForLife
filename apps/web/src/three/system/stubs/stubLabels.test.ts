import { describe, expect, it, vi } from 'vitest';

import type { SolverFlags } from '@exo/shared';

import * as helpApi from '../../../help/api';
import type { PlanetDetail } from '../../../workers/protocol';
import { createStubLabel } from './stubLabels';

/**
 * Тесты подписи заглушки (задача 27; п. 9.2, 10.9.7).
 *
 * Проверяются точный текст, знак вопроса, подсказка со списком недостающих
 * параметров, фокус с клавиатуры и удаление DOM-элементов.
 */

vi.mock('../../../help/api', () => ({
  showHelpAt: vi.fn(),
  hideHelp: vi.fn(),
}));

/** Флаги решателя по умолчанию. */
function flags(): SolverFlags {
  return {
    insufficient_data: false,
    levelB_mass: false,
    levelB_radius: false,
    e_assumed_zero: false,
    excluded_subindices: [],
    k: 4,
    n: 4,
    strict_complete: false,
    available: {
      ESI_R: true,
      ESI_rho: true,
      ESI_ve: true,
      ESI_S: true,
      ESI_T: true,
      F_HZ: true,
    },
  };
}

/** Деталь заглушки. */
function detail(): PlanetDetail {
  return {
    id: 'planet-1',
    name: 'Planet 1',
    hostname: 'Star',
    letter: 'b',
    aliases: [],
    sourcesCount: 1,
    resolved: { flags: flags() } as PlanetDetail['resolved'],
    score: null,
    classicRank: null,
    hz: null,
    world: 'unknown',
    gaps: {
      planet: ['R'],
      star: ['st_teff'],
      planetStub: true,
      starStub: true,
    },
    inTop: true,
  };
}

describe('createStubLabel', () => {
  it('показывает знак вопроса и точный текст подписи', () => {
    const label = createStubLabel({ detail: detail(), kind: 'planet', radius: 2 });
    const element = label.object.element;
    const glyph = element.querySelector('.stub-glyph');
    const caption = element.querySelector('.stub-caption');

    document.body.append(element);

    expect(glyph?.textContent).toBe('?');
    expect(glyph?.getAttribute('aria-hidden')).toBe('true');
    expect(caption?.textContent).toBe('недостаточно данных для отрисовки');
    expect(caption?.getAttribute('role')).toBe('note');
    expect(caption?.getAttribute('tabindex')).toBe('0');
    expect(element.querySelector('[data-help-key="stub.missing"]')).not.toBeNull();

    label.dispose();
  });

  it('по фокусу показывает недостающие параметры планеты', () => {
    const show = vi.mocked(helpApi.showHelpAt);
    const label = createStubLabel({ detail: detail(), kind: 'planet', radius: 2 });
    const caption = label.object.element.querySelector<HTMLElement>('.stub-caption');

    document.body.append(label.object.element);

    caption?.focus();

    expect(show).toHaveBeenCalled();
    expect(show.mock.calls[0]?.[0].key).toBe('stub.missing');
    expect(show.mock.calls[0]?.[0].ctx?.missing).toEqual(['радиус планеты', 'температура звезды']);

    label.dispose();
  });

  it('для звезды список содержит только параметры звезды', () => {
    const show = vi.mocked(helpApi.showHelpAt);
    const label = createStubLabel({ detail: detail(), kind: 'star', radius: 2 });
    const caption = label.object.element.querySelector<HTMLElement>('.stub-caption');

    document.body.append(label.object.element);

    caption?.focus();

    expect(show.mock.calls.at(-1)?.[0].ctx?.missing).toEqual(['температура звезды']);

    label.dispose();
  });

  it('dispose удаляет DOM-элементы', () => {
    const label = createStubLabel({ detail: detail(), kind: 'planet', radius: 2 });
    const element = label.object.element;

    document.body.append(element);
    label.dispose();
    label.dispose();

    expect(element.parentElement).toBeNull();
    expect(document.querySelector('.stub-caption')).toBeNull();
  });
});
