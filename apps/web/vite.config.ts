import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
let sourceRevision = process.env.VITE_SOURCE_REVISION;
try {
  sourceRevision ??= execFileSync("git", ["rev-parse", "--short", "HEAD"], {
    encoding: "utf8",
  }).trim();
} catch {
  sourceRevision ??= "workspace";
}
const releaseId =
  process.env.VITE_RELEASE_ID ??
  `${new Date().toISOString()}-${sourceRevision}`;
const emotionRevision = createHash("sha256")
  .update(
    readFileSync(
      new URL(
        "../../packages/contracts/src/emotion-cases.json",
        import.meta.url,
      ),
    ),
  )
  .digest("hex");
const proxy = {
  "/api/v1": {
    target: process.env.COURSE_PROXY_TARGET || "http://127.0.0.1:3001",
    changeOrigin: true,
  },
};
export default defineConfig({
  define: {
    "import.meta.env.VITE_FRONTEND_RELEASE": JSON.stringify(releaseId),
  },
  plugins: [
    {
      name: "frontend-release",
      generateBundle() {
        this.emitFile({
          type: "asset",
          fileName: "release.json",
          source: JSON.stringify({
            releaseId,
            sourceRevision,
            emotionRevision,
            frontend: "shared-experience-v1",
            mode:
              process.env.VITE_EXHIBITION_MODE === "true"
                ? "exhibition"
                : process.env.VITE_ENABLE_CLOUD_AUTH === "true"
                  ? "cloud"
                  : "workspace",
          }),
        });
      },
    },
  ],
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
