import { useEffect, useRef, useState } from 'react';
import { useStore } from 'zustand';

import { EmptyState } from '../ui';
import { hideHelp, showHelpAt } from '../../help/api';
import { ru } from '../../i18n/ru';
import { selectSearchMatchIds } from '../../state/searchSelectors';
import { appStore, type AppStore } from '../../state/store';
import type { PlanetDetail } from '../../workers/protocol';
import {
  buildGalaxy,
  computeGalaxy,
  getGalaxyData,
  type GalaxyData,
} from '../../three/map/buildGalaxy';
import { createGalaxyRenderer, type GalaxyRenderer } from '../../three/map/GalaxyRenderer';
import {
  buildLabelLinesForDetail,
  buildLabelLinesForRow,
  createLabelPool,
  type LabelHoverInfo,
  type LabelPool,
} from '../../three/map/LabelPool';
import { MapOverlay } from '../../three/map/MapOverlay';
import { getController, registerGalaxyRenderer } from '../../three/map/controller';

/**
 * Внутренний слой карты Галактики (задачи 21–22; п. 6, 10.8; U40, U44).
 *
 * Компонент не знает о Three.js: рендерер приходит из фабрики (в тестах —
 * заглушка, в приложении — `GalaxyScene` на общем `RendererHost`). Позиции
 * планет считаются один раз на снимок каталога; смена режима, настроек и
 * фильтров обновляет только состояние лидеров и меток. Без WebGL показывается
 * список тех же меток, поэтому выбор планеты, карточка и подсказки остаются
 * доступными.
 */

/** Фабрика рендерера; в тестах подменяется заглушкой. */
export type GalaxyRendererFactory = (options: {
  container: HTMLElement;
  data: GalaxyData;
  reducedMotion?: boolean;
}) => GalaxyRenderer;

/** Пропсы карты. */
export interface GalaxyViewProps {
  /** Хранилище; в тестах подставляется изолированный экземпляр. */
  store?: AppStore;
  /** Подмена WebGL-рендерера (тесты, браузеры без контекста). */
  rendererFactory?: GalaxyRendererFactory;
  /** Подмена расчёта данных карты (тест «один вызов на снимок»). */
  buildGalaxyFactory?: typeof buildGalaxy;
  /** Обрабатывать `flyRequest` здесь (совместимость задачи 21). */
  handleFlyRequest?: boolean;
  /** Показывать оверлей карты; в приложении его рисует `ViewportOverlay`. */
  showOverlay?: boolean;
  /** Сообщает данные карты наружу (число планет без координат). */
  onGalaxyData?: (data: GalaxyData | null) => void;
  /** Карта видима; при активной системе её метки не обновляются. */
  active?: boolean;
}

