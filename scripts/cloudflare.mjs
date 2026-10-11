import { spawn } from "node:child_process";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

const root = fileURLToPath(new URL("../", import.meta.url));
const command = process.argv[2];
if (!["check", "dry-run", "deploy"].includes(command)) {
  console.error("Usage: node scripts/cloudflare.mjs check|dry-run|deploy");
  process.exit(1);
}
async function loadLocal(path) {
  try {
    return parseEnv(await readFile(resolve(root, path), "utf8"));
  } catch {
    throw new Error(`Missing local configuration: ${path}`);
  }
}
function run(args, env) {
  return new Promise((resolveRun, reject) => {
    // Launch pnpm through its JS entry point: no shell and no secrets in arguments.
    const pnpm = process.env.npm_execpath;
    if (!pnpm)
      return reject(
        new Error("Run using pnpm cloud:check, cloud:dry-run, or cloud:deploy"),
      );
    const child = spawn(process.execPath, [pnpm, ...args], {
      cwd: root,
      env,
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0
        ? resolveRun()
        : reject(new Error("Cloudflare command failed")),
    );
  });
}
try {
  let credentials = {};
  if (command !== "dry-run") {
    credentials = await loadLocal(".env.cloudflare.local");
    if (
      !/^[a-f0-9]{32}$/i.test(credentials.CLOUDFLARE_ACCOUNT_ID ?? "") ||
      !credentials.CLOUDFLARE_API_TOKEN?.trim()
    )
      throw new Error(
        "Fill CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN in .env.cloudflare.local",
      );
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${credentials.CLOUDFLARE_ACCOUNT_ID}`,
      {
        headers: {
          Authorization: `Bearer ${credentials.CLOUDFLARE_API_TOKEN}`,
        },
        signal: AbortSignal.timeout(15000),
        redirect: "error",
      },
    );
    const result = await response.json();
    if (!response.ok || !result.success)
      throw new Error(
        "Cloudflare account access check failed; check token scope/expiry and Account ID",
      );
    console.log("Cloudflare account access verified (credentials hidden).");
  }
  if (command !== "check") {
    const publicConfig = await loadLocal("apps/web/.env.local");
    const url = publicConfig.VITE_SUPABASE_URL;
    const key = publicConfig.VITE_SUPABASE_PUBLISHABLE_KEY;
    if (
      !/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(url ?? "") ||
      !key?.startsWith("sb_publishable_")
    )
      throw new Error(
        "Missing Supabase public configuration in apps/web/.env.local",
      );
    const env = {
      ...process.env,
      VITE_BASE_PATH: "/",
      VITE_ENABLE_CLOUD_AUTH: "true",
    };
    await run(["build"], env);
    const config = JSON.parse(
      await readFile(resolve(root, "wrangler.json"), "utf8"),
    );
    config.main = "../apps/worker/src/index.ts";
    config.assets.directory = "../apps/web/dist";
    config.vars = { SUPABASE_URL: url, SUPABASE_PUBLISHABLE_KEY: key };
    await mkdir(resolve(root, "work"), { recursive: true });
    const configPath = resolve(root, "work/wrangler.cloudflare.json");
    await writeFile(configPath, JSON.stringify(config, null, 2));
    await run(
      [
        "exec",
        "wrangler",
        "deploy",
        "--config",
        configPath,
        ...(command === "dry-run"
          ? ["--dry-run", "--outdir", "work/worker-build"]
          : []),
      ],
      { ...env, ...credentials },
    );
  }
} catch (error) {
  // Only our controlled errors are printable. Network/provider errors may contain secrets.
  const safeMessages = [
    "Missing local configuration:",
    "Run using pnpm",
    "Fill CLOUDFLARE",
    "Cloudflare account access check failed",
    "Cloudflare command failed",
    "Missing Supabase public configuration",
  ];
  console.error(
    error instanceof Error &&
      safeMessages.some((text) => error.message.startsWith(text))
      ? error.message
      : "Cloudflare operation failed; credentials were not printed.",
  );
  process.exitCode = 1;
}
