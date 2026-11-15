/**
 * Провайдер подсказок (задача 17; п. 11.1).
 *
 * Делегирует события на `document` и ищет ближайший предок с
 * `data-help-key`. Показ — `pointerover` после задержки 150 мс и `focusin`
 * сразу; скрытие — уход курсора, потеря фокуса, Esc, нажатие вне подсказки,
 * прокрутка и изменение размера окна. Одновременно существует одна
 * подсказка. Сенсорное касание показывает подсказку сразу.
 *
 * В обычном состоянии подсказок в DOM нет: контейнер создаётся только на
 * время показа (критерий приёмки задачи 17).
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from 'zustand';

import { appStore, type AppStore } from '../state/store';
import { registerHelpController } from './api';
import { buildHelp } from './builders';
import { resolveEntry } from './registry';
import { HELP_TOOLTIP_ID, Tooltip } from './Tooltip';
import { HELP_DELAY_MS, type HelpRequestCtx } from './types';

export { HELP_DELAY_MS };

/** Показанная подсказка. */
interface ActiveTooltip {
  /** Ключ реестра. */
  key: string;
  /** Контекст: планета и динамические части. */
  ctx: HelpRequestCtx;
  /** Точка курсора; `null` — фокус с клавиатуры. */
  pointer: { x: number; y: number } | null;
  /** Цель; `null` — показ из императивного API. */
  target: HTMLElement | null;
}

/** Пропсы провайдера. */
export interface TooltipProviderProps {
  /** Содержимое приложения. */
  children: ReactNode;
  /** Хранилище; в тестах подставляется изолированный экземпляр. */
  store?: AppStore;
}

/** Ближайший предок с ключом подсказки. */
function helpTarget(node: EventTarget | null): HTMLElement | null {
  if (!(node instanceof Element)) return null;

  return node.closest<HTMLElement>('[data-help-key]');
}

/** Контекст из атрибутов цели. */
function ctxFromElement(element: HTMLElement): HelpRequestCtx {
  const host = element.closest<HTMLElement>('[data-help-planet]');
  const planetId = element.dataset.helpPlanet ?? host?.dataset.helpPlanet;
  const disabledReason = element.dataset.helpDisabledReason;
  const ctx: HelpRequestCtx = {};

  if (planetId !== undefined && planetId !== '') ctx.planetId = planetId;
  if (disabledReason !== undefined && disabledReason !== '') ctx.disabledReason = disabledReason;

  return ctx;
}

/** Сенсорный ли ввод (в синтетических событиях поле может отсутствовать). */
function isTouch(event: PointerEvent): boolean {
  return (event as { pointerType?: string }).pointerType === 'touch';
}

/** Координаты события; в синтетических событиях jsdom их может не быть. */
function eventPoint(event: PointerEvent): { x: number; y: number } {
  return {
    x: Number.isFinite(event.clientX) ? event.clientX : 0,
    y: Number.isFinite(event.clientY) ? event.clientY : 0,
  };
}

/** Содержимое ли это поле ввода (такие элементы уже фокусируемы). */
function isNativelyFocusable(element: HTMLElement): boolean {
  if (element.hasAttribute('tabindex')) return true;

  return ['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA'].includes(element.tagName);
}

