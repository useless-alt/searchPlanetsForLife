import type { Plugin } from 'vite';

/**
 * Dev-реализация того же Edge-прокси, что и frontend/api/proxy.ts.
 * Позволяет `npm run dev` работать без `vercel dev`.
 */
export function devProxyPlugin(): Plugin {
  return {
    name: 'dev-api-proxy',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/api/proxy', async (req, res) => {
        const { handleProxyRequest } = await import('./api/proxy-handler');
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
        const response = await handleProxyRequest(request);
        res.statusCode = response.status;
        response.headers.forEach((value, key) => res.setHeader(key, value));
        const buf = Buffer.from(await response.arrayBuffer());
        res.end(buf);
      });
    },
  };
}
