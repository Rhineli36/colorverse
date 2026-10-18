import { spawn, execFileSync } from "node:child_process";
import { mkdir, writeFile, readFile, cp } from "node:fs/promises";
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
let phase = "account_check";
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
      VITE_EXHIBITION_MODE: "false",
      VITE_USE_AUTH_PROXY: "true",
      VITE_SOURCE_REVISION: execFileSync(
        "git",
        ["rev-parse", "--short", "HEAD"],
        { cwd: root, encoding: "utf8" },
      ).trim(),
      VITE_RELEASE_ID: new Date().toISOString(),
    };
    phase = "static_build";
    await run(["build:competition"], env);
    phase = "classroom_build";
    await run(["build"], env);
    phase = "copy_static_assets";
    await cp(
      resolve(root, "work/competition-site"),
      resolve(root, "apps/web/dist/exhibition"),
      { recursive: true },
    );
    const config = JSON.parse(
      await readFile(resolve(root, "wrangler.json"), "utf8"),
    );
    config.main = "../apps/worker/src/index.ts";
    config.assets.directory = "../apps/web/dist";
    config.vars = {
      SUPABASE_URL: url,
      SUPABASE_PUBLISHABLE_KEY: key,
      AUTH_PROXY_ENABLED: "true",
    };
    let hyperdrive;
    try {
      hyperdrive = parseEnv(
        await readFile(resolve(root, ".env.hyperdrive.local"), "utf8"),
      );
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    if (hyperdrive) {
      const id = hyperdrive.CLOUDFLARE_HYPERDRIVE_ID;
      if (!/^[a-f0-9]{32}$/i.test(id ?? ""))
        throw new Error("Invalid Hyperdrive binding configuration");
      if (command === "deploy") {
        phase = "reader_binding_check";
        const response = await fetch(
          `https://api.cloudflare.com/client/v4/accounts/${credentials.CLOUDFLARE_ACCOUNT_ID}/hyperdrive/configs/${id}`,
          {
            headers: {
              Authorization: `Bearer ${credentials.CLOUDFLARE_API_TOKEN}`,
            },
            signal: AbortSignal.timeout(15000),
            redirect: "error",
          },
        );
        const binding = await response.json();
        if (
          !response.ok ||
          !binding.success ||
          binding.result.origin?.user !== "colorverse_identity_reader" ||
          binding.result.origin?.host !== `db.${new URL(url).hostname}` ||
          binding.result.caching?.disabled !== true ||
          binding.result.mtls?.sslmode !== "verify-full"
        )
          throw new Error(
            "Hyperdrive must use the restricted reader, disabled query cache and verified TLS",
          );
      }
      config.hyperdrive = [{ binding: "HYPERDRIVE", id }];
    }
    await mkdir(resolve(root, "work"), { recursive: true });
    let writerBinding;
    try {
      writerBinding = parseEnv(
        await readFile(
          resolve(root, ".env.classroom-hyperdrive.local"),
          "utf8",
        ),
      );
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    if (writerBinding) {
      const id = writerBinding.CLOUDFLARE_HYPERDRIVE_ID;
      if (!/^[a-f0-9]{32}$/i.test(id ?? ""))
        throw new Error("Invalid Hyperdrive binding configuration");
      if (command === "deploy") {
        phase = "writer_binding_check";
        const response = await fetch(
          `https://api.cloudflare.com/client/v4/accounts/${credentials.CLOUDFLARE_ACCOUNT_ID}/hyperdrive/configs/${id}`,
          {
            headers: {
              Authorization: `Bearer ${credentials.CLOUDFLARE_API_TOKEN}`,
            },
            signal: AbortSignal.timeout(15000),
            redirect: "error",
          },
        );
        const binding = await response.json();
        if (
          !response.ok ||
          !binding.success ||
          binding.result.origin?.user !== "colorverse_classroom_writer" ||
          binding.result.origin?.host !== `db.${new URL(url).hostname}` ||
          binding.result.caching?.disabled !== true ||
          binding.result.mtls?.sslmode !== "verify-full"
        )
          throw new Error(
            "Hyperdrive must use the restricted classroom writer and verified TLS",
          );
      }
      config.hyperdrive = [
        ...(config.hyperdrive ?? []),
        { binding: "HYPERDRIVE_WRITER", id },
      ];
      config.images = { binding: "IMAGES" };
    }
    phase = "write_deploy_config";
    const configPath = resolve(root, "work/wrangler.cloudflare.json");
    await writeFile(configPath, JSON.stringify(config, null, 2));
    phase = "worker_publish";
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
    "Invalid Hyperdrive binding configuration",
    "Hyperdrive must use",
  ];
  console.error(
    error instanceof Error &&
      safeMessages.some((text) => error.message.startsWith(text))
      ? error.message
      : `Cloudflare operation failed at ${phase}; credentials were not printed.`,
  );
  process.exitCode = 1;
}
