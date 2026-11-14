import type { HTMLAttributes, ReactNode, TdHTMLAttributes, ThHTMLAttributes } from 'react';

/**
 * Части таблицы (задача 12a; п. 10.5, 13.4).
 *
 * Заголовок с индикатором сортировки (↑/↓) и `aria-sort`, ячейка с числом
 * моноширинным шрифтом и tabular-nums: цифры в колонке выравниваются по
 * разряду и читаются как приборные данные.
 */

/** Направление сортировки колонки. */
export type TableSortDirection = 'asc' | 'desc';

/** Таблица. */
export type TableProps = HTMLAttributes<HTMLTableElement>;

/** Таблица. */
export function Table({ className, ...rest }: TableProps) {
  const classes = ['ui-table', className].filter(Boolean).join(' ');

  return <table {...rest} className={classes} />;
}

/** Шапка таблицы. */
export function TableHead({ className, ...rest }: HTMLAttributes<HTMLTableSectionElement>) {
  const classes = ['ui-table__head', className].filter(Boolean).join(' ');

  return <thead {...rest} className={classes} />;
}

/** Тело таблицы. */
export function TableBody({ className, ...rest }: HTMLAttributes<HTMLTableSectionElement>) {
  const classes = ['ui-table__body', className].filter(Boolean).join(' ');

  return <tbody {...rest} className={classes} />;
}

/** Строка таблицы. */
export function TableRow({ className, ...rest }: HTMLAttributes<HTMLTableRowElement>) {
  const classes = ['ui-table__row', className].filter(Boolean).join(' ');

  return <tr {...rest} className={classes} />;
}

/** Пропсы ячейки заголовка. */
export interface TableHeaderCellProps extends ThHTMLAttributes<HTMLTableCellElement> {
  /** Подпись колонки. */
  label: string;
  /** Направление сортировки; null — колонка не отсортирована. */
  sortDirection?: TableSortDirection | null;
  /** Обработчик щелчка по заголовку (сортировка). */
  onSort?: () => void;
  /** Подпись кнопки сортировки для программ экранного доступа. */
  sortLabel?: string;
  /** Числовая колонка: подпись выравнивается по разряду вместе с ячейками. */
  numeric?: boolean;
}

/** Ячейка заголовка с индикатором сортировки. */
export function TableHeaderCell({
  label,
  sortDirection = null,
  onSort,
  sortLabel,
  numeric = false,
  className,
  ...rest
}: TableHeaderCellProps) {
  const classes = ['ui-table__th', numeric ? 'ui-table__number' : null, className]
    .filter(Boolean)
    .join(' ');
  const ariaSort =
    sortDirection === 'asc' ? 'ascending' : sortDirection === 'desc' ? 'descending' : 'none';

  const indicator = sortDirection === 'asc' ? '↑' : sortDirection === 'desc' ? '↓' : null;

  return (
    <th {...rest} className={classes} aria-sort={ariaSort} scope="col">
      {onSort ? (
        <button type="button" className="ui-table__sort" onClick={onSort}>
          <span>{label}</span>
          <span className="ui-table__sort-indicator" aria-hidden="true">
            {indicator ?? '↕'}
          </span>
          {sortLabel ? <span className="ui-visually-hidden">{sortLabel}</span> : null}
        </button>
      ) : (
        <>
          <span>{label}</span>
          {indicator ? (
            <span className="ui-table__sort-indicator" aria-hidden="true">
              {indicator}
            </span>
          ) : null}
        </>
      )}
    </th>
  );
}

/** Пропсы ячейки. */
export interface TableCellProps extends TdHTMLAttributes<HTMLTableCellElement> {
  /** Содержимое ячейки. */
  children?: ReactNode;
}

/** Ячейка таблицы. */
export function TableCell({ className, children, ...rest }: TableCellProps) {
  const classes = ['ui-table__cell', className].filter(Boolean).join(' ');

  return (
    <td {...rest} className={classes}>
      {children}
    </td>
  );
}

/** Пропсы числовой ячейки. */
export interface TableNumberCellProps extends TdHTMLAttributes<HTMLTableCellElement> {
  /** Значение (уже отформатированное). */
  value: ReactNode;
  /** Подсказка при наведении (например, точное значение). */
  title?: string;
}

/** Ячейка с числом: моноширинный шрифт, выравнивание по разряду. */
export function TableNumberCell({ value, title, className, ...rest }: TableNumberCellProps) {
  const classes = ['ui-table__number', className].filter(Boolean).join(' ');

  return (
    <td {...rest} className={classes} title={title}>
      {value}
    </td>
  );
}
