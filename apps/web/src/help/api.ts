/**
 * Императивный API подсказок для 3D-слоя (задача 17; п. 11.1).
 *
 * Провайдер подсказок регистрирует контроллер при монтировании. Если
 * провайдера нет, вызовы ничего не делают: 3D-компоненты не обязаны знать,
 * смонтирован ли слой интерфейса.
 */

import type { HelpRequestCtx } from './types';

/** Запрос показа подсказки у точки экрана. */
export interface ShowHelpRequest {
  /** Ключ реестра подсказок. */
  key: string;
  /** Контекст: планета и динамические части. */
  ctx?: HelpRequestCtx;
  /** Координата по горизонтали в системе окна. */
  x: number;
  /** Координата по вертикали в системе окна. */
  y: number;
}

/** Контроллер, который регистрирует провайдер. */
export interface HelpController {
  /** Показывает подсказку. */
  show(request: ShowHelpRequest): void;
  /** Скрывает подсказку. */
  hide(): void;
}

let controller: HelpController | null = null;

/** Регистрирует или снимает контроллер подсказок. */
export function registerHelpController(next: HelpController | null): void {
  controller = next;
}

/** Показывает подсказку у точки (императивный вызов из 3D-слоя). */
export function showHelpAt(request: ShowHelpRequest): void {
  controller?.show(request);
}

/** Скрывает подсказку. */
export function hideHelp(): void {
  controller?.hide();
}
