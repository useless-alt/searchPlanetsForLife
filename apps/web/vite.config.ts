import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

/**
 * Конфиг веб-приложения (@exo/web).
 *
 * В dev-режиме запросы `/api/*` проксируются на сервер каталога (apps/server),
 * поэтому в браузере не возникает CORS и не нужен отдельный origin.
 */
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:8787',
    },
  },
  build: {
    target: 'es2022',
  },
  test: {
    environment: 'jsdom',
    globals: false,
  },
});
