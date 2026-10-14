import { spawn } from "node:child_process";
import { cp, rm, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve, relative } from "node:path";
const root = fileURLToPath(new URL("../", import.meta.url)),
  destination = resolve(root, "work/competition-site");
if (
  relative(root, destination).replaceAll("\\", "/") !== "work/competition-site"
)
  throw Error("INVALID_STATIC_DESTINATION");
await new Promise((ok, bad) => {
  const child = spawn(process.execPath, [process.env.npm_execpath, "build"], {
    cwd: root,
    env: {
      ...process.env,
      VITE_EXHIBITION_MODE: "true",
      VITE_ENABLE_CLOUD_AUTH: "false",
      VITE_USE_AUTH_PROXY: "false",
      VITE_BASE_PATH: "./",
    },
    stdio: "inherit",
  });
  child.on("error", bad);
  child.on("exit", (code) =>
    code === 0 ? ok() : bad(Error("COMPETITION_BUILD_FAILED")),
  );
});
await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });
await cp(resolve(root, "apps/web/dist"), destination, { recursive: true });
console.log(
  "Competition static site saved under work/competition-site; no cloud credentials required at runtime.",
);
