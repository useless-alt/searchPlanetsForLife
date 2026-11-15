import { useMemo } from 'react';
import { useStore } from 'zustand';

import { formatMessage, ru, type RuKey } from '../../i18n/ru';
import { computeEarthCalibration, type CalibrationLevel } from '../../lib/earthCalibration';
import { appStore, type AppStore } from '../../state/store';

/**
 * Диагностический блок «Земля (эталон)» (задача 15; п. 13.3, U11, U35).
 *
 * Блок только показывает калибровку: эталон прогоняется тем же кодом, что и
 * каталог. Переключатель и блок не влияют на ранжирование, таблицу и карту.
 */

/** Подписи уровней калибровки. */
const LEVEL_KEYS: Record<CalibrationLevel, RuKey> = {
  high: 'filters.calibration.high',
  medium: 'filters.calibration.medium',
  low: 'filters.calibration.low',
};

/** Форматирует F_HZ с двумя знаками; null — прочерк. */
function formatFHz(value: number | null): string {
  return value === null || !Number.isFinite(value) ? '—' : value.toFixed(2);
}

/** Пропсы блока калибровки. */
export interface EarthReferenceProps {
  /** Хранилище; в тестах подставляется изолированный экземпляр. */
  store?: AppStore;
}

/** Контрольные значения эталона и доля пройденных проверок. */
export function EarthReference({ store = appStore }: EarthReferenceProps = {}) {
  const hzBounds = useStore(store, (state) => state.settings.hzBounds);

  // Расчёт дешёвый (одна эталонная запись), но не повторяется на каждый рендер.
  const calibration = useMemo(() => computeEarthCalibration(hzBounds), [hzBounds]);

  return (
    <section className="filters__earth" aria-label={ru['filters.earth']}>
      <p className="filters__earth-reference">{ru['filters.earth.reference']}</p>

      <p>
        {formatMessage(ru['filters.earth.fHz'], {
          value: formatFHz(calibration.fHzCurrent),
        })}
      </p>

      {hzBounds === 'conservative' ? (
        <p className="filters__note">{ru['filters.earth.optimisticNote']}</p>
      ) : null}

      <p className="filters__share" data-help-key="filters.earthShare">
        {formatMessage(ru['filters.earth.share'], {
          share: calibration.sharePercent.toFixed(1),
        })}
      </p>

      <p>
        {formatMessage(ru['filters.earth.level'], {
          level: ru[LEVEL_KEYS[calibration.level]],
        })}
      </p>
    </section>
  );
}
