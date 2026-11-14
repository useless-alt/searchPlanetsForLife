import { formatMessage, ru } from '../../i18n/ru';
import { Button } from '../ui';

/**
 * Бейдж выбранной планеты в шапке (задача 13; п. 10.3.5, 13.1).
 *
 * Показывается, когда планета выбрана. Подпись — имя планеты из индекса
 * каталога (например, «TRAPPIST-1 d»). Планета, выпавшая из Топ-50, остаётся
 * в бейдже: выбор сбрасывается только явным действием пользователя
 * (10.3.4, 10.3.5).
 *
 * Клик открывает карточку планеты (задача 19).
 */

/** Пропсы бейджа выбранной планеты. */
export interface SelectedPlanetBadgeProps {
  /** Имя выбранной планеты; null — планета не выбрана. */
  name: string | null;
  /** Обработчик клика: открыть карточку планеты. */
  onOpen: () => void;
}

/** Бейдж выбранной планеты. */
export function SelectedPlanetBadge({ name, onOpen }: SelectedPlanetBadgeProps) {
  if (name === null) return null;

  return (
    <Button
      variant="secondary"
      size="sm"
      className="header__planet"
      onClick={onOpen}
      aria-label={formatMessage(ru['header.planetBadge'], { name })}
    >
      {name}
    </Button>
  );
}
