/**
 * Копирование текста в буфер обмена (задача 20; 13.1).
 *
 * Сначала используется современный `navigator.clipboard`, затем запасной
 * путь через временный `<textarea>` и `document.execCommand('copy')`.
 * Функция не бросает: `false` означает, что оба способа недоступны, и
 * вызывающий код показывает диалог со ссылкой.
 */

/** Копирует текст; true — буфер обмена обновлён. */
export async function copyText(text: string): Promise<boolean> {
  try {
    const clipboard = navigator.clipboard;

    if (clipboard !== undefined && typeof clipboard.writeText === 'function') {
      await clipboard.writeText(text);
      return true;
    }
  } catch {
    // Разрешение не выдано или API сломан — пробуем запасной путь.
  }

  return copyWithTextarea(text);
}

/**
 * Запасное копирование через выделение временного поля.
 *
 * `execCommand` устарел, но остаётся единственным способом в браузерах без
 * Clipboard API и в небезопасном контексте.
 */
function copyWithTextarea(text: string): boolean {
  const textarea = document.createElement('textarea');

  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.top = '-1000px';
  textarea.style.opacity = '0';

  document.body.append(textarea);

  try {
    textarea.select();
    textarea.setSelectionRange(0, text.length);

    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    textarea.remove();
  }
}
