import { DEFAULT_FILTERS } from '@exo/shared';
import { useEffect, useRef, useState } from 'react';
import { useStore } from 'zustand';

import { formatMessage, ru } from '../../i18n/ru';
import { appStore, type AppStore } from '../../state/store';
import { Button, Checkbox, Panel } from '../ui';
import { EarthReference } from './EarthReference';
import {
  draftFromFilters,
  isDraftDirty,
  validateDraft,
  type FilterDraft,
} from './filterValidation';
import { RangeField } from './RangeField';
import { SpectralClassPicker } from './SpectralClassPicker';

/**
 * Панель фильтров (задача 15; п. 10.5, 13.3).
 *
 * Значения редактируются в локальном черновике и попадают в `FilterState`
 * только по кнопке «Применить фильтры» — одним `setFilters` и одним
 * пересчётом. Закрытие без применения черновик отбрасывает.
 *
 * «Земля (эталон)» — исключение: переключатель меняет `filters.earthReference`
 * сразу, потому что на состав Топ-50 не влияет (U35).
 */

/** Пропсы панели фильтров. */
export interface FiltersPanelProps {
  /** Открыта ли панель. */
  open: boolean;
  /** Обработчик закрытия без применения. */
  onClose: () => void;
  /** Хранилище; в тестах подставляется изолированный экземпляр. */
  store?: AppStore;
}

/** Панель фильтров и калибровки. */
export function FiltersPanel({ open, onClose, store = appStore }: FiltersPanelProps) {
  const filters = useStore(store, (state) => state.filters);
  const counters = useStore(store, (state) => state.counters);
  const setFilters = useStore(store, (state) => state.setFilters);
  const resetFilters = useStore(store, (state) => state.resetFilters);

  const [draft, setDraft] = useState<FilterDraft>(() => draftFromFilters(filters));
  const wasOpen = useRef(false);
  const panelContent = useRef<HTMLDivElement>(null);

  // Каждое открытие начинает черновик с применённых фильтров.
  useEffect(() => {
    if (open && !wasOpen.current) setDraft(draftFromFilters(filters));
    wasOpen.current = open;
  }, [open, filters]);

  // Клик вне панели закрывает её без применения черновика.
  useEffect(() => {
    if (!open) return undefined;

    const handleMouseDown = (event: MouseEvent): void => {
      const panel = panelContent.current?.closest('.ui-panel');

      if (panel != null && event.target instanceof Node && panel.contains(event.target)) return;

      onClose();
    };

    document.addEventListener('mousedown', handleMouseDown);

    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [onClose, open]);

  const validation = validateDraft(draft);
  const dirty = isDraftDirty(draft, filters);
  const canApply = dirty && validation.valid;
  const matching = counters?.matching ?? 0;
  const total = counters?.total ?? 0;
  const hasNoMatches = counters !== null && counters.matching === 0;

  const updateRange = (key: 'radius' | 'T_s' | 'e', value: FilterDraft['radius']): void => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const handleApply = (): void => {
    if (!canApply) return;

    setFilters({
      spectralClasses: draft.spectralClasses,
      radius: validation.values.radius,
      T_s: validation.values.T_s,
      e: validation.values.e,
    });
    onClose();
  };

  const handleReset = (): void => {
    resetFilters();
    setDraft(draftFromFilters(DEFAULT_FILTERS));
  };

  return (
    <>
      {open ? <div className="filters__backdrop" aria-hidden="true" onMouseDown={onClose} /> : null}

      <Panel
        open={open}
        title={ru['filters.title']}
        onClose={onClose}
        closeLabel={ru['params.close']}
        footer={
          <Button variant="primary" size="sm" disabled={!canApply} onClick={handleApply}>
            {ru['filters.apply']}
          </Button>
        }
      >
        <div className="filters" ref={panelContent}>
          <p className="filters__counter" aria-live="polite">
            {formatMessage(ru['filters.matching'], { matching, total })}
          </p>

          {hasNoMatches ? (
            <div className="filters__empty">
              <p className="filters__empty-text">{ru['filters.empty']}</p>
              <Button variant="secondary" size="sm" onClick={handleReset}>
                {ru['toolbar.resetFilters']}
              </Button>
            </div>
          ) : null}

          <section className="filters__group">
            <h3 className="filters__title">{ru['filters.spectralClass']}</h3>
            <SpectralClassPicker
              value={draft.spectralClasses}
              onChange={(spectralClasses) =>
                setDraft((current) => ({ ...current, spectralClasses }))
              }
            />
          </section>

          <RangeField
            label={ru['filters.radius']}
            value={draft.radius}
            errors={validation.errors.radius}
            helpKey="filters.radius"
            onChange={(value) => updateRange('radius', value)}
          />

          <RangeField
            label={ru['filters.tSurface']}
            value={draft.T_s}
            errors={validation.errors.T_s}
            helpKey="filters.tSurface"
            minPlaceholder={ru['filters.tsMinPlaceholder']}
            maxPlaceholder={ru['filters.tsMaxPlaceholder']}
            onChange={(value) => updateRange('T_s', value)}
          />

          <RangeField
            label={ru['filters.e']}
            value={draft.e}
            errors={validation.errors.e}
            helpKey="filters.e"
            onChange={(value) => updateRange('e', value)}
          />

          <section className="filters__group" data-help-key="filters.earth">
            <Checkbox
              label={ru['filters.earth']}
              checked={filters.earthReference}
              onChange={(checked) => setFilters({ earthReference: checked })}
            />
            {filters.earthReference ? <EarthReference store={store} /> : null}
          </section>
        </div>
      </Panel>
    </>
  );
}
