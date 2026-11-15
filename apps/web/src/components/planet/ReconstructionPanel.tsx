import { explainParam, type Provenance } from '@exo/shared';
import { useEffect, useId, useState } from 'react';
import { useStore } from 'zustand';

import { ru } from '../../i18n/ru';
import { approx, formatNum, formatTemp } from '../../lib/format';
import { appStore, type AppStore } from '../../state/store';
import { Button, Checkbox } from '../ui';
import { OriginBadge } from './OriginBadge';
import { ParamSourceDialog } from './ParamSourceDialog';

/**
 * Панель «Данные реконструкции» (задача 28; п. 4.3, 9.5, 13.5).
 *
 * По умолчанию показывает только восстановленные параметры — `physics`,
 * `model` и `estimate`. Переключатель «Показать все параметры» добавляет
 * измеренные значения. Клик по чипу (или Enter) открывает диалог с
 * формулой, входами, точностью и источником.
 */

/** Ключевые параметры сводки в порядке ТЗ. */
const PARAM_KEYS = ['R', 'M', 'e', 'd', 'P', 'T_s', 'rho', 'L', 'st_teff', 'st_rad', 'st_mass'];

/** Восстановленные происхождения, показываемые по умолчанию. */
const RECONSTRUCTED: ReadonlySet<Provenance> = new Set(['physics', 'model', 'estimate']);

/** Обозначения параметров для чипов. */
const PARAM_SYMBOLS: Record<string, string> = {
  R: 'R',
  M: 'M',
  e: 'e',
  d: 'd',
  P: 'P',
  T_s: 'T_s',
  rho: 'ρ',
  L: 'L',
  st_teff: 'T звезды',
  st_rad: 'R звезды',
  st_mass: 'M звезды',
};

/** Пропсы панели. */
export interface ReconstructionPanelProps {
  /** Хранилище; в тестах подставляется изолированный экземпляр. */
  store?: AppStore;
}

/** Значение с единицей и пометкой расчёта. */
function chipValue(key: string, value: number | null, provenance: Provenance | null): string {
  const text =
    value === null
      ? ru['reconstruction.noValue']
      : key === 'T_s' || key === 'T_eq' || key === 'st_teff'
        ? formatTemp(value)
        : formatNum(value);

  return approx(text, provenance);
}

/** Панель реконструкции. */
export function ReconstructionPanel({ store = appStore }: ReconstructionPanelProps) {
  const planetId = useStore(store, (state) => state.selectedPlanetId);
  const resolved = useStore(store, (state) =>
    planetId === null ? undefined : state.resolvedCache[planetId],
  );
  const loadResolved = useStore(store, (state) => state.loadResolved);
  const [showAll, setShowAll] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const headingId = useId();
  const planet = resolved ?? null;

  useEffect(() => {
    if (planetId !== null && resolved === undefined) void loadResolved([planetId]);
  }, [loadResolved, planetId, resolved]);

  if (planetId === null) return null;

  const rows =
    planet === null
      ? []
      : PARAM_KEYS.map((key) => {
          const explanation = explainParam(key, planet);

          return {
            key,
            value: explanation.value,
            provenance: explanation.provenance,
          };
        }).filter(
          (row) =>
            row.value !== null &&
            row.provenance !== null &&
            (showAll || RECONSTRUCTED.has(row.provenance)),
        );

  const explanation =
    planet !== null && selectedKey !== null ? explainParam(selectedKey, planet) : null;

  return (
    <section
      className="planet-reconstruction"
      aria-labelledby={headingId}
      data-help-key="card.reconstruction"
      data-layer="panel"
      data-cluster="planet"
      data-ui-text
    >
      <h3 className="planet-card__subtitle" id={headingId}>
        {ru['reconstruction.title']}
      </h3>

      <Checkbox label={ru['reconstruction.showAll']} checked={showAll} onChange={setShowAll} />

      {planet === null ? (
        <p className="planet-card__note" role="status">
          {ru['reconstruction.loading']}
        </p>
      ) : rows.length === 0 ? (
        <p className="planet-card__note">{ru['reconstruction.allMeasured']}</p>
      ) : (
        <ul className="reconstruction-chips">
          {rows.map((row) => (
            <li key={row.key}>
              <Button
                variant="ghost"
                size="sm"
                className="reconstruction-chip"
                onClick={() => setSelectedKey(row.key)}
              >
                <span className="reconstruction-chip__value">
                  {PARAM_SYMBOLS[row.key] ?? row.key}{' '}
                  {chipValue(row.key, row.value, row.provenance)}
                </span>
                <span className="reconstruction-chip__separator" aria-hidden="true">
                  ·
                </span>
                <OriginBadge provenance={row.provenance} planetId={planetId} />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <ParamSourceDialog
        open={explanation !== null}
        explanation={explanation}
        onClose={() => setSelectedKey(null)}
        planetId={planetId}
      />
    </section>
  );
}
