import { Q_SLIDER_MIN } from '@exo/shared';
import { useStore } from 'zustand';

import { ExtraOnly } from '../../extra/ExtraOnly';
import { formatMessage, ru } from '../../i18n/ru';
import { appStore, type AppStore } from '../../state/store';
import { Badge, Button } from '../ui';

/**
 * Кнопка «Параметры модели» с бейджем активного порога Q_data
 * (задача 14; п. 3.2, 13.2).
 *
 * Бейдж «Q ≥ N%» виден, если порог поднят выше нижней границы ползунка
 * (`qMin > 0.75`) или включён режим «Показать дополнительные данные»:
 * активный фильтр скрывать нельзя (11.2, U12). В режиме служебных данных
 * бейдж помечается `data-extra="toolbar.qBadge"` (задача 18).
 */

/** Пропсы кнопки панели параметров. */
export interface ModelParamsButtonProps {
  /** Хранилище; в тестах подставляется изолированный экземпляр. */
  store?: AppStore;
}

/** Кнопка открытия панели «Параметры модели». */
export function ModelParamsButton({ store = appStore }: ModelParamsButtonProps = {}) {
  const open = useStore(store, (state) => state.modelPanelOpen);
  const qMin = useStore(store, (state) => state.settings.qMin);
  const showExtraData = useStore(store, (state) => state.showExtraData);
  const setModelPanelOpen = useStore(store, (state) => state.setModelPanelOpen);

  const qMinPercent = Math.round(qMin * 100);
  const showBadge = qMin > Q_SLIDER_MIN + 1e-9 || showExtraData;
  const badge = <Badge label={formatMessage(ru['params.badgeQ'], { value: qMinPercent })} />;

  return (
    <Button
      variant="secondary"
      size="sm"
      aria-expanded={open}
      onClick={() => setModelPanelOpen(!open)}
    >
      {ru['params.button']}
      {showBadge ? (
        showExtraData ? (
          <ExtraOnly id="toolbar.qBadge" store={store}>
            {badge}
          </ExtraOnly>
        ) : (
          badge
        )
      ) : null}
    </Button>
  );
}
