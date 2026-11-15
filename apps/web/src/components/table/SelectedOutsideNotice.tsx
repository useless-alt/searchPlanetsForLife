import { formatMessage, ru } from '../../i18n/ru';
import { Button } from '../ui';

/**
 * Уведомление о выбранной планете вне Топ-50 (задача 16; п. 10.3.4, 10.5).
 *
 * Смена настроек или фильтров не сбрасывает выбор (10.3.4): если планета
 * выпала из таблицы, над ней остаётся строка с именем и кнопкой карточки.
 * Сама таблица при этом не меняется.
 */

/** Пропсы уведомления. */
export interface SelectedOutsideNoticeProps {
  /** Имя выбранной планеты. */
  name: string;
  /** Открыть карточку выбранной планеты. */
  onOpen: () => void;
}

/** Строка «выбранная планета не входит в текущий Топ-50». */
export function SelectedOutsideNotice({ name, onOpen }: SelectedOutsideNoticeProps) {
  return (
    <div className="top-table__notice" role="status">
      <p className="top-table__notice-text">{formatMessage(ru['table.outsideTop'], { name })}</p>
      <Button variant="secondary" size="sm" onClick={onOpen}>
        {ru['table.openCard']}
      </Button>
    </div>
  );
}
