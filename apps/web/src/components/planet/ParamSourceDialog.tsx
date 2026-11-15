import type { ParamExplanation } from '@exo/shared';

import { HELP_ENTRIES } from '../../i18n/help.ru';
import { formatMessage, ru, SOURCE_NAME_KEYS } from '../../i18n/ru';
import { formatNum, formatTemp } from '../../lib/format';
import { Modal } from '../ui';
import { OriginBadge } from './OriginBadge';

/**
 * Диалог «Источник данных» (задача 28; п. 4.3, 9.5, 11.1).
 *
 * Показывает значение, происхождение, формулу, точность, входные данные и
 * источник. Закрывается по Esc; фокус возвращается на чип, который открыл
 * окно (ловушка фокуса живёт в `Modal`, задача 12a).
 */

/** Пропсы диалога. */
export interface ParamSourceDialogProps {
  /** Открыт ли диалог. */
  open: boolean;
  /** Объяснение параметра; null — данных нет. */
  explanation: ParamExplanation | null;
  /** Закрытие. */
  onClose: () => void;
  /** Идентификатор планеты для бейджа происхождения. */
  planetId: string;
}

/** Помощь по единице параметра: ближайшая запись словаря задачи 17. */
const UNIT_HELP_IDS: Record<string, string> = {
  R: 'R',
  M: 'M',
  rho: 'rho',
  e: 'e',
  d: 'd',
  P: 'P',
  S: 'S',
  T_eq: 'T_s',
  T_s: 'T_s',
  L: 'L',
  st_teff: 'T_star',
  st_rad: 'R_sun',
  st_mass: 'st_mass',
  dist_pc: 'dist_pc',
};

/** Форматирует значение параметра с учётом температуры. */
function formatValue(key: string, value: number | null): string {
  if (value === null) return ru['paramSource.noValue'];
  return key === 'T_eq' || key === 'T_s' || key === 'st_teff'
    ? formatTemp(value)
    : formatNum(value);
}

/** Единица параметра или пустая строка. */
function unitOf(key: string): string {
  const id = UNIT_HELP_IDS[key];

  if (id === undefined) return '';

  return HELP_ENTRIES[id]?.units ?? '';
}

/** Диалог объяснения параметра. */
export function ParamSourceDialog({
  open,
  explanation,
  onClose,
  planetId,
}: ParamSourceDialogProps) {
  if (explanation === null) return null;

  const unit = unitOf(explanation.key);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={explanation.label}
      closeLabel={ru['paramSource.close']}
      className="param-source"
    >
      <div className="param-source__body" data-layer="overlay" data-cluster="planet" data-ui-text>
        <div className="param-source__value">
          <span className="param-source__label">{ru['paramSource.value']}</span>
          <span className="param-source__number">
            {formatValue(explanation.key, explanation.value)}
          </span>
          {unit === '' ? null : <span className="param-source__unit">{unit}</span>}
        </div>

        <div className="param-source__row">
          <span className="param-source__label">{ru['paramSource.origin']}</span>
          <OriginBadge provenance={explanation.provenance} planetId={planetId} />
        </div>

        <div className="param-source__row param-source__row--block">
          <span className="param-source__label">{ru['paramSource.how']}</span>
          <p className="param-source__text">{explanation.how}</p>
          {explanation.formula === null ? null : (
            <pre className="param-source__formula">
              <code>{explanation.formula}</code>
            </pre>
          )}
        </div>

        <div className="param-source__row">
          <span className="param-source__label">{ru['paramSource.accuracy']}</span>
          <span className="param-source__text">
            {explanation.accuracy ?? ru['paramSource.accuracyUnknown']}
          </span>
        </div>

        <div className="param-source__row param-source__row--block">
          <span className="param-source__label">{ru['paramSource.inputs']}</span>
          {explanation.inputs.length === 0 ? (
            <p className="param-source__text">{ru['paramSource.noInputs']}</p>
          ) : (
            <table className="param-source__table">
              <thead>
                <tr>
                  <th scope="col">{ru['paramSource.inputKey']}</th>
                  <th scope="col" className="ui-table__number">
                    {ru['paramSource.inputValue']}
                  </th>
                  <th scope="col">{ru['paramSource.inputOrigin']}</th>
                </tr>
              </thead>
              <tbody>
                {explanation.inputs.map((input) => (
                  <tr key={input.key}>
                    <th scope="row">{input.label}</th>
                    <td className="ui-table__number">{formatValue(input.key, input.value)}</td>
                    <td>
                      <OriginBadge provenance={input.provenance} planetId={planetId} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="param-source__row param-source__row--block">
          <span className="param-source__label">{ru['paramSource.source']}</span>
          {explanation.source === null ? (
            <p className="param-source__text">{ru['paramSource.noSource']}</p>
          ) : (
            <p className="param-source__text">
              {formatMessage(ru['paramSource.sourceValue'], {
                name: ru[SOURCE_NAME_KEYS[explanation.source.id]],
                date: explanation.source.date ?? ru['paramSource.noDate'],
              })}
              {explanation.source.fromBackup ? ru['paramSource.fromBackup'] : ''}
            </p>
          )}
        </div>

        {explanation.alternatives.length === 0 ? null : (
          <div className="param-source__row param-source__row--block">
            <span className="param-source__label">{ru['paramSource.alternatives']}</span>
            <ul className="param-source__alternatives">
              {explanation.alternatives.map((alternative) => (
                <li key={`${alternative.source}-${String(alternative.value)}`}>
                  {formatMessage(ru['paramSource.alternative'], {
                    name: ru[SOURCE_NAME_KEYS[alternative.source]],
                    value: formatValue(explanation.key, alternative.value),
                    date: alternative.date ?? ru['paramSource.noDate'],
                  })}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Modal>
  );
}
