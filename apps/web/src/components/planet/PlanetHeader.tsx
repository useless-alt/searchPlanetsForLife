import type { WorldClass } from '@exo/shared';
import type { RefObject } from 'react';

import { ru } from '../../i18n/ru';
import { Button, Icon } from '../ui';

/**
 * Заголовок карточки планеты (задача 19; п. 10.7, 13.5).
 *
 * Имя планеты — заголовок, на который переходит фокус при открытии вида;
 * под ним описание класса мира (U41). Кнопка «Закрыть» не сбрасывает камеру.
 */

/** Пропсы заголовка. */
export interface PlanetHeaderProps {
  /** Имя планеты. */
  name: string;
  /** Идентификатор планеты для подсказки. */
  planetId: string;
  /** Класс мира; null — деталь ещё не загружена. */
  world: WorldClass | null;
  /** Куда вернуть фокус при открытии. */
  headingRef: RefObject<HTMLHeadingElement>;
  /** Закрыть вид планеты без сброса камеры. */
  onClose: () => void;
}

/** Заголовок вида планеты. */
export function PlanetHeader({ name, planetId, world, headingRef, onClose }: PlanetHeaderProps) {
  return (
    <div className="planet-card__head">
      <div className="planet-card__heading">
        <h2 className="planet-card__title" ref={headingRef} tabIndex={-1}>
          {name}
        </h2>

        {world === null ? null : (
          <p
            className="planet-card__world"
            data-help-key={`class.${world}`}
            data-help-planet={planetId}
          >
            {ru[`world.${world}`]}
          </p>
        )}
      </div>

      <Button
        variant="icon"
        className="planet-card__close"
        aria-label={ru['planet.close']}
        onClick={onClose}
      >
        <Icon name="close" size={18} />
      </Button>
    </div>
  );
}
