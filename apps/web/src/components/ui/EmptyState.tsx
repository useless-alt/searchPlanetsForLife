import type { ReactNode } from 'react';

/**
 * Пустое состояние (задача 12a; содержание — из ТЗ, п. 10.4).
 *
 * Показывает, что выборка пуста, и предлагает действие (обычно сброс фильтров).
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

/** Пустое состояние: «ни одной планеты» и подобные. */
export function EmptyState({ title, description, action, className }: EmptyStateProps) {
  const classes = ['ui-empty', className].filter(Boolean).join(' ');

  return (
    <div className={classes}>
      <p className="ui-empty__title">{title}</p>
      {description ? <p className="ui-empty__text">{description}</p> : null}
      {action}
    </div>
  );
}
