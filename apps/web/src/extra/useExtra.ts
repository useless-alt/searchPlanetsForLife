import { useStore } from 'zustand';

import { appStore, type AppStore } from '../state/store';

/**
 * Режим «Показать дополнительные данные» (задача 18; п. 11.2).
 *
 * Возвращает текущее значение `showExtraData`. Хук не меняет состояние:
 * переключатель вызывает `setShowExtraData`, а расчёты от режима не зависят.
 *
 * Параметр `store` нужен тестам и компонентам с изолированным хранилищем;
 * в приложении используется синглтон.
 */
export function useExtra(store: AppStore = appStore): boolean {
  return useStore(store, (state) => state.showExtraData);
}
