/**
 * Edge-функция Vercel `/api/catalog`: чтение и запись каталогов в Supabase Postgres.
 * Секреты берутся из переменных окружения Vercel и в бандл не попадают.
 */

import { handleCatalogRequest, readConfig } from './supabase-handler';

export const config = { runtime: 'edge' };

export default function handler(request: Request): Promise<Response> {
  const env = (
    globalThis as unknown as {
      process?: { env?: Record<string, string | undefined> };
    }
  ).process?.env;

  return handleCatalogRequest(request, readConfig(env));
}
