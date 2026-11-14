import react from '@vitejs/plugin-react';
import path from 'node:path';
import { defineConfig } from 'vitest/config';

/**
 * Конфиг веб-приложения (@exo/web), адаптированный из конфига черновика.
 *
 * В dev-режиме запросы `/api/*` проксируются на сервер каталога (apps/server),
 * поэтому в браузере не возникает CORS и не нужен отдельный origin.
 *
 * Для GitHub Pages задаются переменные окружения сборки:
 * - `VITE_BASE` — база путей (для project pages это `/<repo>/`);
 * - `VITE_STATIC_DATA=1` — читать каталог из файла, а не из `/api` (см.
 *   `src/api/staticClient.ts`).
 */
export default defineConfig({
  base: process.env.VITE_BASE ?? '/',
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:8787',
    },
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1600,
  },
  test: {
    environment: 'jsdom',
    globals: false,
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
