import { spectralClass, type ScoreBreakdown, type SpectralClass, type Vec3 } from '@exo/shared';
import { Vector3 } from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';

import { formatMessage, ru } from '../../i18n/ru';
import { EMPTY_VALUE, formatDist, formatNum, formatPercent, formatTemp } from '../../lib/format';
import type { PlanetDetail } from '../../workers/protocol';
import type { GalaxyData } from './buildGalaxy';
import { easeInOut } from './cameraPlan';
import { buildLeaderSlots } from './leaders';

/**
 * Пул из 51 CSS2D-метки карты Галактики (задача 21; п. 6.2, 10.8; U43).
 *
 * 50 кнопок закреплены за рангами Топ-50, 51-я — за выбранной планетой вне
 * Топ-50. Кнопки и `CSS2DObject` создаются один раз: обновление списка
 * лидеров только перемещает и показывает/скрывает готовые элементы, поэтому
 * DOM не растёт при смене фильтров и режима.
 */

/** Длительность анимации перемещения метки [мс] (п. 6.2). */
export const LABEL_MOVE_DURATION_MS = 250;

/** Длительность подсветки метки после «Показать на карте» [мс]. */
export const LABEL_FLASH_DURATION_MS = 2000;

/** Минимальные поля строки, нужные пулу; полная строка Топ-50 подходит. */
export interface LabelRow {
  /** Ранг в Топ-50. */
  rank: number;
  /** Идентификатор планеты. */
  planetId: string;
  /** Отображаемое имя; без него показывается id. */
  name?: string;
  /** Разложение балла для подсказки. */
  score?: ScoreBreakdown | null;
  /** Радиус [R⊕]. */
  R?: number | null;
  /** Температура поверхности [К]. */
  T_s?: number | null;
  /** Расстояние [пк]. */
  dist_pc?: number | null;
  /** Спектральный класс звезды. */
  spectralClass?: SpectralClass | null;
}

/** Данные для подсказки метки. */
export interface LabelHoverInfo {
  /** Идентификатор планеты. */
  planetId: string;
  /** Строки подписи: имя, индекс и параметры (U43). */
  lines: string[];
  /** Кнопка, у которой показывается подсказка. */
  element: HTMLButtonElement;
}

/** Минимальные данные карты, нужные пулу. */
export type LabelGalaxy = Pick<GalaxyData, 'systems' | 'systemIndexByPlanet'>;

/** Параметры пула. */
export interface LabelPoolOptions {
  /** Данные карты на момент создания. */
  galaxy: LabelGalaxy;
  /** Клик или Enter по метке (10.8.5). */
  onSelect: (planetId: string) => void;
  /** Наведение/фокус на метке; null — подсказку нужно скрыть. */
  onHover?: (info: LabelHoverInfo | null) => void;
  /** Запрос кадра у рендерера во время анимации перемещения. */
  onChange?: () => void;
}

/** Публичный API пула меток. */
export interface LabelPool {
  /** 51 CSS2D-объект в порядке слотов. */
  readonly objects: readonly CSS2DObject[];
  /** Псевдоним `objects` для кода, который работает с метками. */
  readonly labels: readonly CSS2DObject[];
  /** 51 кнопка в порядке слотов. */
  readonly buttons: readonly HTMLButtonElement[];
  /** Псевдоним `buttons` для DOM-проверок. */
  readonly elements: readonly HTMLButtonElement[];
  /** Контейнер, куда складываются кнопки до подключения CSS2DRenderer. */
  readonly container: HTMLElement;
  /** Обновляет данные карты (новый снимок каталога). */
  setGalaxy(galaxy: LabelGalaxy): void;
  /**
   * Раскладывает строки Топ-50 по слотам (п. 6.2).
   *
   * Необязательные аргументы позволяют передать выбор и наведение одним
   * вызовом; без них используются значения из `setSelected`/`setHovered`.
   */
  updateLeaders(
    rows: readonly LabelRow[],
    selectedPlanetId?: string | null,
    hoveredPlanetId?: string | null,
  ): void;
  /** Выбранная планета и её деталь для 51-го слота. */
  setSelected(
    planetId: string | null,
    detail?: PlanetDetail | null,
    fallbackName?: string | null,
  ): void;
  /** Планета под курсором; null — курсор ушёл. */
  setHovered(planetId: string | null): void;
  /** Планета в фокусе клавиатуры; null — фокус ушёл. */
  setFocused(planetId: string | null): void;
  /** Подсвечивает метку на заданное время (10.7.6). */
  flash(planetId: string, durationMs?: number): void;
  /** Строки подсказки для планеты. */
  getLines(planetId: string): string[];
  /** Снимает обработчики и удаляет кнопки. */
  dispose(): void;
}

