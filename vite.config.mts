import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig(({ command }) => ({
  plugins: [
    {
      name: 'pulseclip-content-security-policy',
      transformIndexHtml(html) {
        const developmentConnections = command === 'serve'
          ? ' ws://localhost:5173 http://localhost:5173'
          : '';
        return html.replace(
          '__PULSECLIP_DEV_CONNECT_SRC__',
          developmentConnections,
        );
      },
    },
    react(),
  ],
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
    target: 'chrome142',
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  test: {
    include: ['src/**/*.test.ts'],
    exclude: ['dist/**', 'dist-electron/**', 'release/**', 'node_modules/**'],
  },
}));
