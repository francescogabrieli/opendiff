import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { createOpenDiffPlugin } from "./cli/server.mjs";

export default defineConfig({
  publicDir: false,
  plugins: [react(), createOpenDiffPlugin(process.cwd())],
  server: {
    port: 4173,
    strictPort: false,
  },
  preview: {
    port: 4173,
    strictPort: false,
  },
});
