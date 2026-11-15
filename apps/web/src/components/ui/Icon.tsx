import type { SVGProps } from 'react';

import { ICONS, type IconName } from './icons';

/**
 * Иконка интерфейса (задача 27a, п. 7).
 *
 * Инлайн-SVG в `currentColor`, по умолчанию декоративная (`aria-hidden`):
 * рядом с подписью она не должна читаться программой экранного доступа.
 * Если иконка — единственное содержимое кнопки, доступное имя задаётся
 * атрибутом `aria-label` самой кнопки (`<Button aria-label="Закрыть">`),
 * поэтому здесь достаточно декоративного режима.
 *
 * Проп `label` превращает иконку в самостоятельную картинку с ролью `img` —
 * для одиночных значков вне кнопок.
 */

/** Пропсы иконки. */
export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name' | 'children'> {
  /** Имя иконки из набора. */
  name: IconName;
  /** Сторона квадрата в пикселях; по умолчанию 16. */
  size?: number;
  /** Доступное имя: делает иконку самостоятельной картинкой. */
  label?: string;
}

/** Иконка набора. */
export function Icon({ name, size = 16, label, className, ...rest }: IconProps) {
  const paths = ICONS[name];
  const classes = ['ui-icon', className].filter(Boolean).join(' ');
  const labelled = typeof label === 'string' && label !== '';

  return (
    <svg
      {...rest}
      className={classes}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={labelled ? 'img' : undefined}
      aria-label={labelled ? label : undefined}
      aria-hidden={labelled ? undefined : true}
      focusable="false"
      data-icon={name}
    >
      {paths.map((d, index) => (
        <path key={index} d={d} />
      ))}
    </svg>
  );
}
