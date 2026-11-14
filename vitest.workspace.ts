import { defineWorkspace } from 'vitest/config';

/**
 * Область Vitest для монорепо: тесты каждого пакета запускаются как отдельный проект.
 *
 * - packages/shared — чистый TS (окружение node);
 * - apps/server — Fastify (окружение node);
 * - apps/web — React (окружение jsdom, конфиг берётся из apps/web/vite.config.ts).
 */
export default defineWorkspace(['packages/shared', 'apps/server', 'apps/web']);
