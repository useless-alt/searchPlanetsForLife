import { searchKey } from '@exo/shared';
import { useEffect, useId, useState } from 'react';
import type { ChangeEvent, KeyboardEvent } from 'react';
import { useStore } from 'zustand';

import { formatMessage, ru } from '../../i18n/ru';
import {
  SEARCH_MIN_KEY_LENGTH,
  SEARCH_SUGGESTION_LIMIT,
  selectSearchMatches,
  type SearchMatch,
} from '../../state/searchSelectors';
import { appStore, type AppStore } from '../../state/store';
import { Icon } from '../ui';

/**
 * Поле поиска с подсказками (задача 14; п. 13.2).
 *
 * Запрос обрабатывается через 150 мс после последнего нажатия. Подсказки
 * появляются при длине нормализованного запроса не меньше двух символов;
 * список показывает до восьми вариантов и помечает планеты вне Топ-50.
 *
 * Клавиатура: ↑/↓ — выбор варианта, Enter — подтвердить (без активного —
 * первый), Esc — закрыть список, повторный Esc — очистить поле. Подтверждение
 * выбирает планету (`selectPlanet`) и не фильтрует таблицу.
 */

/** Пауза обработки запроса, мс (13.2). */
export const SEARCH_DEBOUNCE_MS = 150;

/** Пропсы поля поиска. */
export interface SearchBoxProps {
  /** Хранилище; в тестах подставляется изолированный экземпляр. */
  store?: AppStore;
}

/** Поле поиска планеты или звезды. */
export function SearchBox({ store = appStore }: SearchBoxProps = {}) {
  const committed = useStore(store, (state) => state.filters.search);
  const matches = useStore(store, selectSearchMatches);
  const setSearch = useStore(store, (state) => state.setSearch);
  const selectPlanet = useStore(store, (state) => state.selectPlanet);

  const [text, setText] = useState(committed);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

  const inputId = useId();
  const listId = useId();

  const queryKey = searchKey(text);
  const options = matches.slice(0, SEARCH_SUGGESTION_LIMIT);
  const activeIndex = active >= 0 && active < options.length ? active : -1;
  const showFound = text.trim() !== '';

  // Запрос уходит в хранилище после паузы; пересчёт при этом не запускается.
  useEffect(() => {
    if (text === committed) return undefined;

    const timer = setTimeout(() => {
      setSearch(text);
      setActive(-1);
      setOpen(searchKey(text).length >= SEARCH_MIN_KEY_LENGTH);
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [committed, setSearch, text]);

  const choose = (match: SearchMatch): void => {
    setText(match.name);
    setSearch(match.name);
    selectPlanet(match.id);
    setOpen(false);
    setActive(-1);
  };

  const handleChange = (event: ChangeEvent<HTMLInputElement>): void => {
    setText(event.target.value);
    // Пока идёт пауза, старый список не показывается.
    setOpen(false);
    setActive(-1);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (queryKey.length < SEARCH_MIN_KEY_LENGTH) return;

      event.preventDefault();

      if (!open) {
        setOpen(options.length > 0);
        setActive(options.length > 0 ? 0 : -1);
        return;
      }

      if (options.length === 0) return;

      const step = event.key === 'ArrowDown' ? 1 : -1;

      setActive((current) => {
        if (current < 0) return step > 0 ? 0 : options.length - 1;

        return (current + step + options.length) % options.length;
      });

      return;
    }

    if (event.key === 'Enter') {
      if (!open) return;

      const match = options[activeIndex >= 0 ? activeIndex : 0];

      if (match === undefined) return;

      event.preventDefault();
      choose(match);

      return;
    }

    if (event.key === 'Escape') {
      if (open) {
        event.preventDefault();
        setOpen(false);
        setActive(-1);
        return;
      }

      if (text !== '' || committed !== '') {
        event.preventDefault();
        setText('');
        setSearch('');
        setActive(-1);
      }
    }
  };

  return (
    <div className="ui-field toolbar__search">
      <label className="ui-field__label" htmlFor={inputId}>
        {ru['search.label']}
      </label>

      <div className="toolbar__input">
        <Icon name="search" size={16} className="toolbar__input-icon" />
        <input
          id={inputId}
          className="ui-field__input toolbar__input-field"
          type="search"
          role="combobox"
          value={text}
          autoComplete="off"
          spellCheck={false}
          data-help-key="search.field"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          aria-autocomplete="list"
          aria-activedescendant={open && activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onBlur={() => {
            setOpen(false);
            setActive(-1);
          }}
        />
      </div>

      {showFound ? (
        <p className="ui-field__hint toolbar__found" aria-live="polite">
          {formatMessage(ru['search.found'], { count: matches.length })}
        </p>
      ) : null}

      {open && options.length > 0 ? (
        <ul
          className="toolbar__list"
          role="listbox"
          id={listId}
          aria-label={ru['search.listLabel']}
        >
          {options.map((option, index) => (
            <li
              key={option.id}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === activeIndex}
              className={
                index === activeIndex
                  ? 'toolbar__option toolbar__option--active'
                  : 'toolbar__option'
              }
              onMouseDown={(event) => {
                event.preventDefault();
                choose(option);
              }}
            >
              <span className="toolbar__option-name">{option.name}</span>
              {option.hostname !== null ? (
                <span className="toolbar__option-host">{option.hostname}</span>
              ) : null}
              {!option.inTop ? (
                <span className="toolbar__option-note">{ru['search.outsideTop']}</span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
