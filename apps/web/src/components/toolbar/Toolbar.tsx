import { useStore } from 'zustand';

import { ru } from '../../i18n/ru';
import { selectActiveFilterCount } from '../../state/selectors';
import { appStore, type AppStore } from '../../state/store';
import { FiltersPanel } from '../filters/FiltersPanel';
import { Badge, Button, Checkbox } from '../ui';
import { ModelParamsButton } from './ModelParamsButton';
import { ModelParamsPanel } from './ModelParamsPanel';
import { SearchBox } from './SearchBox';

/**
 * Панель инструментов под шапкой (задачи 14–15; п. 13.2, 13.3).
 *
 * Состав слева направо: поиск, «Параметры модели» с бейджем активного порога,
 * «Фильтры» с числом активных групп, «Показывать кандидатов»,
 * «Сбросить настройки», «Сбросить фильтры».
 *
 * Поиск не фильтрует таблицу: он только подсвечивает совпадения и даёт
 * выбрать планету, даже если её нет в текущем Топ-50 (13.2).
 */

/** Пропсы панели инструментов. */
export interface ToolbarProps {
  /** Хранилище; в тестах подставляется изолированный экземпляр. */
  store?: AppStore;
}

/** Панель инструментов. */
export function Toolbar({ store = appStore }: ToolbarProps = {}) {
  const includeCandidates = useStore(store, (state) => state.filters.includeCandidates);
  const filtersPanelOpen = useStore(store, (state) => state.filtersPanelOpen);
  const modelPanelOpen = useStore(store, (state) => state.modelPanelOpen);
  const activeFilterCount = useStore(store, selectActiveFilterCount);
  const setFilters = useStore(store, (state) => state.setFilters);
  const setFiltersPanelOpen = useStore(store, (state) => state.setFiltersPanelOpen);
  const setModelPanelOpen = useStore(store, (state) => state.setModelPanelOpen);
  const resetSettings = useStore(store, (state) => state.resetSettings);
  const resetFilters = useStore(store, (state) => state.resetFilters);

  return (
    <>
      <div className="toolbar" role="toolbar" aria-label={ru['toolbar.label']}>
        <SearchBox store={store} />

        <div className="toolbar__actions">
          <ModelParamsButton store={store} />

          <Button
            variant="secondary"
            size="sm"
            aria-expanded={filtersPanelOpen}
            onClick={() => setFiltersPanelOpen(!filtersPanelOpen)}
          >
            {ru['toolbar.filters']}
            {activeFilterCount > 0 ? <Badge label={String(activeFilterCount)} /> : null}
          </Button>

          <Checkbox
            label={ru['toolbar.candidates']}
            checked={includeCandidates}
            onChange={(checked) => setFilters({ includeCandidates: checked })}
          />

          <Button variant="ghost" size="sm" onClick={resetSettings}>
            {ru['toolbar.resetSettings']}
          </Button>

          <Button variant="ghost" size="sm" onClick={resetFilters}>
            {ru['toolbar.resetFilters']}
          </Button>
        </div>
      </div>

      <ModelParamsPanel
        open={modelPanelOpen}
        onClose={() => setModelPanelOpen(false)}
        store={store}
      />

      <FiltersPanel
        open={filtersPanelOpen}
        onClose={() => setFiltersPanelOpen(false)}
        store={store}
      />
    </>
  );
}
