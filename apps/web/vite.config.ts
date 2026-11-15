import react from '@vitejs/plugin-react';
import path from 'node:path';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

/**
 * Конфиг веб-приложения (@exo/web), адаптированный из конфига черновика.
 *
 * В dev- и preview-режиме запросы `/api/*` проксируются на сервер каталога
 * (apps/server), поэтому в браузере не возникает CORS и не нужен отдельный
 * origin. Адрес сервера задаётся `VITE_API_PROXY_TARGET` (задача 31):
 * Playwright поднимает сервер на случайном порту и передаёт его сюда.
 *
 * Для GitHub Pages задаются переменные окружения сборки:
 * - `VITE_BASE` — база путей (для project pages это `/<repo>/`);
 * - `VITE_STATIC_DATA=1` — читать каталог из файла, а не из `/api` (см.
 *   `src/api/staticClient.ts`).
 */

/** Адрес сервера каталога; по умолчанию — локальный 8787. */
const apiProxyTarget = process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:8787';

/**
 * Убирает внешние шрифты из `index.html` в e2e-сборке (задача 31).
 *
 * Тесты не используют сеть: запрос к `fonts.googleapis.com` нарушил бы это
 * правило и добавил бы `console.error` про заблокированный ресурс.
 */
function stripExternalFonts(): Plugin {
  return {
    name: 'exo-strip-external-fonts',
    transformIndexHtml(html) {
      return html.replace(/<link[^>]*fonts\.(?:googleapis|gstatic)\.com[^>]*>\s*/g, '');
    },
  };
}

export default defineConfig(({ mode }) => {
  const e2e = mode === 'e2e' || process.env.VITE_E2E === '1';
  const proxy = { '/api': apiProxyTarget };

  return {
    base: process.env.VITE_BASE ?? '/',
    plugins: [react(), ...(e2e ? [stripExternalFonts()] : [])],
    resolve: {
      alias: { '@': path.resolve(__dirname, 'src') },
    },
    server: {
      port: 5173,
      proxy,
    },
    preview: {
      port: 4173,
      strictPort: true,
      proxy,
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
  };
});
