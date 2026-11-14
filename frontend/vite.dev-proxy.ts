import type { Plugin } from 'vite';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Dev-реализация серверного маршрута `/api/catalog`.
 * Позволяет `npm run dev` работать без `vercel dev`.
 */

/** Минимальный разбор .env/.env.local: KEY=VALUE, # комментарии, кавычки. */
export function parseEnvFile(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

/** Переменные окружения для dev: .env.local и .env в корне frontend. */
export function loadDevEnv(root: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const name of ['.env.local', '.env']) {
    const file = path.join(root, name);
    if (!fs.existsSync(file)) continue;
    try {
      Object.assign(env, parseEnvFile(fs.readFileSync(file, 'utf8')));
    } catch {
      /* файл недоступен — пропускаем */
    }
  }
  return env;
}

export function devProxyPlugin(): Plugin {
  return {
    name: 'dev-api-proxy',
    apply: 'serve',
    configureServer(server) {
      const env = loadDevEnv(server.config.root);

      server.middlewares.use('/api/catalog', async (req, res) => {
        const { handleCatalogRequest, readConfig } = await import('./api/supabase-handler');
        const proto = req.headers['x-forwarded-proto'] ?? 'http';
        const host = req.headers.host ?? 'localhost';
        const url = new URL(req.url ?? '/', `${proto}://${host}`);
        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(Buffer.from(chunk));

        const request = new Request(url, {
          method: req.method,
          headers: req.headers as Record<string, string>,
          body: req.method === 'GET' || req.method === 'HEAD' ? undefined : Buffer.concat(chunks),
        });
        const response = await handleCatalogRequest(request, readConfig(env));
        res.statusCode = response.status;
        response.headers.forEach((value, key) => res.setHeader(key, value));
        const buf = Buffer.from(await response.arrayBuffer());
        res.end(buf);
      });
    },
  };
}
