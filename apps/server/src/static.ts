/**
 * Раздача собранного веб-приложения тем же сервером (п. 10.1).
 *
 * Сборка `apps/web/dist` отдаётся с порта сервера, поэтому запуск полного
 * приложения — один процесс и один адрес (`http://localhost:8787`): без
 * Vite, без прокси и без второго порта.
 *
 * Правила:
 * - `/api/*` обслуживают маршруты API; сюда такие запросы не попадают;
 * - файл из `dist` отдаётся как есть, `/assets/*` кэшируется навсегда
 *   (у Vite в именах файлов хеш содержимого);
 * - путь без расширения — клиентский маршрут, отдаётся `index.html`
 *   (SPA-fallback), сам `index.html` не кэшируется;
 * - выход за пределы каталога сборки запрещён.
 */

import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';

import type { FastifyInstance, FastifyReply } from 'fastify';

/** Расширения, которые реально встречаются в сборке Vite. */
const MIME_TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.wasm': 'application/wasm',
  '.csv': 'text/csv; charset=utf-8',
};

/** Настройки раздачи сборки. */
export interface WebAppOptions {
  /** Каталог сборки (`apps/web/dist`). */
  root: string;
}

/** MIME по расширению; неизвестные файлы отдаются как поток байтов. */
function contentType(filePath: string): string {
  return MIME_TYPES[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream';
}

/**
 * Заголовок кэширования: ассеты с хешем в имени — навсегда, остальное —
 * с обязательной проверкой (п. 10.10.5: снимок меняется только сборкой).
 */
function cacheControl(filePath: string, relative: string): string {
  if (path.extname(filePath).toLowerCase() === '.html') return 'no-cache';
  if (relative.startsWith('assets/') || relative.startsWith('assets\\')) {
    return 'public, max-age=31536000, immutable';
  }
  return 'public, max-age=3600';
}

/**
 * Приводит URL к безопасному пути внутри каталога сборки.
 *
 * @returns абсолютный путь либо `null`, если путь выходит за пределы `root`.
 */
export function resolveStaticPath(root: string, urlPath: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    // Битый процентный escape — такой запрос обслуживать нечем.
    return null;
  }
  if (decoded.includes('\0')) return null;

  const normalized = path.posix.normalize(decoded.replace(/\\/g, '/'));
  const relative = normalized.replace(/^\/+/, '');
  const target = path.resolve(root, relative);
  const prefix = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
  return target === root || target.startsWith(prefix) ? target : null;
}

/**
 * Отправляет файл, если он существует.
 *
 * @returns `true`, если ответ уже отправлен.
 */
async function sendFileIfExists(
  reply: FastifyReply,
  filePath: string,
  relative: string,
  method: string,
): Promise<boolean> {
  let info: Awaited<ReturnType<typeof stat>>;
  try {
    info = await stat(filePath);
  } catch {
    return false;
  }
  if (!info.isFile()) return false;

  reply.header('Content-Type', contentType(filePath));
  reply.header('Content-Length', String(info.size));
  reply.header('Cache-Control', cacheControl(filePath, relative));
  reply.header('X-Content-Type-Options', 'nosniff');

  if (method === 'HEAD') {
    reply.send();
    return true;
  }
  reply.send(createReadStream(filePath));
  return true;
}

/**
 * Регистрирует раздачу `index.html` и статики.
 *
 * Вызывается после маршрутов API: обработчик «не найдено» обслуживает только
 * то, что не совпало с `/api/*`.
 */
export function registerWebApp(app: FastifyInstance, options: WebAppOptions): void {
  const root = path.resolve(options.root);

  async function sendIndex(reply: FastifyReply, method: string): Promise<void> {
    const indexPath = path.join(root, 'index.html');
    const sent = await sendFileIfExists(reply, indexPath, 'index.html', method);
    if (!sent) {
      reply.code(503).send({ error: 'web_build_missing' });
    }
  }

  app.get('/', async (request, reply) => {
    await sendIndex(reply, request.method);
    return reply;
  });

  app.setNotFoundHandler(async (request, reply) => {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      reply.code(404);
      return reply.send({ error: 'not_found' });
    }

    const url = request.raw.url ?? '/';
    if (url === '/api' || url.startsWith('/api/') || url.startsWith('/api?')) {
      reply.code(404);
      return reply.send({ error: 'not_found' });
    }

    const pathname = url.split('?')[0] ?? '/';
    const target = resolveStaticPath(root, pathname);

    if (target !== null) {
      const relative = path.relative(root, target);
      const asDirectory = path.extname(target) === '';
      const filePath = asDirectory ? path.join(target, 'index.html') : target;
      const fileRelative = asDirectory ? path.join(relative, 'index.html') : relative;
      if (await sendFileIfExists(reply, filePath, fileRelative, request.method)) return reply;
    }

    // Путь без расширения — клиентский маршрут: отдаём оболочку приложения.
    if (path.extname(pathname) === '') {
      await sendIndex(reply, request.method);
      return reply;
    }

    reply.code(404);
    return reply.send({ error: 'not_found' });
  });
}