/** Провайдер подсказок. */
export function TooltipProvider({ children, store = appStore }: TooltipProviderProps) {
  const [active, setActive] = useState<ActiveTooltip | null>(null);
  const activeRef = useRef<ActiveTooltip | null>(active);
  const timerRef = useRef<number | null>(null);
  const addedTabIndexRef = useRef<Set<HTMLElement>>(new Set());

  activeRef.current = active;

  /** Снимает отложенный показ. */
  const clearDelay = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  /** Скрывает подсказку. */
  const hide = useCallback(() => {
    clearDelay();
    setActive(null);
  }, [clearDelay]);

  /** Показывает подсказку, если ключ есть в реестре. */
  const show = useCallback(
    (next: ActiveTooltip) => {
      clearDelay();

      // Неизвестный ключ не показывается и ничего не пишет в консоль.
      if (resolveEntry(next.key) === null) return;

      setActive(next);

      if (next.ctx.planetId !== undefined) {
        void store.getState().loadResolved([next.ctx.planetId]);
      }
    },
    [clearDelay, store],
  );

  /** Показ с клавиатуры и с сенсорного экрана — без задержки. */
  const showFromElement = useCallback(
    (element: HTMLElement, pointer: { x: number; y: number } | null) => {
      const key = element.dataset.helpKey;

      if (key === undefined || key === '') return;

      show({ key, ctx: ctxFromElement(element), pointer, target: element });
    },
    [show],
  );

  // Элементы с data-help-focusable="true" получают tabindex="0": исключение
  // из правила «значения в ячейках остаются доступны только мышью».
  useEffect(() => {
    const added = addedTabIndexRef.current;

    function applyFocusable(root: ParentNode): void {
      root
        .querySelectorAll<HTMLElement>('[data-help-focusable="true"][data-help-key]')
        .forEach((element) => {
          if (isNativelyFocusable(element)) return;

          element.setAttribute('tabindex', '0');
          added.add(element);
        });
    }

    applyFocusable(document);

    // Панели и 3D-слои появляются позже: наблюдатель добавляет tabindex новым
    // элементам, не включая при этом фокусировку остальных ячеек.
    const observer = new MutationObserver(() => applyFocusable(document));

    if (document.body !== null) {
      observer.observe(document.body, { childList: true, subtree: true });
    }

    return () => {
      observer.disconnect();

      for (const element of added) element.removeAttribute('tabindex');
      added.clear();
    };
  }, []);

  // Делегирование событий на document.
  useEffect(() => {
    function handlePointerOver(event: PointerEvent): void {
      // Сенсорный ввод обрабатывает pointerdown: показать сразу.
      if (isTouch(event)) return;

      const target = helpTarget(event.target);

      if (target === null) return;

      // Переход внутри той же цели (на дочерний узел) — не новый показ.
      if (event.relatedTarget instanceof Node && target.contains(event.relatedTarget)) return;

      const key = target.dataset.helpKey;

      if (key === undefined || key === '') return;

      const pointer = eventPoint(event);

      clearDelay();
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        show({ key, ctx: ctxFromElement(target), pointer, target });
      }, HELP_DELAY_MS);
    }

    function handlePointerOut(event: PointerEvent): void {
      const target = helpTarget(event.target);

      if (target === null) return;

      if (event.relatedTarget instanceof Node && target.contains(event.relatedTarget)) return;

      hide();
    }

    function handleFocusIn(event: FocusEvent): void {
      const target = helpTarget(event.target);

      if (target === null) return;

      showFromElement(target, null);
    }

    function handleFocusOut(event: FocusEvent): void {
      const target = helpTarget(event.target);

      if (target === null) return;

      if (event.relatedTarget instanceof Node && target.contains(event.relatedTarget)) return;

      hide();
    }

    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key !== 'Escape') return;

      // Открытая подсказка — первый слой по U58: сцена системы не должна
      // закрыться тем же нажатием Esc.
      if (activeRef.current !== null) event.preventDefault();

      hide();
    }

    function handlePointerDown(event: PointerEvent): void {
      const target = helpTarget(event.target);

      // Касание по цели показывает сразу, касание вне — скрывает.
      if (isTouch(event) && target !== null) {
        showFromElement(target, eventPoint(event));
        return;
      }

      hide();
    }

    const hideOnViewportChange = (): void => hide();

    document.addEventListener('pointerover', handlePointerOver);
    document.addEventListener('pointerout', handlePointerOut);
    document.addEventListener('focusin', handleFocusIn);
    document.addEventListener('focusout', handleFocusOut);
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('scroll', hideOnViewportChange, true);
    window.addEventListener('resize', hideOnViewportChange);

    return () => {
      clearDelay();
      document.removeEventListener('pointerover', handlePointerOver);
      document.removeEventListener('pointerout', handlePointerOut);
      document.removeEventListener('focusin', handleFocusIn);
      document.removeEventListener('focusout', handleFocusOut);
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('scroll', hideOnViewportChange, true);
      window.removeEventListener('resize', hideOnViewportChange);
    };
  }, [clearDelay, hide, show, showFromElement]);

  // Императивный API для 3D-слоя.
  useEffect(() => {
    registerHelpController({
      show(request) {
        show({
          key: request.key,
          ctx: request.ctx ?? {},
          pointer: { x: request.x, y: request.y },
          target: null,
        });
      },
      hide,
    });

    return () => registerHelpController(null);
  }, [hide, show]);

  const planetId = active?.ctx.planetId;
  const resolved = useStore(store, (state) =>
    planetId === undefined ? undefined : state.resolvedCache[planetId],
  );

  // Подсказка обновляется, когда данные планеты приходят из воркера, — без
  // повторного показа и мерцания. `resolved: null` отключает обращение к
  // общему хранилищу: провайдер всегда передаёт своё.
  const content = useMemo(
    () =>
      active === null ? null : buildHelp(active.key, { ...active.ctx, resolved: resolved ?? null }),
    [active, resolved],
  );

  const visible = active !== null && content !== null;

  // Цель получает aria-describedby, пока подсказка видима.
  useEffect(() => {
    if (!visible || active?.target == null) return undefined;

    const element = active.target;
    const previous = element.getAttribute('aria-describedby');
    const describedBy = previous === null ? HELP_TOOLTIP_ID : `${previous} ${HELP_TOOLTIP_ID}`;

    element.setAttribute('aria-describedby', describedBy);

    return () => {
      if (previous === null) element.removeAttribute('aria-describedby');
      else element.setAttribute('aria-describedby', previous);
    };
  }, [active, visible]);

  return (
    <>
      {children}
      {visible && content !== null
        ? createPortal(
            <Tooltip content={content} target={active.target} pointer={active.pointer} />,
            document.body,
          )
        : null}
    </>
  );
}
