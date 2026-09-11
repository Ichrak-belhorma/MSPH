import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Electron loads the renderer over file:// in production, so asset URLs
// must be relative.
export default defineConfig({
  base: "./",
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
