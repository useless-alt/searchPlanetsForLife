import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { Icon, ICON_NAMES, ICONS, Modal, Panel } from './index';
import type { IconName } from './index';

/**
 * Тест набора иконок (задача 27a, п. 7).
 *
 * Проверяет полноту набора из постановки, отрисовку всех контуров, режимы
 * доступности и правило «иконка в кнопке без текста имеет `aria-label`»:
 * кнопки закрытия модального окна и панели содержат только иконку, поэтому
 * доступное имя обязано быть на самой кнопке.
 */

afterEach(cleanup);

/** Имена из постановки 27a. */
const REQUIRED: IconName[] = [
  'map',
  'list',
  'planet',
  'star',
  'orbit',
  'habitable',
  'refresh',
  'link',
  'csv',
  'info',
  'sources',
  'search',
  'filter',
  'sliders',
  'close',
  'back',
  'more',
  'warning',
  'check',
  'chevron',
];

describe('набор иконок', () => {
  it('содержит ровно имена из постановки', () => {
    expect([...ICON_NAMES].sort()).toEqual([...REQUIRED].sort());
    expect(Object.keys(ICONS)).toHaveLength(REQUIRED.length);
  });

  it.each(REQUIRED)('«%s» рисуется хотя бы одним контуром', (name) => {
    const { container } = render(<Icon name={name} />);
    const svg = container.querySelector('svg');

    expect(svg).not.toBeNull();
    expect(svg?.querySelectorAll('path').length).toBeGreaterThan(0);
    expect(svg?.getAttribute('width')).toBe('16');
  });

  it('без подписи иконка декоративная', () => {
    const { container } = render(<Icon name="close" />);
    const svg = container.querySelector('svg');

    expect(svg?.getAttribute('aria-hidden')).toBe('true');
    expect(svg?.hasAttribute('aria-label')).toBe(false);
    expect(svg?.hasAttribute('role')).toBe(false);
  });

  it('с подписью иконка становится картинкой с доступным именем', () => {
    const { container } = render(<Icon name="planet" label="Планета" />);
    const svg = container.querySelector('svg');

    expect(svg?.getAttribute('role')).toBe('img');
    expect(svg?.getAttribute('aria-label')).toBe('Планета');
    expect(svg?.getAttribute('aria-hidden')).toBeNull();
  });

  it('иконка в кнопке без текста опирается на aria-label кнопки', () => {
    const { container } = render(
      <Modal open onClose={() => undefined} title="Свойства">
        Текст
      </Modal>,
    );

    const close = screen.getByRole('button', { name: 'Закрыть' });

    expect(close.querySelector('svg')).not.toBeNull();
    expect(close.textContent?.trim()).toBe('');
    expect(container.ownerDocument.querySelector('.ui-modal')).not.toBeNull();
  });

  it('кнопка закрытия панели тоже названа', () => {
    render(
      <Panel open title="Фильтры" onClose={() => undefined} closeLabel="Закрыть панель">
        Содержимое
      </Panel>,
    );

    const close = screen.getByRole('button', { name: 'Закрыть панель' });

    expect(close.querySelector('svg')).not.toBeNull();
  });
});
