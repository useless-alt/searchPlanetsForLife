import {
  surfaceTemperature,
  type ParamValue,
  type Provenance,
  type ResolvedPlanet,
} from '@exo/shared';
import { Fragment } from 'react';

import { ExtraOnly } from '../../extra/ExtraOnly';
import { U, type UnitSymbol } from '../../help/U';
import { formatMessage, ru, SOURCE_NAME_KEYS } from '../../i18n/ru';
import { approx, formatDist, formatNum, formatTemp } from '../../lib/format';
import type { AppStore } from '../../state/store';
import { Table, TableBody, TableHead, TableRow } from '../ui';
import { OriginBadge } from './OriginBadge';

/**
 * Таблица параметров планеты (задача 19; п. 10.7, 13.5).
 *
 * Строки и значения получают `data-help-key="val.<id>"` и `data-help-planet`:
 * подсказка задачи 17 открывается и с подписи, и с числа. Происхождение
 * показано текстовым маркером (`OriginBadge`), поэтому цвет не единственный
 * признак. Расчётные значения (`model`, `estimate`) помечены префиксом `~`.
 */

/** Описание одной строки таблицы. */
interface ParamRow {
  /** Идентификатор величины. */
  id: string;
  /** Подпись строки. */
  label: string;
  /** Единица измерения; undefined — без единицы. */
  unit?: UnitSymbol;
  /** Значение; null — отсутствует. */
  value: number | null;
  /** Происхождение значения. */
  provenance: Provenance | null;
  /** Формат значения из задачи 16. */
  format: (value: number | null) => string;
  /** Альтернативные значения других источников. */
  alternatives: ParamValue['alternatives'];
}

/** Единицы и формат строк. */
function rows(planet: ResolvedPlanet): ParamRow[] {
  return [
    {
      id: 'R',
      label: ru['planet.params.radius'],
      unit: 'R⊕',
      value: planet.R.value,
      provenance: planet.R.provenance,
      format: formatNum,
      alternatives: planet.R.alternatives,
    },
    {
      id: 'M',
      label: ru['planet.params.mass'],
      unit: 'M⊕',
      value: planet.M.value,
      provenance: planet.M.provenance,
      format: formatNum,
      alternatives: planet.M.alternatives,
    },
    {
      id: 'rho',
      label: ru['planet.params.density'],
      unit: 'г/см³',
      value: planet.rho.value,
      provenance: planet.rho.provenance,
      format: formatNum,
      alternatives: planet.rho.alternatives,
    },
    {
      id: 'e',
      label: ru['planet.params.eccentricity'],
      value: planet.e.value,
      provenance: planet.e.provenance,
      format: formatNum,
      alternatives: planet.e.alternatives,
    },
    {
      id: 'd',
      label: ru['planet.params.semiMajor'],
      unit: 'а.е.',
      value: planet.d.value,
      provenance: planet.d.provenance,
      format: formatNum,
      alternatives: planet.d.alternatives,
    },
    {
      id: 'P',
      label: ru['planet.params.period'],
      unit: 'дн',
      value: planet.P.value,
      provenance: planet.P.provenance,
      format: formatNum,
      alternatives: planet.P.alternatives,
    },
    {
      id: 'S',
      label: ru['planet.params.flux'],
      value: planet.S.value,
      provenance: planet.S.provenance,
      format: formatNum,
      alternatives: planet.S.alternatives,
    },
    {
      id: 'T_s',
      label: ru['planet.params.tSurface'],
      unit: 'K',
      // T_s = T_eq + 33 K; происхождение берётся от T_eq (п. 10.7).
      value: surfaceTemperature(planet.T_eq.value),
      provenance: planet.T_eq.provenance,
      format: formatTemp,
      // Альтернативы T_eq пересчитываются в T_s = T_eq + 33 K.
      alternatives: planet.T_eq.alternatives.map((alternative) => ({
        ...alternative,
        value: alternative.value + 33,
      })),
    },
    {
      id: 'T_star',
      label: ru['planet.params.starTemp'],
      unit: 'K',
      value: planet.st_teff.value,
      provenance: planet.st_teff.provenance,
      format: formatTemp,
      alternatives: planet.st_teff.alternatives,
    },
    {
      id: 'R_sun',
      label: ru['planet.params.starRadius'],
      unit: 'R☉',
      value: planet.st_rad.value,
      provenance: planet.st_rad.provenance,
      format: formatNum,
      alternatives: planet.st_rad.alternatives,
    },
    {
      id: 'L_sun',
      label: ru['planet.params.starLuminosity'],
      unit: 'L☉',
      value: planet.L.value,
      provenance: planet.L.provenance,
      format: formatNum,
      alternatives: planet.L.alternatives,
    },
    {
      id: 'st_mass',
      label: ru['planet.params.starMass'],
      unit: 'M☉',
      value: planet.st_mass.value,
      provenance: planet.st_mass.provenance,
      format: formatNum,
      alternatives: planet.st_mass.alternatives,
    },
    {
      id: 'dist_pc',
      label: ru['planet.params.distance'],
      unit: 'пк',
      value: planet.dist_pc.value,
      provenance: planet.dist_pc.provenance,
      format: formatDist,
      alternatives: planet.dist_pc.alternatives,
    },
  ];
}

