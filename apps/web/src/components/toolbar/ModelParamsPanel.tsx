import { DEFAULT_SETTINGS, type ModelSettings } from '@exo/shared';
import { useEffect, useId, useRef, useState } from 'react';
import { useStore } from 'zustand';

import { formatMessage, ru } from '../../i18n/ru';
import { appStore, type AppStore } from '../../state/store';
import { Button, Checkbox, Panel, SegmentedControl, Slider } from '../ui';

/**
 * Панель «Параметры модели» (задача 14; п. 3.2, 4.1, 10.4, 13.2).
 *
 * Панель работает с локальным черновиком: изменения применяются одной
 * кнопкой «Применить» и вызывают ровно один пересчёт. Закрытие панели без
 * применения (Esc, клик вне панели, «Закрыть») черновик отбрасывает.
 *
 * Зависимость от режима (U20): в «Упрощённом ESI» и «Строгом научном»
 * штрафы не применяются, поэтому четыре флажка отключены; в «Упрощённом ESI»
 * не используется и зона обитаемости. Ползунок Q_data доступен всегда.
 * Отключённые элементы сохраняют свои значения.
 */

/** Поля настроек, которыми управляет панель. */
type DraftSettings = Pick<ModelSettings, 'hzBounds' | 'penalties' | 'qMin'>;

/** Снимок настроек для черновика. */
function pickDraft(settings: ModelSettings): DraftSettings {
  return {
    hzBounds: settings.hzBounds,
    penalties: { ...settings.penalties },
    qMin: settings.qMin,
  };
}

/** Совпадает ли черновик с текущими настройками. */
function sameDraft(a: DraftSettings, b: DraftSettings): boolean {
  return (
    a.hzBounds === b.hzBounds &&
    Math.abs(a.qMin - b.qMin) < 1e-9 &&
    a.penalties.rocky === b.penalties.rocky &&
    a.penalties.ecc === b.penalties.ecc &&
    a.penalties.star === b.penalties.star &&
    a.penalties.qdata === b.penalties.qdata
  );
}

/** Пропсы панели параметров. */
export interface ModelParamsPanelProps {
  /** Открыта ли панель. */
  open: boolean;
  /** Обработчик закрытия без применения. */
  onClose: () => void;
  /** Хранилище; в тестах подставляется изолированный экземпляр. */
  store?: AppStore;
}

/** Панель «Параметры модели». */
export function ModelParamsPanel({ open, onClose, store = appStore }: ModelParamsPanelProps) {
  const settings = useStore(store, (state) => state.settings);
  const mode = useStore(store, (state) => state.settings.mode);
  const applySettings = useStore(store, (state) => state.applySettings);
  const resetSettings = useStore(store, (state) => state.resetSettings);

  const [draft, setDraft] = useState<DraftSettings>(() => pickDraft(settings));
  const wasOpen = useRef(false);
  const panelContent = useRef<HTMLDivElement>(null);
  const penaltiesTitleId = useId();
  const penaltiesNoteId = useId();
  const hzNoteId = useId();

  // Каждое открытие начинает черновик с текущих настроек, а не с прежней
  // несохранённой правки. Изменение настроек при открытой панели (например,
  // сброс) черновик не перетирает: его синхронизирует сам обработчик сброса.
  useEffect(() => {
    if (open && !wasOpen.current) setDraft(pickDraft(settings));
    wasOpen.current = open;
  }, [open, settings]);

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

  const penaltiesDisabled = mode === 'classic_esi' || mode === 'strict';
  const hzDisabled = mode === 'classic_esi';
  const dirty = !sameDraft(draft, settings);

  const setPenalty = (key: keyof DraftSettings['penalties'], value: boolean): void => {
    setDraft((current) => ({
      ...current,
      penalties: { ...current.penalties, [key]: value },
    }));
  };

  const handleApply = (): void => {
    applySettings(draft);
    onClose();
  };

  const handleReset = (): void => {
    resetSettings();
    setDraft({
      hzBounds: DEFAULT_SETTINGS.hzBounds,
      penalties: { ...DEFAULT_SETTINGS.penalties },
      qMin: DEFAULT_SETTINGS.qMin,
    });
  };

  const penaltyItems = [
    { key: 'rocky', helpKey: 'params.rocky', label: ru['params.rocky'] },
    { key: 'ecc', helpKey: 'params.ecc', label: ru['params.ecc'] },
    { key: 'star', helpKey: 'params.star', label: ru['params.star'] },
    { key: 'qdata', helpKey: 'params.qdata', label: ru['params.qdata'] },
  ] as const;

  const hzOptions = [
    {
      value: 'conservative' as const,
      label: ru['params.hz.conservative'],
      helpKey: 'params.hzBounds',
      disabled: hzDisabled,
    },
    {
      value: 'optimistic' as const,
      label: ru['params.hz.optimistic'],
      helpKey: 'params.hzBounds',
      disabled: hzDisabled,
    },
  ];

  return (
    <>
      {open ? (
        <div className="model-params__backdrop" aria-hidden="true" onMouseDown={onClose} />
      ) : null}

      <Panel
        open={open}
        title={ru['params.title']}
        onClose={onClose}
        closeLabel={ru['params.close']}
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={handleReset}>
              {ru['params.reset']}
            </Button>
            <Button variant="primary" size="sm" disabled={!dirty} onClick={handleApply}>
              {ru['params.apply']}
            </Button>
          </>
        }
      >
        <div className="model-params" ref={panelContent}>
          <section
            className="model-params__group"
            data-help-key="params.hzBounds"
            aria-describedby={hzDisabled ? hzNoteId : undefined}
          >
            <h3 className="model-params__title">{ru['params.hzBounds']}</h3>
            <SegmentedControl
              label={ru['params.hzBounds']}
              value={draft.hzBounds}
              options={hzOptions}
              onChange={(hzBounds) => setDraft((current) => ({ ...current, hzBounds }))}
            />
            {hzDisabled ? (
              <p className="model-params__note" id={hzNoteId}>
                {ru['params.disabledHz']}
              </p>
            ) : null}
          </section>

          <section
            className="model-params__group"
            aria-labelledby={penaltiesTitleId}
            aria-describedby={penaltiesDisabled ? penaltiesNoteId : undefined}
          >
            <h3 className="model-params__title" id={penaltiesTitleId}>
              {ru['params.penalties']}
            </h3>

            <div className="model-params__checks">
              {penaltyItems.map((item) => (
                <div key={item.key} data-help-key={item.helpKey}>
                  <Checkbox
                    label={item.label}
                    checked={draft.penalties[item.key]}
                    disabled={penaltiesDisabled}
                    onChange={(checked) => setPenalty(item.key, checked)}
                  />
                </div>
              ))}
            </div>

            {penaltiesDisabled ? (
              <p className="model-params__note" id={penaltiesNoteId}>
                {ru['params.disabledPenalties']}
              </p>
            ) : null}
          </section>

          <div className="model-params__group" data-help-key="params.qMin">
            <Slider
              label={ru['params.qMin']}
              value={Math.round(draft.qMin * 100)}
              min={75}
              max={100}
              step={1}
              format={(value) => formatMessage(ru['params.qMinValue'], { value })}
              onChange={(value) => setDraft((current) => ({ ...current, qMin: value / 100 }))}
            />
          </div>
        </div>
      </Panel>
    </>
  );
}
