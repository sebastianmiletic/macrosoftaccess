import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: { outDir: 'renderer-dist', emptyOutDir: true, target: 'esnext' },
  server: { port: 5173, strictPort: true }
});