/** Пропсы таблицы параметров. */
export interface ParamTableProps {
  /** Разрешённая планета. */
  planet: ResolvedPlanet;
  /** Идентификатор планеты для подсказок. */
  planetId: string;
  /** Хранилище для режима служебных данных. */
  store?: AppStore;
}

/** Таблица параметров планеты и звезды. */
export function ParamTable({ planet, planetId, store }: ParamTableProps) {
  const items = rows(planet);

  return (
    <section className="planet-params" aria-labelledby={`planet-params-${planetId}`}>
      <h3 className="planet-card__subtitle" id={`planet-params-${planetId}`}>
        {ru['planet.params.title']}
      </h3>

      <Table className="planet-params__table">
        <TableHead>
          <TableRow>
            <th scope="col">{ru['planet.params.column']}</th>
            <th scope="col" className="ui-table__number">
              {ru['planet.params.value']}
            </th>
            <th scope="col">{ru['planet.origin.label']}</th>
          </TableRow>
        </TableHead>

        <TableBody>
          {items.map((row) => {
            const text = approx(row.format(row.value), row.provenance);

            return (
              <Fragment key={row.id}>
                <TableRow data-help-key={`val.${row.id}`} data-help-planet={planetId}>
                  <th scope="row" className="planet-params__label">
                    {row.label}
                    {row.unit === undefined ? null : (
                      <>
                        {' ['}
                        <U sym={row.unit} />
                        {']'}
                      </>
                    )}
                  </th>

                  <td
                    className="ui-table__number planet-params__value"
                    data-help-key={`val.${row.id}`}
                    data-help-planet={planetId}
                  >
                    {text}
                  </td>

                  <td className="planet-params__origin">
                    <OriginBadge provenance={row.provenance} planetId={planetId} />
                  </td>
                </TableRow>

                {row.alternatives.length > 0 ? (
                  <ExtraOnly id="card.alternatives" store={store}>
                    <TableRow>
                      <td className="planet-params__alt" colSpan={3}>
                        {row.alternatives.map((alternative) => (
                          <span
                            key={`${alternative.source}-${alternative.value}-${alternative.sourceDate ?? ''}`}
                            className="planet-params__alt-item"
                          >
                            {formatMessage(ru['planet.alternatives'], {
                              source: ru[SOURCE_NAME_KEYS[alternative.source]],
                              value: row.format(alternative.value),
                            })}
                          </span>
                        ))}
                      </td>
                    </TableRow>
                  </ExtraOnly>
                ) : null}
              </Fragment>
            );
          })}
        </TableBody>
      </Table>
    </section>
  );
}
