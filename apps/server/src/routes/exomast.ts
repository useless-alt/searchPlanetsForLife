/**
 * `GET /api/planets/:id/exomast` — ленивые свойства Exo.MAST (задача 11, п. 10.1.4).
 *
 * Exo.MAST не вызывается при старте и обновлении каталога: только этим
 * маршрутом. При обрыве соединения клиентом запрос отменяется через
 * `AbortSignal`. Если живой запрос не удался и резервной копии нет —
 * 502 с машиночитаемой причиной.
 */

import type { FastifyInstance } from 'fastify';
import type { ExoMastProps, FetchErrorReason } from '@exo/shared';

import { fetchExoMastProps, isAbortError } from '../sources/exomast';
import { toFetchErrorReason } from '../pipeline/loadSource';
import type { PipelineState } from '../pipeline/state';

/** Успешный ответ маршрута. */
export interface ExoMastResponse {
  /** Свойства планеты. */
  props: ExoMastProps;
  /** Источник данных: свежий запрос или резервная копия. */
  status: 'updated' | 'backup';
}

/** Ответ при недоступности Exo.MAST. */
export interface ExoMastUnavailableResponse {
  error: 'exomast_unavailable';
  reason: FetchErrorReason;
}

/** Регистрирует маршрут свойств Exo.MAST. */
export function registerExoMastRoutes(app: FastifyInstance, state: PipelineState): void {
  app.get<{ Params: { id: string } }>(
    '/api/planets/:id/exomast',
    async (request, reply): Promise<ExoMastResponse | ExoMastUnavailableResponse | void> => {
      const planet = state.getPlanet(request.params.id);
      if (planet === null) {
        reply.code(404);
        return reply.send({ error: 'planet_not_found' });
      }

      const controller = new AbortController();
      const onClose = (): void => {
        if (!reply.raw.writableEnded) controller.abort();
      };
      reply.raw.on('close', onClose);

      try {
        const props = await fetchExoMastProps(planet.id, planet.name, {
          signal: controller.signal,
          backup: state.getBackup(),
          fetchImpl: state.getFetchImpl(),
          timeoutMs: state.getTimeoutMs(),
        });

        const status = props.fromBackup ? 'backup' : 'updated';
        state.updateSourceStatus('exomast', {
          state: status,
          backupAt: props.fromBackup ? props.fetchedAt : null,
          message: null,
        });
        return { props, status };
      } catch (error: unknown) {
        // Отмена клиентом — не сбой источника: статус не меняем,
        // запись в журнал не добавляем (п. 8.2).
        if (isAbortError(error)) {
          if (!reply.raw.writableEnded) {
            reply.code(499);
            return reply.send({ error: 'aborted' });
          }
          return reply;
        }

        const reason = toFetchErrorReason(error);
        const message = error instanceof Error ? error.message : String(error);
        state.updateSourceStatus('exomast', {
          state: 'error_no_backup',
          backupAt: null,
          message,
        });
        await state.recordError({
          source: 'exomast',
          time: new Date().toISOString(),
          reason,
          backupUsed: null,
        });

        reply.code(502);
        return reply.send({ error: 'exomast_unavailable', reason });
      } finally {
        reply.raw.off('close', onClose);
      }
    },
  );
}
