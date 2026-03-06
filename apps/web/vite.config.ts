// apps/web/vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const API_TARGET = process.env.BP_API_TARGET ?? "http://localhost:3000";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      // Core reader endpoints
      "/health": { target: API_TARGET, changeOrigin: true },
      "/meta": { target: API_TARGET, changeOrigin: true },
      "/books": { target: API_TARGET, changeOrigin: true },
      "/chapters": { target: API_TARGET, changeOrigin: true },
      "/chapter": { target: API_TARGET, changeOrigin: true },
      "/search": { target: API_TARGET, changeOrigin: true },
      "/spine": { target: API_TARGET, changeOrigin: true },
      "/slice": { target: API_TARGET, changeOrigin: true },
      "/loc": { target: API_TARGET, changeOrigin: true },

      // Auth (Google OAuth + sessions)
      "/auth": { target: API_TARGET, changeOrigin: true },

      // Entity drawers (future)
      "/people": { target: API_TARGET, changeOrigin: true },
      "/places": { target: API_TARGET, changeOrigin: true },
      "/events": { target: API_TARGET, changeOrigin: true },
    },
  },
  preview: {
    port: 5173,
    strictPort: true,
  },
});