import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  Badge,
  Banner,
  Button,
  Checkbox,
  EmptyState,
  Input,
  Modal,
  Panel,
  RangeInput,
  SegmentedControl,
  Slider,
  Spinner,
  Table,
  TableBody,
  TableHead,
  TableHeaderCell,
  TableNumberCell,
  TableRow,
} from './index';

/**
 * Тесты библиотеки компонентов (задача 12a).
 *
 * Проверяется не «красота», а доступность и поведение: у каждого компонента
 * заданы роль и доступное имя, сегментированный переключатель листается
 * стрелками, модальное окно закрывается по Esc и возвращает фокус.
 */

afterEach(cleanup);

describe('Button', () => {
  it('рисует все четыре варианта', () => {
    const { container } = render(
      <>
        <Button variant="primary">Основная</Button>
        <Button variant="secondary">Вторичная</Button>
        <Button variant="ghost">Текстовая</Button>
        <Button variant="icon" aria-label="Закрыть панель">
          ×
        </Button>
      </>,
    );

    const buttons = Array.from(container.querySelectorAll('button'));

    expect(buttons.length).toBe(4);
    expect(buttons[0]?.className).toContain('ui-btn--primary');
    expect(buttons[1]?.className).toContain('ui-btn--secondary');
    expect(buttons[2]?.className).toContain('ui-btn--ghost');
    expect(buttons[3]?.className).toContain('ui-btn--icon');
    expect(screen.getByRole('button', { name: 'Закрыть панель' })).toBeTruthy();
  });

  it('недоступна и занята: disabled и aria-busy', () => {
    const { rerender } = render(<Button disabled>Основная</Button>);
    const button = screen.getByRole('button', { name: 'Основная' });

    expect((button as HTMLButtonElement).disabled).toBe(true);

    rerender(
      <Button loading aria-label="Обновляем каталог">
        Обновить
      </Button>,
    );

    const loading = screen.getByRole('button', { name: 'Обновляем каталог' });

    expect(loading.getAttribute('aria-busy')).toBe('true');
    expect((loading as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('SegmentedControl', () => {
  /** Переключатель с собственным состоянием — так его использует приложение. */
  function Controlled() {
    const [value, setValue] = useState('adaptive');

    return (
      <SegmentedControl
        label="Режим расчёта"
        value={value}
        onChange={setValue}
        options={[
          { value: 'adaptive', label: 'Адаптивный' },
          { value: 'rhi', label: 'RHI' },
          { value: 'classic_esi', label: 'Упрощённый ESI (R, S)' },
        ]}
      />
    );
  }

  it('задаёт роль radiogroup и имя группы', () => {
    render(<Controlled />);

    const group = screen.getByRole('radiogroup', { name: 'Режим расчёта' });

    expect(group).toBeTruthy();
    expect(screen.getAllByRole('radio').length).toBe(3);
    expect(screen.getByRole('radio', { name: 'Адаптивный' }).getAttribute('aria-checked')).toBe(
      'true',
    );
  });

  it('стрелки переключают значение', () => {
    render(<Controlled />);

    const group = screen.getByRole('radiogroup');

    fireEvent.keyDown(group, { key: 'ArrowRight' });
    expect(screen.getByRole('radio', { name: 'RHI' }).getAttribute('aria-checked')).toBe('true');

    fireEvent.keyDown(group, { key: 'ArrowLeft' });
    expect(screen.getByRole('radio', { name: 'Адаптивный' }).getAttribute('aria-checked')).toBe(
      'true',
    );

    // Стрелка влево от первого варианта переходит к последнему.
    fireEvent.keyDown(group, { key: 'ArrowLeft' });
    expect(
      screen.getByRole('radio', { name: 'Упрощённый ESI (R, S)' }).getAttribute('aria-checked'),
    ).toBe('true');
  });

  it('щелчок по варианту выбирает его', () => {
    render(<Controlled />);

    fireEvent.click(screen.getByRole('radio', { name: 'RHI' }));

    expect(screen.getByRole('radio', { name: 'RHI' }).getAttribute('aria-checked')).toBe('true');
  });
});

describe('Checkbox', () => {
  it('подпись связана с полем, состояние меняется', () => {
    const onChange = vi.fn();

    render(
      <Checkbox
        label="Штраф за эксцентриситет"
        description="По умолчанию включён"
        checked
        onChange={onChange}
      />,
    );

    const checkbox = screen.getByRole('checkbox', { name: /Штраф за эксцентриситет/ });

    expect((checkbox as HTMLInputElement).checked).toBe(true);

    fireEvent.click(checkbox);
    expect(onChange).toHaveBeenCalledWith(false);
  });
});

describe('Slider', () => {
  it('показывает значение и принимает новое', () => {
    const onChange = vi.fn();

    render(
      <Slider
        label="Минимальный Q_data"
        value={0.85}
        min={0.75}
        max={1}
        step={0.01}
        format={(value) => `${Math.round(value * 100)} %`}
        onChange={onChange}
      />,
    );

    const slider = screen.getByRole('slider', { name: 'Минимальный Q_data' });

    expect((slider as HTMLInputElement).value).toBe('0.85');
    expect(slider.getAttribute('aria-valuetext')).toBe('85 %');

    fireEvent.change(slider, { target: { value: '0.9' } });
    expect(onChange).toHaveBeenCalledWith(0.9);
  });
});

describe('Badge', () => {
  it('несёт текстовую метку и вид', () => {
    render(<Badge kind="measured" label="Измерено" />);

    const badge = screen.getByText('Измерено');

    expect(badge.className).toContain('ui-badge--measured');
  });
});

describe('Banner', () => {
  it('ошибка объявляется сразу, информация — как статус', () => {
    const { rerender } = render(<Banner tone="error">Сбой источника</Banner>);

    expect(screen.getByRole('alert').textContent).toContain('Сбой источника');

    rerender(<Banner tone="info">Резервная копия</Banner>);
    expect(screen.getByRole('status').textContent).toContain('Резервная копия');
  });

  it('закрывается по кнопке', () => {
    const onDismiss = vi.fn();

    render(<Banner tone="warning" onDismiss={onDismiss} dismissLabel="Скрыть" />);

    fireEvent.click(screen.getByRole('button', { name: 'Скрыть' }));
    expect(onDismiss).toHaveBeenCalled();
  });
});

describe('Modal', () => {
  /** Кнопка, открывающая окно: на неё должен вернуться фокус. */
  function Harness({ onClose }: { onClose: () => void }) {
    const [open, setOpen] = useState(false);

    return (
      <>
        <button type="button" onClick={() => setOpen(true)}>
          Открыть
        </button>
        <Modal
          open={open}
          onClose={() => {
            setOpen(false);
            onClose();
          }}
          title="Методика и ограничения"
        >
          <p>Формулы и источники.</p>
        </Modal>
      </>
    );
  }

  it('открывается как модальное окно с заголовком', () => {
    render(<Harness onClose={() => undefined} />);

    fireEvent.click(screen.getByRole('button', { name: 'Открыть' }));

    const dialog = screen.getByRole('dialog', { name: 'Методика и ограничения' });

    expect(dialog.getAttribute('aria-modal')).toBe('true');
  });

  it('Esc закрывает окно, фокус возвращается на вызвавший элемент', () => {
    const onClose = vi.fn();

    render(<Harness onClose={onClose} />);

    const trigger = screen.getByRole('button', { name: 'Открыть' });

    // Клик по кнопке в браузере переводит на неё фокус — так же и в тесте.
    trigger.focus();
    fireEvent.click(trigger);
    expect(document.activeElement !== trigger).toBe(true);

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('фокус не покидает окно', () => {
    render(<Harness onClose={() => undefined} />);

    fireEvent.click(screen.getByRole('button', { name: 'Открыть' }));

    const dialog = screen.getByRole('dialog');

    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it('клик вне окна закрывает его', () => {
    const onClose = vi.fn();

    render(
      <Modal open onClose={onClose} title="Методика">
        <p>Текст</p>
      </Modal>,
    );

    const backdrop = document.querySelector('.ui-modal__backdrop');

    expect(backdrop).toBeTruthy();

    fireEvent.mouseDown(backdrop as Element);
    expect(onClose).toHaveBeenCalled();
  });
});

describe('Panel', () => {
  it('показывает заголовок и закрывается по Esc', () => {
    const onClose = vi.fn();

    render(
      <Panel open title="Параметры модели" onClose={onClose}>
        <p>Граница зоны</p>
      </Panel>,
    );

    expect(screen.getByRole('complementary', { name: 'Параметры модели' })).toBeTruthy();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});

describe('Input', () => {
  it('подпись связана с полем, ошибка живёт под своим полем', () => {
    const onChange = vi.fn();

    render(
      <Input label="Поиск планеты" value="kepler" onChange={onChange} error="Найдено 0 планет" />,
    );

    const input = screen.getByLabelText('Поиск планеты');

    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByText('Найдено 0 планет')).toBeTruthy();

    fireEvent.change(input, { target: { value: 'kepler-442' } });
    expect(onChange).toHaveBeenCalledWith('kepler-442');
  });
});

describe('RangeInput', () => {
  it('пара «Мин — Макс» с пустыми границами как null', () => {
    const onChange = vi.fn();

    render(
      <RangeInput
        label="Диапазон радиуса [R⊕]"
        value={{ min: 0.5, max: null }}
        onChange={onChange}
      />,
    );

    const min = screen.getByLabelText('Мин') as HTMLInputElement;
    const max = screen.getByLabelText('Макс') as HTMLInputElement;

    expect(min.value).toBe('0.5');
    expect(max.value).toBe('');

    fireEvent.change(max, { target: { value: '2.5' } });
    expect(onChange).toHaveBeenCalledWith({ min: 0.5, max: 2.5 });
  });
});

describe('Spinner', () => {
  it('объявляет статус с подписью', () => {
    render(<Spinner label="Загрузка…" />);

    expect(screen.getByRole('status').textContent).toContain('Загрузка…');
  });
});

describe('EmptyState', () => {
  it('показывает заголовок, пояснение и действие', () => {
    render(
      <EmptyState
        title="Ни одной планеты"
        description="Ослабьте фильтры и сбросьте настройки."
        action={<Button>Сбросить фильтры</Button>}
      />,
    );

    expect(screen.getByText('Ни одной планеты')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Сбросить фильтры' })).toBeTruthy();
  });
});

describe('TableParts', () => {
  it('заголовок помечен направлением сортировки, ячейка числа моноширинная', () => {
    const { container } = render(
      <Table>
        <TableHead>
          <TableRow>
            <TableHeaderCell
              label="Ранг"
              sortDirection="asc"
              sortLabel="Сортировать по возрастанию"
            />
            <TableHeaderCell label="Индекс" />
          </TableRow>
        </TableHead>
        <TableBody>
          <TableRow>
            <TableNumberCell value="0,87" />
            <TableNumberCell value="—" />
          </TableRow>
        </TableBody>
      </Table>,
    );

    const header = container.querySelector('th');

    expect(header?.getAttribute('aria-sort')).toBe('ascending');
    expect(container.textContent).toContain('↑');
    expect(container.querySelectorAll('.ui-table__number').length).toBe(2);
  });
});
