import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
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
