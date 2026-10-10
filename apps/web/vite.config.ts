import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
const proxy = {
  "/api/v1": {
    target: process.env.COURSE_PROXY_TARGET || "http://127.0.0.1:3001",
    changeOrigin: true,
  },
};
export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  base: process.env.VITE_BASE_PATH || "/",
  server: {
    port: 5173,
    strictPort: true,
    proxy,
  },
  preview: { port: 5174, strictPort: true, proxy },
  build: { outDir: "dist", chunkSizeWarningLimit: 800 },
});
