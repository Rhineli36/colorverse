import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

// Independent visual prototype: never builds the classroom/competition entry.
export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  base: "/growth-preview/",
  publicDir: false,
  build: {
    outDir: fileURLToPath(
      new URL("../../work/growth-preview-site", import.meta.url),
    ),
    rollupOptions: {
      input: fileURLToPath(new URL("growth-preview.html", import.meta.url)),
    },
  },
});
