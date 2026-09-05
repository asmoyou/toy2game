import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { seoPlugin } from '../../scripts/seo.mjs';

export default defineConfig({
  plugins: [react(), seoPlugin({ gameId: 'rabbit-trap' })],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          three: ["three"],
          engine: ["boardgame.io/client", "boardgame.io/core"],
        },
      },
    },
  },
});
