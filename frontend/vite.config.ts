/// <reference types="vitest" />
import { resolve } from "node:path";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The frontend talks to the backend only via /api, proxied to FastAPI in dev.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        // Use the IPv4 literal, not "localhost": Node 18+ resolves "localhost" to
        // IPv6 (::1) first, but uvicorn binds 127.0.0.1 — the mismatch makes every
        // proxied /api call fail with a 500. Pinning IPv4 keeps the dev proxy working.
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test-setup.ts"],
  },
});
