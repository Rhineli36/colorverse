import { mkdir, readFile, writeFile, copyFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import { resolve, dirname } from "node:path";
import { execFileSync, spawn } from "node:child_process";

const command = process.argv[2],
  name = "colorverse-growth-preview";
if (!["build", "deploy"].includes(command)) throw Error("USE_BUILD_OR_DEPLOY");
const run = (args, env = process.env) =>
  new Promise((ok, no) => {
    const child = spawn(process.execPath, [...args], {
      env,
      stdio: "inherit",
      windowsHide: true,
    });
    child.on("error", no);
    child.on("exit", (code) =>
      code === 0 ? ok() : no(Error("GROWTH_PREVIEW_COMMAND_FAILED")),
    );
  });
await run([
  "node_modules/vite/bin/vite.js",
  "build",
  "--config",
  "apps/web/growth-preview.vite.config.ts",
]);
const site = resolve("work/growth-preview-site");
await copyFile(
  resolve(site, "growth-preview.html"),
  resolve(site, "index.html"),
);
for (const asset of [
  "competition/case-3-exterior.webp",
  "competition/case-3-interior.webp",
  "emotion-cases/red-vermilion-c1c04cddd601.webp",
  "emotion-cases/yellow-cream-8ebb92103f82.webp",
]) {
  const target = resolve(site, asset);
  await mkdir(dirname(target), { recursive: true });
  await copyFile(resolve("apps/web/public", asset), target);
}
const revision = execFileSync("git", ["rev-parse", "--short", "HEAD"], {
  encoding: "utf8",
}).trim();
await writeFile(
  resolve(site, "release.json"),
  JSON.stringify({
    mode: "isolated-growth-preview",
    sourceRevision: revision,
    builtAt: new Date().toISOString(),
    classroomDataConnected: false,
    presets: 12,
  }),
);
const config = {
  name,
  main: resolve("apps/worker/src/growth-preview-entry.ts"),
  compatibility_date: "2026-11-03",
  workers_dev: true,
  assets: {
    directory: site,
    binding: "ASSETS",
    run_worker_first: true,
    html_handling: "none",
    not_found_handling: "none",
  },
};
const path = resolve("work/wrangler.growth-preview.json");
await writeFile(path, JSON.stringify(config, null, 2));
const cf = parseEnv(await readFile(".env.cloudflare.local", "utf8"));
await run(
  [
    "node_modules/wrangler/bin/wrangler.js",
    "deploy",
    "--config",
    path,
    ...(command === "build" ? ["--dry-run"] : []),
  ],
  { ...process.env, ...cf, NODE_USE_ENV_PROXY: "0" },
);
