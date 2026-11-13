import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { devProxyPlugin } from './vite.dev-proxy';

export default defineConfig({
  plugins: [react(), devProxyPlugin()],
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  server: { port: 5173 },
  build: { target: 'es2022', chunkSizeWarningLimit: 1600 },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
    globals: false,
  },
});