/** Доступен ли WebGL в текущем браузере. */
export function isWebGLAvailable(): boolean {
  try {
    const canvas = document.createElement('canvas');

    return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

/** Элемент списка меток без WebGL. */
interface FallbackLabel {
  planetId: string;
  rank: number | null;
  name: string;
  lines: string[];
}

/** Внутренний слой карты Галактики. */
export function GalaxyPane({
  store = appStore,
  rendererFactory,
  buildGalaxyFactory = buildGalaxy,
  handleFlyRequest = true,
  showOverlay = true,
  onGalaxyData,
  active = true,
}: GalaxyViewProps) {
  const snapshotId = useStore(store, (state) => state.snapshotId);
  const rows = useStore(store, (state) => state.rows);
  const selectedPlanetId = useStore(store, (state) => state.selectedPlanetId);
  const selectedName = useStore(store, (state) =>
    state.selectedPlanetId === null
      ? null
      : (state.catalogIndex[state.selectedPlanetId]?.name ?? null),
  );
  const settings = useStore(store, (state) => state.settings);
  const cameraResetSeq = useStore(store, (state) => state.cameraResetSeq);
  const mapFocusRequest = useStore(store, (state) => state.mapFocusRequest);
  const flyRequest = useStore(store, (state) => state.flyRequest);
  const searchMatchIds = useStore(store, selectSearchMatchIds);

  const [galaxy, setGalaxy] = useState<GalaxyData | null>(null);
  const [renderer, setRenderer] = useState<GalaxyRenderer | null>(null);
  const [labelPool, setLabelPool] = useState<LabelPool | null>(null);
  const [webglFailed, setWebglFailed] = useState(false);
  const [selectedDetail, setSelectedDetail] = useState<PlanetDetail | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<GalaxyRenderer | null>(null);
  const poolRef = useRef<LabelPool | null>(null);
  const arriveUnsubscribeRef = useRef<(() => void) | null>(null);
  const detailSequenceRef = useRef(0);
  const resetSequenceRef = useRef(cameraResetSeq);
  const focusSequenceRef = useRef(0);
  const flySequenceRef = useRef(0);

  const selectRef = useRef<(planetId: string) => void>(() => {});
  const hoverRef = useRef<(info: LabelHoverInfo | null) => void>(() => {});
  const buildFactoryRef = useRef(buildGalaxyFactory);
  const rendererFactoryRef = useRef(rendererFactory);
  const onGalaxyDataRef = useRef(onGalaxyData);

  buildFactoryRef.current = buildGalaxyFactory;
  rendererFactoryRef.current = rendererFactory;
  onGalaxyDataRef.current = onGalaxyData;

  const selectedInRows =
    selectedPlanetId !== null && rows.some((row) => row.planetId === selectedPlanetId);
  const hasRows = rows.length > 0;

  selectRef.current = (planetId: string): void => {
    const state = store.getState();
    state.selectPlanet(planetId);
    state.setPlanetCardOpen(true);
  };

  hoverRef.current = (info: LabelHoverInfo | null): void => {
    if (info === null) {
      hideHelp();
      return;
    }

    const rect = info.element.getBoundingClientRect();

    showHelpAt({
      key: 'map.label',
      ctx: { planetId: info.planetId, lines: info.lines },
      x: rect.left + rect.width / 2,
      y: rect.top,
    });
  };

  // Данные карты: один расчёт на снимок, кэш переживает смену настроек.
  useEffect(() => {
    // До готовности каталога (нет ни снимка, ни строк) воркер ещё не
    // инициализирован — запрос координат был бы ошибкой протокола.
    if (snapshotId === null && !hasRows) {
      setGalaxy(null);
      return undefined;
    }

    const dataSnapshotId = snapshotId ?? 'no-snapshot';
    const cached = getGalaxyData(dataSnapshotId);

    if (cached !== null) {
      setGalaxy(cached);
      return undefined;
    }

    let alive = true;

    void store
      .getState()
      .getPositions()
      .then((positions) => {
        if (!alive) return;
        setGalaxy(buildFactoryRef.current(dataSnapshotId, positions));
      })
      .catch((error: unknown) => {
        if (!alive) return;

        console.warn('[galaxyView] координаты планет не загружены:', error);
        setGalaxy(computeGalaxy(dataSnapshotId, []));
      });

    return () => {
      alive = false;
    };
  }, [snapshotId, store, hasRows]);

  // Данные карты наружу: оверлею нужно число планет без координат (U44).
  useEffect(() => {
    onGalaxyDataRef.current?.(galaxy);
  }, [galaxy]);

  // Деталь нужна только 51-му слоту: для строк Топ-50 все данные уже есть.
  useEffect(() => {
    const sequence = ++detailSequenceRef.current;

    if (selectedPlanetId === null || selectedInRows) {
      setSelectedDetail(null);
      return undefined;
    }

    let alive = true;

    void store
      .getState()
      .getPlanetDetail(selectedPlanetId)
      .then((detail) => {
        if (alive && sequence === detailSequenceRef.current) setSelectedDetail(detail);
      })
      .catch(() => {
        if (alive && sequence === detailSequenceRef.current) setSelectedDetail(null);
      });

    return () => {
      alive = false;
    };
  }, [selectedPlanetId, selectedInRows, settings, snapshotId, store]);

  // Рендерер и пул создаются один раз; новый снимок только обновляет данные.
  useEffect(() => {
    if (galaxy === null || webglFailed) return;

    const container = containerRef.current;

    if (container === null) return;

    if (rendererRef.current !== null) {
      rendererRef.current.setData(galaxy);
      poolRef.current?.setGalaxy(galaxy);
      return;
    }

    try {
      const requestedFactory = rendererFactoryRef.current;

      if (requestedFactory === undefined && !isWebGLAvailable()) {
        throw new Error('WebGL недоступен');
      }

      const factory = requestedFactory ?? createGalaxyRenderer;
      const created = factory({ container, data: galaxy });
      const pool = createLabelPool({
        galaxy,
        onSelect: (planetId) => selectRef.current(planetId),
        onHover: (info) => hoverRef.current(info),
        onChange: () => created.requestRender?.(),
      });

      rendererRef.current = created;
      poolRef.current = pool;

      if (created.setLabels === undefined) {
        // Упрощённая заглушка без CSS2D-слоя: метки остаются обычным DOM,
        // чтобы клики и клавиатура работали и в таком окружении.
        container.appendChild(pool.container);
      } else {
        created.setLabels(pool.objects);
      }
      arriveUnsubscribeRef.current =
        created.onArrive?.(() => getController().notifyArrive()) ?? null;
      registerGalaxyRenderer(created);
      setRenderer(created);
      setLabelPool(pool);
    } catch (error: unknown) {
      console.warn('[galaxyView] 3D-графика не запущена:', error);
      setWebglFailed(true);
    }
  }, [galaxy, webglFailed]);

  // Смена Топ-50: обновляются только состояния готовых меток и точек.
  useEffect(() => {
    if (!active || labelPool === null || renderer === null) return;

    labelPool.updateLeaders(rows);
    renderer.setLeaders(rows.map((row) => row.planetId));
  }, [active, labelPool, renderer, rows]);

  // Выбранная планета: 51-й слот и кольцо вокруг её системы.
  useEffect(() => {
    if (!active || labelPool === null || renderer === null) return;

    const detailForSelection =
      selectedDetail !== null && selectedDetail.id === selectedPlanetId ? selectedDetail : null;

    labelPool.setSelected(selectedPlanetId, detailForSelection, selectedName);

    const systemIndex =
      selectedPlanetId === null || galaxy === null
        ? null
        : (galaxy.systemIndexByPlanet.get(selectedPlanetId) ?? null);

    renderer.setSelection(systemIndex);
  }, [active, labelPool, renderer, selectedPlanetId, selectedDetail, selectedName, galaxy]);

  // Совпадения поиска: рендерер сам отключает кольца при > 200.
  useEffect(() => {
    if (!active) return;

    renderer?.setSearchMatches(searchMatchIds);
  }, [active, renderer, searchMatchIds]);

  // «Обзор»: каждый новый запрос сбрасывает камеру.
  useEffect(() => {
    if (!active || renderer === null) return;
    if (cameraResetSeq === resetSequenceRef.current) return;

    resetSequenceRef.current = cameraResetSeq;
    renderer.resetCamera();
  }, [active, renderer, cameraResetSeq]);

  // «Показать на карте»: фокус на системе и подсветка метки на 2 с.
  useEffect(() => {
    if (!active || renderer === null || labelPool === null || galaxy === null) return;
    if (mapFocusRequest === null) return;
    if (mapFocusRequest.seq === focusSequenceRef.current) return;

    focusSequenceRef.current = mapFocusRequest.seq;

    const systemIndex = galaxy.systemIndexByPlanet.get(mapFocusRequest.planetId);
    const system = systemIndex === undefined ? undefined : galaxy.systems[systemIndex];

    if (system === undefined) return;

    renderer.focus(system.position);
    labelPool.flash(mapFocusRequest.planetId);
  }, [active, renderer, labelPool, galaxy, mapFocusRequest]);

  // Перелёт к системе в режиме совместимости задачи 21. В приложении
  // перелётом управляет SystemController.
  useEffect(() => {
    if (!active || !handleFlyRequest) return;
    if (renderer === null || galaxy === null || flyRequest === null) return;
    if (flyRequest.seq === flySequenceRef.current) return;

    flySequenceRef.current = flyRequest.seq;

    const systemIndex = galaxy.systemIndexByPlanet.get(flyRequest.planetId);
    const system = systemIndex === undefined ? undefined : galaxy.systems[systemIndex];

    if (system === undefined) return;

    renderer.flyToSystem(system.position);
  }, [active, renderer, galaxy, flyRequest, handleFlyRequest]);

  // Освобождение ровно один раз при размонтировании.
  useEffect(
    () => () => {
      arriveUnsubscribeRef.current?.();
      arriveUnsubscribeRef.current = null;
      poolRef.current?.dispose();
      rendererRef.current?.dispose();
      poolRef.current = null;
      rendererRef.current = null;
      registerGalaxyRenderer(null);
    },
    [],
  );

  const fallbackLabels: FallbackLabel[] = rows
    .slice()
    .sort((a, b) => a.rank - b.rank)
    .map((row) => ({
      planetId: row.planetId,
      rank: row.rank,
      name: row.name,
      lines: buildLabelLinesForRow(row),
    }));

  if (selectedPlanetId !== null && !selectedInRows) {
    const detailForSelection =
      selectedDetail !== null && selectedDetail.id === selectedPlanetId ? selectedDetail : null;
    const name = detailForSelection?.name ?? selectedName ?? selectedPlanetId;

    fallbackLabels.push({
      planetId: selectedPlanetId,
      rank: null,
      name,
      lines: detailForSelection === null ? [name] : buildLabelLinesForDetail(detailForSelection),
    });
  }

  return (
    <div className="galaxy-view">
      {webglFailed ? (
        <div className="galaxy-fallback">
          <EmptyState title={ru['map.webglError']} description={ru['map.webglErrorHint']} />

          <ul className="galaxy-fallback__list" aria-label={ru['map.leadersList']}>
            {fallbackLabels.map((item) => (
              <li key={item.planetId}>
                <button
                  type="button"
                  className="galaxy-fallback__button"
                  aria-label={item.rank === null ? item.name : `${item.rank}. ${item.name}`}
                  data-planet-id={item.planetId}
                  onClick={() => selectRef.current(item.planetId)}
                  onPointerEnter={(event) =>
                    hoverRef.current({
                      planetId: item.planetId,
                      lines: item.lines,
                      element: event.currentTarget,
                    })
                  }
                  onPointerLeave={() => hoverRef.current(null)}
                  onFocus={(event) =>
                    hoverRef.current({
                      planetId: item.planetId,
                      lines: item.lines,
                      element: event.currentTarget,
                    })
                  }
                  onBlur={() => hoverRef.current(null)}
                >
                  <span className="galaxy-fallback__rank">
                    {item.rank === null ? '★' : item.rank}
                  </span>
                  <span>{item.name}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <>
          <div className="galaxy-view__canvas" ref={containerRef} />

          {galaxy === null ? (
            <p className="galaxy-view__status" role="status">
              {ru['map.loading']}
            </p>
          ) : null}

          {showOverlay && galaxy !== null && renderer !== null ? (
            <MapOverlay store={store} unplacedCount={galaxy.unplaced.length} />
          ) : null}
        </>
      )}
    </div>
  );
}

export default GalaxyPane;
