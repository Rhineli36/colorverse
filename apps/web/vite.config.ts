import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  base: process.env.VITE_BASE_PATH || "/",
  server: { port: 5173, strictPort: true },
  build: { outDir: "dist", chunkSizeWarningLimit: 800 },
});
