import type { AtmosphereHints } from '@exo/shared';

import type { AppStore } from '../state/store';

/**
 * Мост «Exo.MAST → 3D-сцена» (задача 28; п. 9.1, 10.1.4; U52).
 *
 * Загрузка запускается при начале перелёта и не блокирует анимацию:
 * мост не ждёт ответа и не влияет ни на вид, ни на камеру. Когда молекулы
 * атмосферы пришли, вызывается `setHints` визуального объекта планеты —
 * без перестройки сцены. Смена планеты и выход на карту сбрасывают
 * подсказки в `null`. Ошибка автоматического запроса уведомлений не
 * показывает: статус виден только в карточке.
 */

/** Получатель подсказок об атмосфере (визуальный объект сцены). */
export interface AtmosphereHintTarget {
  /** Применяет молекулы; null — вернуть базовый вид. */
  setHints(hints: AtmosphereHints | null): void;
}

/** Настройки моста. */
export interface ExoMastBridgeOptions {
  /** Хранилище приложения. */
  store: AppStore;
  /** Текущая сцена или её визуальный объект; null — сцены нет. */
  getTarget: () => AtmosphereHintTarget | null;
}

/** Мост Exo.MAST и 3D-сцены. */
export class ExoMastBridge {
  private readonly store: AppStore;

  private readonly getTarget: () => AtmosphereHintTarget | null;

  /** Планета, для которой идёт (или завершилась) загрузка. */
  private planetId: string | null = null;

  /** Последняя применённая подпись молекул. */
  private lastSignature: string | null = null;

  /** Отписка от хранилища. */
  private unsubscribe: (() => void) | null = null;

  constructor(options: ExoMastBridgeOptions) {
    this.store = options.store;
    this.getTarget = options.getTarget;
    this.unsubscribe = this.store.subscribe((state, previous) => {
      if (state.exoMast !== previous.exoMast || state.scenePlanetId !== previous.scenePlanetId) {
        this.sync();
      }
    });
  }

  /** Текущая планета моста; null — мост не активен. */
  get currentPlanetId(): string | null {
    return this.planetId;
  }

  /**
   * Начинает загрузку для планеты.
   *
   * Повторный вызов для той же планеты не дублирует запрос; для новой —
   * отменяет автоматический запрос предыдущей и сбрасывает подсказки.
   */
  begin(planetId: string): void {
    if (this.planetId === planetId) {
      this.sync();
      return;
    }

    if (this.planetId !== null) {
      this.store.getState().cancelExoMast(this.planetId, 'approach');
    }

    this.planetId = planetId;
    this.lastSignature = null;
    // Новая планета начинается с базового вида (U52).
    this.getTarget()?.setHints(null);
    void this.store.getState().loadExoMast(planetId, 'approach');
    this.sync();
  }

  /** Подключает только что созданную сцену и применяет текущие подсказки. */
  attach(): void {
    this.lastSignature = null;
    this.sync();
  }

  /** Выход из системы: отмена автоматического запроса и сброс подсказок. */
  end(): void {
    const previous = this.planetId;

    this.planetId = null;
    this.lastSignature = null;

    if (previous !== null) this.store.getState().cancelExoMast(previous, 'approach');

    this.getTarget()?.setHints(null);
  }

  /** Снимает подписку. */
  dispose(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.planetId = null;
    this.lastSignature = null;
  }

  /** Применяет молекулы текущей записи, если они изменились. */
  private sync(): void {
    const planetId = this.planetId;

    if (planetId === null) return;

    const entry = this.store.getState().exoMast[planetId];
    const molecules = entry?.props?.atmosphere?.molecules ?? [];
    const signature = molecules.join('|');

    if (signature === this.lastSignature) return;

    this.lastSignature = signature;
    this.getTarget()?.setHints(molecules.length === 0 ? null : { molecules });
  }
}
