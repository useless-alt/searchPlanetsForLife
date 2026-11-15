/**
 * Скачивание файла в браузере (задача 20; 13.1).
 *
 * Blob + временная ссылка `<a download>`: так файл сохраняется под нужным
 * именем без сервера. Объектный URL освобождается сразу после клика.
 */

/** MIME-тип CSV с UTF-8 (BOM уже внутри содержимого). */
const CSV_MIME = 'text/csv;charset=utf-8';

/**
 * Скачивает текстовый файл.
 *
 * @param fileName Имя файла, которое увидит пользователь.
 * @param content Полное содержимое файла.
 */
export function downloadCsv(fileName: string, content: string): void {
  const blob = new Blob([content], { type: CSV_MIME });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');

  anchor.href = url;
  anchor.download = fileName;
  anchor.style.display = 'none';

  document.body.append(anchor);

  try {
    anchor.click();
  } finally {
    anchor.remove();
    URL.revokeObjectURL(url);
  }
}
