/**
 * Индикатор загрузки (задача 12a; орбитальная анимация — задача 27a).
 *
 * Кольцо орбиты и точка, идущая по нему (цикл 1.1 с). Подпись для программ
 * экранного доступа остаётся: цвет и движение не единственный признак
 * загрузки. При `prefers-reduced-motion: reduce` точка стоит на месте
 * (CSS, глобальное правило движения).
 */

/** Размер индикатора. */
export type SpinnerSize = 'sm' | 'md' | 'lg';

/** Пропсы индикатора загрузки. */
export interface SpinnerProps {
  /** Подпись для программ экранного доступа. */
  label?: string;
  /** Размер кольца. */
  size?: SpinnerSize;
  /** Декоративный индикатор: без роли и подписи (внутри кнопки). */
  decorative?: boolean;
  /** Дополнительный класс. */
  className?: string;
}

/** Размеры кольца в пикселях. */
const SIZES: Record<SpinnerSize, number> = { sm: 14, md: 20, lg: 28 };

/** Индикатор загрузки с точкой на орбите. */
export function Spinner({ label, size = 'md', decorative = false, className }: SpinnerProps) {
  const px = SIZES[size];
  const classes = ['ui-spinner', className].filter(Boolean).join(' ');

  const ring = (
    <svg
      className="ui-spinner__ring"
      width={px}
      height={px}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <circle
        cx="12"
        cy="12"
        r="8.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeOpacity="0.35"
      />
      <g className="ui-spinner__orbit">
        <circle cx="12" cy="3.5" r="2" fill="currentColor" />
      </g>
    </svg>
  );

  if (decorative) {
    return <span className={classes}>{ring}</span>;
  }

  return (
    <span className={classes} role="status">
      {ring}
      {label ? <span className="ui-visually-hidden">{label}</span> : null}
    </span>
  );
}