/** Внутреннее состояние слота. */
interface SlotView {
  index: number;
  object: CSS2DObject;
  button: HTMLButtonElement;
  label: HTMLSpanElement;
  planetId: string | null;
  target: Vec3 | null;
  animation: { from: Vector3; to: Vector3; start: number; durationMs: number } | null;
  flashTimer: number | null;
}

/** SVG-прицел метки (невидимая зона наведения — padding кнопки). */
const RETICLE_SVG = `
  <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true" focusable="false">
    <circle cx="10" cy="10" r="6" fill="none" stroke="currentColor" stroke-width="1.5" />
    <path d="M10 1v4M10 15v4M1 10h4M15 10h4" stroke="currentColor" stroke-width="1.5" />
  </svg>
`;

/** Тестовый режим: перемещение меток выполняется мгновенно. */
function isTestEnvironment(): boolean {
  if (import.meta.env.MODE === 'test') return true;

  const scope = globalThis as { process?: { env?: Record<string, string | undefined> } };

  return scope.process?.env?.['VITEST'] !== undefined;
}

/** Системная настройка уменьшенного движения. */
function prefersReducedMotion(): boolean {
  if (typeof window.matchMedia !== 'function') return false;

  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Строки подсказки для строки Топ-50 (U43). */
export function buildLabelLinesForRow(row: LabelRow): string[] {
  return [
    row.name ?? row.planetId,
    formatMessage(ru['map.line.index'], { value: formatPercent(row.score?.index ?? null) }),
    formatMessage(ru['map.line.params'], {
      radius: formatNum(row.R ?? null),
      temp: formatTemp(row.T_s ?? null),
      distance: formatDist(row.dist_pc ?? null),
      spectral: row.spectralClass ?? EMPTY_VALUE,
    }),
  ];
}

/** Строки подсказки для планеты вне Топ-50 по данным `PlanetDetail`. */
export function buildLabelLinesForDetail(detail: PlanetDetail): string[] {
  const spectral = spectralClass(detail.resolved.st_teff.value) ?? EMPTY_VALUE;

  return [
    detail.name,
    formatMessage(ru['map.line.index'], { value: formatPercent(detail.score?.index ?? null) }),
    formatMessage(ru['map.line.params'], {
      radius: formatNum(detail.resolved.R.value),
      temp: formatTemp(detail.score?.T_s ?? null),
      distance: formatDist(detail.resolved.dist_pc.value),
      spectral,
    }),
  ];
}

/** Создаёт пул из 51 CSS2D-метки. */
export function createLabelPool(options: LabelPoolOptions): LabelPool {
  let galaxy = options.galaxy;
  let rows: readonly LabelRow[] = [];
  let selectedPlanetId: string | null = null;
  let selectedDetail: PlanetDetail | null = null;
  let selectedFallbackName: string | null = null;
  let hoveredId: string | null = null;
  let focusedId: string | null = null;
  let emittedId: string | null = null;
  let disposed = false;
  let rafId = 0;
  let hasRendered = false;

  const container = document.createElement('div');
  container.className = 'map-labels';
  container.style.pointerEvents = 'none';

  const views: SlotView[] = [];

  /** Текущая активная планета: фокус важнее наведения. */
  function activePlanetId(): string | null {
    return focusedId ?? hoveredId;
  }

  /** Строки подсказки по идентификатору планеты. */
  function linesFor(planetId: string): string[] {
    const row = rows.find((item) => item.planetId === planetId);

    if (row !== undefined) return buildLabelLinesForRow(row);

    if (selectedDetail !== null && selectedDetail.id === planetId) {
      return buildLabelLinesForDetail(selectedDetail);
    }

    const name =
      selectedPlanetId === planetId && selectedFallbackName !== null
        ? selectedFallbackName
        : planetId;

    return [name];
  }

  /** Сообщает подсказке о смене активной метки. */
  function emitHover(): void {
    const planetId = activePlanetId();

    if (planetId === emittedId) return;

    emittedId = planetId;

    if (planetId === null) {
      options.onHover?.(null);
      return;
    }

    const view = views.find((item) => item.planetId === planetId);

    if (view === undefined || view.button.hidden) {
      options.onHover?.(null);
      return;
    }

    options.onHover?.({
      planetId,
      lines: linesFor(planetId),
      element: view.button,
    });
  }

  /** Запускает цикл анимации перемещения меток. */
  function startAnimation(): void {
    if (rafId !== 0 || disposed) return;

    rafId = requestAnimationFrame(function tick(now): void {
      rafId = 0;
      let active = false;

      for (const view of views) {
        const animation = view.animation;
        if (animation === null) continue;

        const progress =
          animation.durationMs <= 0
            ? 1
            : Math.min(1, (now - animation.start) / animation.durationMs);
        const eased = easeInOut(progress);

        view.object.position.lerpVectors(animation.from, animation.to, eased);

        if (progress >= 1) view.animation = null;
        else active = true;
      }

      options.onChange?.();

      if (active) rafId = requestAnimationFrame(tick);
    });
  }

  /** Перемещает слот к цели с анимацией или мгновенно. */
  function moveSlot(view: SlotView, target: Vec3, animate: boolean): void {
    const same =
      view.target !== null &&
      view.target.x === target.x &&
      view.target.y === target.y &&
      view.target.z === target.z;

    view.target = target;

    if (!animate || same) {
      view.object.position.set(target.x, target.y, target.z);
      view.animation = null;
      return;
    }

    view.animation = {
      from: view.object.position.clone(),
      to: new Vector3(target.x, target.y, target.z),
      start: performance.now(),
      durationMs: LABEL_MOVE_DURATION_MS,
    };
    startAnimation();
  }

  /** Перерисовывает слоты по текущим rows/выделению/наведению. */
  function renderSlots(animatePositions: boolean): void {
    if (disposed) return;

    const rowsByRank = new Map(rows.map((row) => [row.rank, row] as const));
    const slots = buildLeaderSlots({
      rows,
      galaxy,
      selectedPlanetId,
      hoveredPlanetId: focusedId ?? hoveredId,
    });
    const immediate =
      !animatePositions || !hasRendered || isTestEnvironment() || prefersReducedMotion();

    for (const view of views) {
      const slot = slots[view.index];

      if (slot === undefined) {
        view.button.hidden = true;
        view.object.visible = false;
        continue;
      }

      const isSelectedSlot = view.index === slots.length - 1;
      const row = isSelectedSlot ? undefined : rowsByRank.get(view.index + 1);
      const selectedDetailForSlot =
        selectedDetail !== null && selectedDetail.id === selectedPlanetId ? selectedDetail : null;
      const name = isSelectedSlot
        ? (selectedDetailForSlot?.name ?? selectedFallbackName ?? slot.planetId ?? '')
        : (row?.name ?? '');
      const visible = slot.visible && slot.planetId !== null && slot.position !== null;
      const activeId = activePlanetId();
      const labelVisible =
        visible &&
        (slot.labelVisible ||
          slot.planetId === selectedPlanetId ||
          (activeId !== null && slot.planetId === activeId));

      view.planetId = visible ? slot.planetId : null;
      view.button.dataset['slot'] = String(view.index);
      view.button.dataset['planetId'] = view.planetId ?? '';
      view.button.dataset['rank'] = slot.rank === null ? '' : String(slot.rank);
      view.label.textContent = name;
      view.button.setAttribute(
        'aria-label',
        isSelectedSlot ? name : `${slot.rank ?? view.index + 1}. ${name}`,
      );
      view.button.classList.toggle('reticle--leader', !isSelectedSlot);
      view.button.classList.toggle('reticle--selected', isSelectedSlot);
      view.button.classList.toggle('reticle--labeled', labelVisible);
      view.button.style.setProperty(
        '--reticle-duration',
        immediate ? '0ms' : `${LABEL_MOVE_DURATION_MS}ms`,
      );
      view.button.style.marginLeft = `${visible ? slot.offsetX : 0}px`;
      view.button.style.pointerEvents = visible ? 'auto' : 'none';
      view.button.tabIndex = visible ? 0 : -1;
      view.button.hidden = !visible;

      if (visible) view.button.removeAttribute('aria-hidden');
      else view.button.setAttribute('aria-hidden', 'true');

      view.object.visible = visible;

      if (visible && slot.position !== null) {
        moveSlot(view, slot.position, !immediate);
      } else {
        view.animation = null;
        view.target = null;
      }
    }

    hasRendered = true;
    emitHover();
  }

  // Создание 51 кнопки и CSS2D-объекта один раз.
  for (let index = 0; index < 51; index += 1) {
    const button = document.createElement('button');
    const cross = document.createElement('span');
    const label = document.createElement('span');

    button.type = 'button';
    button.className = 'reticle';
    button.dataset['slot'] = String(index);
    button.hidden = true;
    button.tabIndex = -1;
    button.style.pointerEvents = 'none';
    button.setAttribute('aria-hidden', 'true');

    cross.className = 'reticle__cross';
    cross.setAttribute('aria-hidden', 'true');
    cross.innerHTML = RETICLE_SVG;

    label.className = 'reticle__label';
    label.hidden = false;

    button.append(cross, label);
    container.appendChild(button);

    const object = new CSS2DObject(button);
    object.visible = false;

    const view: SlotView = {
      index,
      object,
      button,
      label,
      planetId: null,
      target: null,
      animation: null,
      flashTimer: null,
    };

    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();

      if (view.planetId !== null) options.onSelect(view.planetId);
    });

    button.addEventListener('pointerenter', () => {
      if (view.planetId !== null) {
        hoveredId = view.planetId;
        renderSlots(false);
      }
    });

    button.addEventListener('pointerleave', () => {
      if (view.planetId === hoveredId) {
        hoveredId = null;
        renderSlots(false);
      }
    });

    button.addEventListener('focus', () => {
      if (view.planetId !== null) {
        focusedId = view.planetId;
        renderSlots(false);
      }
    });

    button.addEventListener('blur', () => {
      if (view.planetId === focusedId) {
        focusedId = null;
        renderSlots(false);
      }
    });

    views.push(view);
  }

  const objects = views.map((view) => view.object);
  const buttons = views.map((view) => view.button);

  const pool: LabelPool = {
    objects,
    labels: objects,
    buttons,
    elements: buttons,
    container,

    setGalaxy(next: LabelGalaxy): void {
      galaxy = next;
      renderSlots(false);
    },

    updateLeaders(
      nextRows: readonly LabelRow[],
      nextSelected?: string | null,
      nextHovered?: string | null,
    ): void {
      rows = nextRows;

      if (nextSelected !== undefined) selectedPlanetId = nextSelected;
      if (nextHovered !== undefined) hoveredId = nextHovered;

      // После смены строки наведения может уже не быть среди лидеров;
      // выбранная планета вне Топ-50 остаётся доступной в 51-м слоте.
      if (
        hoveredId !== null &&
        hoveredId !== selectedPlanetId &&
        !rows.some((row) => row.planetId === hoveredId)
      ) {
        hoveredId = null;
      }
      if (
        focusedId !== null &&
        focusedId !== selectedPlanetId &&
        !rows.some((row) => row.planetId === focusedId)
      ) {
        focusedId = null;
      }
      emittedId = null;
      renderSlots(true);
    },

    setSelected(
      planetId: string | null,
      detail: PlanetDetail | null = null,
      fallbackName: string | null = null,
    ): void {
      selectedPlanetId = planetId;
      selectedDetail = detail;
      selectedFallbackName = fallbackName;
      emittedId = null;
      renderSlots(false);
    },

    setHovered(planetId: string | null): void {
      if (hoveredId === planetId) return;
      hoveredId = planetId;
      renderSlots(false);
    },

    setFocused(planetId: string | null): void {
      if (focusedId === planetId) return;
      focusedId = planetId;
      renderSlots(false);
    },

    flash(planetId: string, durationMs: number = LABEL_FLASH_DURATION_MS): void {
      const view = views.find((item) => item.planetId === planetId);

      if (view === undefined) return;

      if (view.flashTimer !== null) window.clearTimeout(view.flashTimer);

      view.button.classList.add('reticle--flash');
      view.flashTimer = window.setTimeout(() => {
        view.button.classList.remove('reticle--flash');
        view.flashTimer = null;
      }, durationMs);
    },

    getLines(planetId: string): string[] {
      return linesFor(planetId);
    },

    dispose(): void {
      if (disposed) return;

      disposed = true;

      if (rafId !== 0) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      }

      for (const view of views) {
        if (view.flashTimer !== null) window.clearTimeout(view.flashTimer);
        view.animation = null;
        view.button.remove();
      }

      container.remove();
    },
  };

  renderSlots(false);

  return pool;
}

export default createLabelPool;
