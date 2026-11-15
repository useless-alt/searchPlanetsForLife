/**
 * Затемняющий слой поверх 3D-холста (задача 22; п. 10.9; U55).
 *
 * Используется при смене планеты внутри сцены системы. При
 * `prefers-reduced-motion` переход мгновенный.
 */

/** Пропсы занавеса. */
export interface FadeCurtainProps {
  /** Затемнение активно. */
  active: boolean;
  /** Длительность перехода [мс]. */
  durationMs?: number;
  /** Уменьшенное движение: без плавного перехода. */
  reducedMotion?: boolean;
  /** Дополнительный класс. */
  className?: string;
}

/** Затемняющий слой. */
export function FadeCurtain({
  active,
  durationMs = 300,
  reducedMotion = false,
  className,
}: FadeCurtainProps) {
  const classes = ['fade-curtain', active ? 'fade-curtain--active' : null, className]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={classes}
      aria-hidden="true"
      style={{ transitionDuration: reducedMotion ? '0ms' : `${durationMs}ms` }}
    />
  );
}
