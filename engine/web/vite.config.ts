import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// EMS Simulator web client.
//
// In development the Vite dev server runs on :5173 and proxies API +
// WebSocket calls to the Rust sim-server on :8080. In production the
// built bundle is served directly by sim-server's static-file fallback,
// so the proxy disappears.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: '127.0.0.1',
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8080',
        changeOrigin: true,
        ws: true,
      },
      '/healthz': 'http://127.0.0.1:8080',
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
    target: 'es2022',
    rollupOptions: {
      output: {
        // Code-split heavy 3D libraries so the initial paint isn't blocked.
        manualChunks: {
          three: ['three'],
          fiber: ['@react-three/fiber', '@react-three/drei'],
        },
      },
    },
  },
});
