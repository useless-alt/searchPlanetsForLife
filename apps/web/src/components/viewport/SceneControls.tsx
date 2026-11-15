import { useEffect, useState, type FocusEvent, type PointerEvent } from 'react';
import { makeScaleModel } from '@exo/shared';
import { useStore } from 'zustand';

import { hideHelp, showHelpAt } from '../../help/api';
import { formatMessage, ru } from '../../i18n/ru';
import { appStore, type AppStore } from '../../state/store';
import {
  listSystemLayers,
  subscribeSystemLayers,
  type SystemLayerDefinition,
} from '../../three/system/layers';
import { Button, SegmentedControl } from '../ui';

/**
 * Управление сценой системы по четырём углам вьюпорта (задача 22; 10.9, U14, U38, U47).
 *
 * Левый низ — цель [Планета]|[Звезда], правый низ — «Обзор», правый верх —
 * масштаб и переключатели зарегистрированных слоёв, левый верх — возврат на
 * карту. Недоступные варианты не блокируются HTML-атрибутом `disabled`:
 * `aria-disabled` оставляет подсказку с причиной доступной.
 */

/** Пропсы панели управления. */
export interface SceneControlsProps {
  /** Хранилище; в тестах подставляется изолированный экземпляр. */
  store?: AppStore;
}

/** Причина недоступности звезды по пробелам данных (п. 9.2). */
function starUnavailableReason(gaps: readonly string[]): string {
  const labels = gaps.map((gap) => {
    if (gap === 'st_teff') return ru['scene.gap.stTeff'];
    if (gap === 'L_or_st_rad') return ru['scene.gap.starRadius'];

    return gap;
  });

  return formatMessage(ru['scene.starMissing'], {
    list: labels.length === 0 ? ru['scene.gap.starFallback'] : labels.join(', '),
  });
}

/** Показывает подсказку с причиной недоступности. */
function showDisabledReason(element: HTMLElement): void {
  const key = element.dataset['helpKey'];
  const reason = element.dataset['helpDisabledReason'];

  if (key === undefined || reason === undefined || reason === '') return;

  const rect = element.getBoundingClientRect();

  showHelpAt({
    key,
    ctx: { disabledReason: reason },
    x: rect.left + rect.width / 2,
    y: rect.top,
  });
}

/** Скрывает подсказку, если у цели была причина. */
function hideDisabledReason(element: HTMLElement | null): void {
  if (element?.dataset['helpDisabledReason'] !== undefined) hideHelp();
}

