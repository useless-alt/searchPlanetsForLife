/**
 * Индикатор загрузки (задача 12a).
 *
 * Кольцо вращается само (цикл 900 мс — как «life sign» из motion.md) и
 * сопровождается подписью для программ экранного доступа: цвет и вращение
 * не являются единственным признаком загрузки.
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

/** Индикатор загрузки. */
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
        r="9"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray="42 15"
      />
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
