/**
 * `GET /api/catalog` — снимок каталога (задача 11, п. 10.10.5).
 *
 * ETag равен `snapshot.id` (SHA-256 списка планет); при совпадении
 * `If-None-Match` возвращается 304. Ответ сжимается `@fastify/compress`,
 * зарегистрированным в корне приложения.
 */

import type { FastifyInstance } from 'fastify';
import type { CatalogResponse } from '@exo/shared';

import type { PipelineState } from '../pipeline/state';

/** Приводит значение ETag к сравнимому виду (снимает `W/` и кавычки). */
function normalizeEtag(value: string): string {
  return value.trim().replace(/^W\//, '').replace(/^"|"$/g, '');
}

/** Проверяет, что `If-None-Match` содержит текущий ETag. */
function etagMatches(header: string | string[] | undefined, etag: string): boolean {
  if (header === undefined) return false;
  const values = Array.isArray(header) ? header : header.split(',');
  const expected = normalizeEtag(etag);
  return values.some((value) => normalizeEtag(value) === expected);
}

/** Регистрирует маршрут снимка каталога. */
export function registerCatalogRoutes(app: FastifyInstance, state: PipelineState): void {
  app.get('/api/catalog', async (request, reply): Promise<CatalogResponse | void> => {
    const catalog = state.getCatalog();

    if (catalog === null) {
      const status = state.getStatus();
      const error = status.phase === 'error' ? 'no_data' : 'loading';
      reply.code(503);
      return reply.send({ error });
    }

    const etag = catalog.snapshot.id;
    reply.header('ETag', etag);

    if (etagMatches(request.headers['if-none-match'], etag)) {
      reply.code(304);
      return reply.send();
    }

    return catalog;
  });
}
