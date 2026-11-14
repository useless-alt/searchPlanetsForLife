/**
 * `GET /api/errors?limit=N` — журнал ошибок источников (задача 11, п. 8.2).
 *
 * По умолчанию 200 записей, максимум 1000; новые записи идут первыми.
 */

import type { FastifyInstance } from 'fastify';
import type { ErrorLogEntry } from '@exo/shared';

import { ERROR_LOG_MAX_LIMIT, ERROR_LOG_LOAD_LIMIT } from '../pipeline/errorLog';
import type { PipelineState } from '../pipeline/state';

/** Разбирает параметр `limit`, ограничивая диапазон. */
export function parseErrorsLimit(raw: unknown): number {
  if (typeof raw !== 'string' || raw.trim() === '') return ERROR_LOG_LOAD_LIMIT;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return ERROR_LOG_LOAD_LIMIT;
  return Math.min(ERROR_LOG_MAX_LIMIT, Math.max(0, parsed));
}

/** Регистрирует маршрут журнала ошибок. */
export function registerErrorsRoutes(app: FastifyInstance, state: PipelineState): void {
  app.get<{ Querystring: { limit?: string } }>(
    '/api/errors',
    async (request): Promise<ErrorLogEntry[]> => {
      const limit = parseErrorsLimit(request.query.limit);
      return state.getErrorLog().recent(limit);
    },
  );
}
