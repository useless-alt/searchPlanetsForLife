/**
 * @exo/server — HTTP-сервер каталога экзопланет (Node.js + Fastify).
 *
 * TIER 1 (задача 1): поднимает сервер и отдаёт единственный маршрут
 * `GET /api/health`. Адаптеры источников, резервные копии и дедупликация
 * появляются в задачах 7–11.
 *
 * Секреты и ключи здесь не нужны: хранилище проекта — JSON-файлы (п. 1.4).
 */

import { pathToFileURL } from 'node:url';

import Fastify, { type FastifyInstance } from 'fastify';

export const DEFAULT_PORT = 8787;

export interface HealthResponse {
  status: 'ok';
}

/**
 * Собирает приложение Fastify без вызова listen — чтобы тесты могли
 * использовать `app.inject()` вместо реального сокета.
 */
export function buildServer(): FastifyInstance {
  const app = Fastify({ logger: false });

  app.get('/api/health', async (): Promise<HealthResponse> => ({ status: 'ok' }));

  return app;
}

/** Поднимает сервер на порту из PORT (по умолчанию 8787). */
export async function start(port: number = readPort()): Promise<FastifyInstance> {
  const app = buildServer();
  await app.listen({ port, host: '0.0.0.0' });
  return app;
}

function readPort(): number {
  const raw = process.env.PORT;
  if (!raw) return DEFAULT_PORT;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_PORT;
}

// Автозапуск только при прямом вызове файла (`npm run dev`, `npm start`).
// Импорт модуля из тестов listen не вызывает.
const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(entry).href) {
  start().catch((error: unknown) => {
    console.error('Не удалось запустить сервер:', error);
    process.exitCode = 1;
  });
}
