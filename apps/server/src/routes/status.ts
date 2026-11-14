/**
 * `GET /api/status` — состояние загрузки каталога (задача 11, п. 10.10).
 */

import type { FastifyInstance } from 'fastify';
import type { StatusResponse } from '@exo/shared';

import type { PipelineState } from '../pipeline/state';

/** Регистрирует маршрут статуса. */
export function registerStatusRoutes(app: FastifyInstance, state: PipelineState): void {
  app.get('/api/status', async (): Promise<StatusResponse> => state.getStatus());
}
