/**
 * `GET /api/planets/:id/exomast/spectra?file=…` — сведения о спектре
 * (задача 28; п. 7.3, 10.7.5).
 *
 * Маршрут принимает только имя из списка, полученного вместе с последними
 * свойствами Exo.MAST этой планеты (из памяти или резервной копии):
 * произвольные имена отклоняются с `spectrum_not_listed`. Ошибка загрузки
 * файла — 502 с машиночитаемой причиной; отмена клиентом — 499.
 */

import type { FastifyInstance } from 'fastify';
import type { FetchErrorReason, SpectrumMeta } from '@exo/shared';

import { toFetchErrorReason } from '../pipeline/loadSource';
import type { PipelineState } from '../pipeline/state';
import {
  readExoMastBackupPayload,
  readExoMastCanonicalName,
  selectExoMastCatalog,
} from '../sources/exomast';
import { fetchSpectrumMeta } from '../sources/exomastSpectra';

/** Успешный ответ маршрута. */
export interface SpectrumResponse {
  /** Сведения о спектре. */
  meta: SpectrumMeta;
}

/** Ответ при недоступном файле спектра. */
export interface SpectrumUnavailableResponse {
  /** Код ошибки. */
  error: 'spectrum_unavailable';
  /** Причина. */
  reason: FetchErrorReason;
}

/** Найденный список спектров планеты. */
interface PlanetSpectra {
  /** Каноническое имя планеты для адреса Exo.MAST. */
  canonicalName: string | null;
  /** Список файлов; null — не получен. */
  files: string[] | null;
}

/** Ищет список спектров в памяти, затем в резервной копии. */
async function findSpectra(state: PipelineState, planetId: string): Promise<PlanetSpectra | null> {
  const cached = state.getExoMastProps(planetId);

  if (cached !== null) {
    return { canonicalName: cached.canonicalName, files: cached.spectraFiles };
  }

  const stored = await state.getBackup().read('exomast', planetId);
  if (stored === null) return null;

  const envelope = readExoMastBackupPayload(stored.payload);
  if (envelope === null) return null;

  const selected = selectExoMastCatalog(envelope.properties);

  return {
    canonicalName:
      envelope.canonicalName ?? (selected === null ? null : readExoMastCanonicalName(selected)),
    files: envelope.spectraFiles,
  };
}

/** Регистрирует маршрут сведений о спектре. */
export function registerSpectraRoutes(app: FastifyInstance, state: PipelineState): void {
  app.get<{ Params: { id: string }; Querystring: { file?: string } }>(
    '/api/planets/:id/exomast/spectra',
    async (request, reply): Promise<SpectrumResponse | SpectrumUnavailableResponse | void> => {
      const planet = state.getPlanet(request.params.id);

      if (planet === null) {
        reply.code(404);
        return reply.send({ error: 'planet_not_found' });
      }

      const file = (request.query.file ?? '').trim();
      const spectra = await findSpectra(state, planet.id);

      if (
        file === '' ||
        spectra === null ||
        spectra.files === null ||
        !spectra.files.includes(file)
      ) {
        reply.code(404);
        return reply.send({ error: 'spectrum_not_listed' });
      }

      const controller = new AbortController();
      const onClose = (): void => {
        if (!reply.raw.writableEnded) controller.abort();
      };
      reply.raw.on('close', onClose);

      try {
        const meta = await fetchSpectrumMeta(
          planet.id,
          spectra.canonicalName ?? planet.name,
          file,
          {
            signal: controller.signal,
            fetchImpl: state.getFetchImpl(),
            timeoutMs: state.getTimeoutMs(),
          },
        );

        return { meta };
      } catch (error: unknown) {
        // Отмена клиентом — не сбой источника: статус не меняем.
        if (controller.signal.aborted && !reply.raw.writableEnded) {
          reply.code(499);
          return reply.send({ error: 'aborted' });
        }

        const reason = toFetchErrorReason(error);
        reply.code(502);
        return reply.send({ error: 'spectrum_unavailable', reason });
      } finally {
        reply.raw.off('close', onClose);
      }
    },
  );
}
