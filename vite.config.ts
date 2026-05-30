import { defineConfig } from 'vite';

// Base config for the Clutch Ops: Banana Protocol prototype.
// Using a relative base so the build can be served from any subfolder.
export default defineConfig({
  base: './',
  server: {
    port: 5173,
    open: true,
  },
  build: {
    target: 'es2020',
    sourcemap: false,
    chunkSizeWarningLimit: 1500,
  },
});
