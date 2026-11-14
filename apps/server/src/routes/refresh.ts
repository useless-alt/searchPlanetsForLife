/**
 * `POST /api/refresh` — полное обновление каталога (задача 11, п. 10.10).
 *
 * Обновление запускается в фоне и не блокирует ответ. Повторный запуск
 * во время сборки отклоняется 409 (single-flight).
 */

import type { FastifyInstance } from 'fastify';

import type { PipelineState } from '../pipeline/state';

/** Регистрирует маршрут обновления. */
export function registerRefreshRoutes(app: FastifyInstance, state: PipelineState): void {
  app.post('/api/refresh', async (_request, reply) => {
    if (!state.startRefresh()) {
      reply.code(409);
      return reply.send({ error: 'refresh_in_progress' });
    }
    reply.code(202);
    return reply.send({ started: true });
  });
}
