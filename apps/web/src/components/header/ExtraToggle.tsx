import { useId } from 'react';
import { useStore } from 'zustand';

import { ru } from '../../i18n/ru';
import { appStore, type AppStore } from '../../state/store';
import { useExtra } from '../../extra/useExtra';

/**
 * Переключатель «Показать дополнительные данные» (задача 18; п. 11.2).
 *
 * Настоящий `input[type=checkbox]` с `role="switch"`: управляется клавишей
 * пробела и озвучивается программами экранного доступа как переключатель.
 * По умолчанию выключен; значение хранится в `sessionStorage` и переживает
 * обновление страницы в рамках сессии (см. `store.setShowExtraData`).
 *
 * Подсказка — `data-help-key="extra.toggle"` (задача 17).
 */

/** Пропсы переключателя. */
export interface ExtraToggleProps {
  /** Хранилище; в тестах подставляется изолированный экземпляр. */
  store?: AppStore;
}

/** Переключатель служебных данных. */
export function ExtraToggle({ store = appStore }: ExtraToggleProps) {
  const inputId = useId();
  const showExtraData = useExtra(store);
  const setShowExtraData = useStore(store, (state) => state.setShowExtraData);

  return (
    <label className="extra-toggle" htmlFor={inputId}>
      <input
        id={inputId}
        type="checkbox"
        role="switch"
        className="extra-toggle__input"
        checked={showExtraData}
        aria-checked={showExtraData}
        data-help-key="extra.toggle"
        onChange={(event) => setShowExtraData(event.target.checked)}
      />
      <span className="extra-toggle__track" aria-hidden="true" />
      <span className="extra-toggle__label">{ru['extra.toggle']}</span>
    </label>
  );
}
