import type { HzBounds, ResolvedPlanet } from '@exo/shared';

import { U } from '../../help/U';
import { formatMessage, ru } from '../../i18n/ru';
import { EMPTY_VALUE, formatNum, formatPercent } from '../../lib/format';

/**
 * Блок зоны обитаемости в карточке (задача 19; п. 11.4).
 *
 * Числа берутся из той же функции `computeHz`, что и кольцо в 3D-сцене
 * (задача 24), поэтому границы карточки и сцены совпадают. Подпись сообщает,
 * какие границы выбраны в настройках модели.
 */

/** Пропсы блока. */
export interface HzInfoProps {
  /** Разрешённая планета. */
  planet: ResolvedPlanet;
  /** Зона обитаемости для выбранных границ; null — не рассчитана. */
  hz: {
    d_in: number;
    d_out: number;
    d_eff: number;
    HZD: number;
    F_HZ: number;
  } | null;
  /** Выбранные границы зоны. */
  bounds: HzBounds;
  /** Идентификатор планеты для подсказки. */
  planetId: string;
}

/** Подпись выбранных границ. */
function boundsLabel(bounds: HzBounds): string {
  return bounds === 'conservative' ? ru['params.hz.conservative'] : ru['params.hz.optimistic'];
}

/** Список недостающих для расчёта величин. */
function missingList(planet: ResolvedPlanet): string {
  const missing: string[] = [];

  if (planet.st_teff.value === null) missing.push(ru['planet.hz.missingStTeff']);
  if (planet.L.value === null) missing.push(ru['planet.hz.missingL']);
  if (planet.d.value === null) missing.push(ru['planet.hz.missingD']);

  return missing.length === 0 ? ru['planet.hz.missingFallback'] : missing.join(', ');
}

/** Значения зоны обитаемости. */
export function HzInfo({ planet, hz, bounds, planetId }: HzInfoProps) {
  return (
    <section
      className="planet-hz"
      aria-labelledby={`planet-hz-${planetId}`}
      data-help-key="card.hz"
      data-help-planet={planetId}
    >
      <h3 className="planet-card__subtitle" id={`planet-hz-${planetId}`}>
        {ru['planet.hz.title']}
      </h3>

      <p className="planet-hz__bounds">
        {formatMessage(ru['planet.hz.bounds'], { bounds: boundsLabel(bounds) })}
      </p>

      {hz === null ? (
        <p className="planet-hz__missing" role="status">
          {formatMessage(ru['planet.hz.missing'], { list: missingList(planet) })}
        </p>
      ) : (
        <dl className="planet-hz__grid">
          <div className="planet-hz__row">
            <dt>
              {ru['planet.hz.dIn']}, <U sym="а.е." />
            </dt>
            <dd>{formatNum(hz.d_in)}</dd>
          </div>
          <div className="planet-hz__row">
            <dt>
              {ru['planet.hz.dOut']}, <U sym="а.е." />
            </dt>
            <dd>{formatNum(hz.d_out)}</dd>
          </div>
          <div className="planet-hz__row">
            <dt>{ru['planet.hz.HZD']}</dt>
            <dd>{formatNum(hz.HZD)}</dd>
          </div>
          <div className="planet-hz__row">
            <dt>{ru['planet.hz.F_HZ']}</dt>
            <dd>{hz.F_HZ === null ? EMPTY_VALUE : formatPercent(hz.F_HZ)}</dd>
          </div>
        </dl>
      )}
    </section>
  );
}