/** Панель управления сценой системы. */
export function SceneControls({ store = appStore }: SceneControlsProps) {
  const sceneTarget = useStore(store, (state) => state.sceneTarget);
  const scaleMode = useStore(store, (state) => state.scaleMode);
  const showOrbit = useStore(store, (state) => state.showOrbit);
  const showHz = useStore(store, (state) => state.showHz);
  const detail = useStore(store, (state) => state.sceneDetail);
  const layerStatus = useStore(store, (state) => state.systemLayerStatus);
  const setSceneTarget = useStore(store, (state) => state.setSceneTarget);
  const setScaleMode = useStore(store, (state) => state.setScaleMode);
  const setShowOrbit = useStore(store, (state) => state.setShowOrbit);
  const setShowHz = useStore(store, (state) => state.setShowHz);
  const leaveSystem = useStore(store, (state) => state.leaveSystem);
  const requestSystemReset = useStore(store, (state) => state.requestSystemReset);
  const focusTable = useStore(store, (state) => state.focusTable);

  const [layers, setLayers] = useState<readonly SystemLayerDefinition[]>(() => listSystemLayers());

  useEffect(
    () =>
      subscribeSystemLayers(() => {
        setLayers(listSystemLayers());
      }),
    [],
  );

  const starStub = detail?.gaps.starStub ?? false;
  const starReason = starStub ? starUnavailableReason(detail?.gaps.star ?? []) : undefined;
  const orbitalDistance = detail?.resolved.d.value ?? null;
  const nominal =
    detail !== null &&
    (orbitalDistance === null || !Number.isFinite(orbitalDistance) || orbitalDistance <= 0);
  const scaleModel = detail === null ? null : makeScaleModel(detail.resolved, 'overview');
  const nominalSize = scaleModel !== null && (scaleModel.nominalStar || scaleModel.nominalPlanet);
  const scaleReason = nominalSize ? ru['scene.nominalSizeReason'] : ru['scene.nominalReason'];
  const realDisabled = nominal || nominalSize;

  const orbitLayer = layers.find((layer) => layer.toggleKey === 'showOrbit');
  const hzLayer = layers.find((layer) => layer.toggleKey === 'showHz');

  /** Обработчик подсказки для сегментированного переключателя. */
  function handleSegmentPointer(event: PointerEvent<HTMLDivElement>): void {
    const target = event.target;

    if (!(target instanceof Element)) return;

    const button = target.closest<HTMLElement>('[data-help-key]');

    if (button !== null) showDisabledReason(button);
  }

  /** Скрывает причину при уходе курсора. */
  function handleSegmentLeave(event: PointerEvent<HTMLDivElement>): void {
    const target = event.target;

    if (!(target instanceof Element)) return;

    hideDisabledReason(target.closest<HTMLElement>('[data-help-key]'));
  }

  /** Показывает причину при фокусе. */
  function handleSegmentFocus(event: FocusEvent<HTMLDivElement>): void {
    const target = event.target;

    if (target instanceof HTMLElement) showDisabledReason(target);
  }

  /** Скрывает причину при потере фокуса. */
  function handleSegmentBlur(event: FocusEvent<HTMLDivElement>): void {
    const target = event.target;

    if (target instanceof HTMLElement) hideDisabledReason(target);
  }

  /** Переключатель слоя. */
  function layerToggle(
    layer: SystemLayerDefinition | undefined,
    key: 'showOrbit' | 'showHz',
    active: boolean,
    label: string,
    onChange: (value: boolean) => void,
  ) {
    if (layer === undefined) return null;

    const status = layerStatus[layer.id];
    const available = status?.available ?? true;
    const reason = available ? undefined : (status?.reason ?? ru['scene.layerUnavailable']);

    return (
      <button
        type="button"
        className="scene-toggle"
        aria-pressed={active}
        aria-disabled={available ? undefined : 'true'}
        data-help-key={key === 'showOrbit' ? 'scene.orbit' : 'scene.hz'}
        data-help-disabled-reason={reason}
        onClick={() => {
          if (available) onChange(!active);
        }}
        onPointerEnter={(event) => showDisabledReason(event.currentTarget)}
        onPointerLeave={(event) => hideDisabledReason(event.currentTarget)}
        onFocus={(event) => showDisabledReason(event.currentTarget)}
        onBlur={(event) => hideDisabledReason(event.currentTarget)}
      >
        {label}
      </button>
    );
  }

  return (
    <div className="scene-controls">
      <div className="scene-controls__corner scene-controls__corner--top-left">
        <Button variant="secondary" size="sm" data-help-key="scene.back" onClick={leaveSystem}>
          {ru['scene.back']}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          data-help-key="scene.chooseAnother"
          onClick={() => {
            leaveSystem();
            focusTable();
          }}
        >
          {ru['scene.chooseAnother']}
        </Button>
      </div>

      <div className="scene-controls__corner scene-controls__corner--top-right">
        <div className="scene-controls__group">
          <span className="scene-controls__label">{ru['scene.scaleLabel']}</span>

          <div
            onPointerOver={handleSegmentPointer}
            onPointerOut={handleSegmentLeave}
            onFocus={handleSegmentFocus}
            onBlur={handleSegmentBlur}
          >
            <SegmentedControl
              label={ru['scene.scaleLabel']}
              value={scaleMode}
              onChange={setScaleMode}
              options={[
                {
                  value: 'overview',
                  label: ru['scene.overviewMode'],
                  helpKey: 'scene.scale',
                },
                {
                  value: 'real',
                  label: ru['scene.realMode'],
                  helpKey: 'scene.scale',
                  ariaDisabled: realDisabled,
                  disabledReason: realDisabled ? scaleReason : undefined,
                },
              ]}
            />
          </div>

          {nominal ? <p className="scene-controls__note">{ru['scene.nominalNote']}</p> : null}
          {nominalSize ? (
            <p className="scene-controls__note">{ru['scene.nominalSizeNote']}</p>
          ) : null}
        </div>

        <div className="scene-controls__toggles">
          {layerToggle(orbitLayer, 'showOrbit', showOrbit, ru['scene.orbit'], setShowOrbit)}
          {layerToggle(hzLayer, 'showHz', showHz, ru['scene.hz'], setShowHz)}
        </div>
      </div>

      <div className="scene-controls__corner scene-controls__corner--bottom-left">
        <div
          onPointerOver={handleSegmentPointer}
          onPointerOut={handleSegmentLeave}
          onFocus={handleSegmentFocus}
          onBlur={handleSegmentBlur}
        >
          <SegmentedControl
            label={ru['scene.targetLabel']}
            value={sceneTarget}
            onChange={setSceneTarget}
            options={[
              {
                value: 'planet',
                label: ru['scene.planet'],
                helpKey: 'scene.target',
              },
              {
                value: 'star',
                label: ru['scene.star'],
                helpKey: 'scene.target',
                ariaDisabled: starStub,
                disabledReason: starReason,
              },
            ]}
          />
        </div>
      </div>

      <div className="scene-controls__corner scene-controls__corner--bottom-right">
        <Button
          variant="secondary"
          size="sm"
          data-help-key="scene.reset"
          onClick={requestSystemReset}
        >
          {ru['scene.overview']}
        </Button>
      </div>
    </div>
  );
}

export default SceneControls;
