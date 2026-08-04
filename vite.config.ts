import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { createOpenDiffsPlugin } from "./cli/server.mjs";

export default defineConfig({
  plugins: [react(), createOpenDiffsPlugin(process.cwd())],
  server: {
    port: 4173,
    strictPort: false,
  },
  preview: {
    port: 4173,
    strictPort: false,
  },
});
