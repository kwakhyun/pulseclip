import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
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
});
