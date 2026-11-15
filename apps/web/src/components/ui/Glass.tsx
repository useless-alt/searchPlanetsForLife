import type { HTMLAttributes } from 'react';

/**
 * Стеклянная поверхность (задача 27a, п. 4).
 *
 * Один визуальный примитив для панелей над холстом: фон `--glass-bg`,
 * граница 1px `--glass-border`, тонкий верхний блик, мягкая тень и
 * `backdrop-filter: blur(≤14px)`. При `prefers-reduced-transparency: reduce`
 * и `html[data-quality="low"]` размытие выключается, а фон заменяется
 * непрозрачным `--glass-bg-solid` (U65) — это делает CSS, а не компонент,
 * поэтому поведение одинаково у всех панелей.
 *
 * `flush` — вариант у края экрана (шапка, выдвижная панель): без радиуса.
 */

/** Пропсы стеклянной поверхности. */
export interface GlassProps extends HTMLAttributes<HTMLElement> {
  /** Тег поверхности; по умолчанию `div`. */
  as?: 'div' | 'section' | 'aside';
  /** Стекло у края экрана: без радиуса и боковых границ. */
  flush?: boolean;
}

/** Стеклянная поверхность. */
export function Glass({
  as: Tag = 'div',
  flush = false,
  className,
  children,
  ...rest
}: GlassProps) {
  const classes = ['ui-glass', flush ? 'ui-glass--flush' : null, className]
    .filter(Boolean)
    .join(' ');

  return (
    <Tag {...rest} className={classes}>
      {children}
    </Tag>
  );
}
