import type { ReactNode } from 'react';

/**
 * Пустое состояние (задача 12a; содержание — из ТЗ, п. 10.4; тема — 27a).
 *
 * Показывает, что выборка пуста, и предлагает действие (обычно сброс фильтров).
 * Иллюстрация — «созвездие»: пять линий и восемь точек, одна из них ярче;
 * инлайн-SVG меньше 2 КБ, цвет — `currentColor`, поэтому не спорит с темой.
 *
 * Тексты приходят из словаря `i18n/ru.ts` или из пропсов.
 */

/** Пропсы пустого состояния. */
export interface EmptyStateProps {
  /** Заголовок состояния. */
  title: string;
  /** Пояснение под заголовком. */
  description?: string;
  /** Действие (обычно кнопка сброса). */
  action?: ReactNode;
  /** Дополнительный класс. */
  className?: string;
}

/** Иллюстрация «созвездие» (декоративная, 176×72). */
function Constellation() {
  return (
    <svg
      className="ui-empty__art"
      viewBox="0 0 176 72"
      aria-hidden="true"
      focusable="false"
      fill="none"
    >
      <g stroke="currentColor" strokeOpacity="0.35" strokeWidth="1">
        <path d="M14 48 44 29 72 41 96 18 128 33 162 13" />
        <path d="M44 29 52 59 88 62 96 18" />
      </g>
      <g fill="currentColor">
        <circle cx="14" cy="48" r="1.6" />
        <circle cx="44" cy="29" r="1.6" />
        <circle cx="52" cy="59" r="1.4" />
        <circle cx="72" cy="41" r="1.4" />
        <circle cx="88" cy="62" r="1.4" />
        <circle cx="128" cy="33" r="1.6" />
        <circle cx="162" cy="13" r="1.4" />
        <circle cx="96" cy="18" r="2.6" />
      </g>
    </svg>
  );
}

/** Пустое состояние: «ни одной планеты» и подобные. */
export function EmptyState({ title, description, action, className }: EmptyStateProps) {
  const classes = ['ui-empty', className].filter(Boolean).join(' ');

  return (
    <div className={classes}>
      <Constellation />
      <p className="ui-empty__title">{title}</p>
      {description ? <p className="ui-empty__text">{description}</p> : null}
      {action}
    </div>
  );
}
