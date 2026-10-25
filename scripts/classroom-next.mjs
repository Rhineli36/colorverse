// Only this separate Worker may receive the classroom rollout. Never use cloud:deploy here.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { parseEnv } from "node:util";
import { resolve } from "node:path";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { readDatabaseConfig, connectDatabase } from "./supabase-database.mjs";
const name = "colorverse-classroom-next",
  command = process.argv[2];
if (!["build", "deploy", "migrate"].includes(command))
  throw Error("USE_BUILD_DEPLOY_OR_MIGRATE");
const run = (args, env = process.env, input) =>
  new Promise((ok, no) => {
    if (!process.env.npm_execpath) throw Error("RUN_WITH_PNPM");
    const child = spawn(process.execPath, [process.env.npm_execpath, ...args], {
      env,
      windowsHide: true,
      stdio: [input ? "pipe" : "ignore", "inherit", "inherit"],
    });
    if (input) child.stdin.end(input);
    child.on("error", no);
    child.on("exit", (code) =>
      code === 0 ? ok() : no(Error("CLASSROOM_NEXT_COMMAND_FAILED")),
    );
  });
if (command === "migrate") {
  const db = await connectDatabase(await readDatabaseConfig());
  try {
    await db.query("BEGIN");
    await db.query("SELECT pg_advisory_xact_lock(7301941)");
    for (const [version, file] of [
      [12, "012-classroom-management"],
      [13, "013-submission-content-history"],
    ]) {
      const sql = await readFile(`apps/api/migrations/${file}.sql`, "utf8"),
        hash = createHash("sha256").update(sql).digest("hex");
      const previous = (
        await db.query(
          "SELECT sha256 FROM colorverse.course_migrations WHERE version=$1",
          [version],
        )
      ).rows[0];
      if (previous && previous.sha256 !== hash)
        throw Error("MIGRATION_HASH_MISMATCH");
      if (!previous) {
        await db.query(sql);
        await db.query(
          "INSERT INTO colorverse.course_migrations(version,sha256) VALUES($1,$2)",
          [version, hash],
        );
        if (version === 12)
          await db.query(`INSERT INTO colorverse.classroom_login_history(user_id,first_seen,last_seen)
     SELECT u.id,a.last_sign_in_at,a.last_sign_in_at FROM colorverse.users u JOIN auth.users a ON a.id::text=u.auth_subject
     WHERE a.last_sign_in_at IS NOT NULL AND EXISTS(SELECT 1 FROM colorverse.enrollments e JOIN colorverse.classes c ON c.id=e.class_id WHERE e.user_id=u.id AND NOT EXISTS(SELECT 1 FROM colorverse.isolated_account_courses i WHERE i.course_id=c.course_id)) ON CONFLICT DO NOTHING`);
      }
    }
    await db.query("COMMIT");
    console.log(
      JSON.stringify({
        status: "classroom_migration_ready",
        version: 13,
        reviewRecordsUpdated: false,
      }),
    );
  } catch (e) {
    await db.query("ROLLBACK");
    throw e;
  } finally {
    await db.end();
  }
} else {
  const publicEnv = parseEnv(await readFile("apps/web/.env.local", "utf8"));
  const site = resolve("work/classroom-next-site");
  await mkdir("work", { recursive: true });
  const env = {
    ...process.env,
    ...publicEnv,
    VITE_ENABLE_CLOUD_AUTH: "true",
    VITE_EXHIBITION_MODE: "false",
    VITE_CLASSROOM_NEXT: "true",
    VITE_USE_AUTH_PROXY: "true",
    VITE_BASE_PATH: "/",
  };
  await run(
    [
      "exec",
      "vite",
      "build",
      "--config",
      "apps/web/vite.config.ts",
      "--outDir",
      site,
    ],
    env,
  );
  const reader = parseEnv(await readFile(".env.hyperdrive.local", "utf8")),
    writer = parseEnv(
      await readFile(".env.classroom-hyperdrive.local", "utf8"),
    );
  const config = {
    name,
    main: resolve("apps/worker/src/classroom-next-entry.ts"),
    compatibility_date: "2026-10-25",
    compatibility_flags: ["nodejs_compat"],
    workers_dev: true,
    assets: {
      directory: site,
      binding: "ASSETS",
      not_found_handling: "single-page-application",
      run_worker_first: ["/api/*", "/review*", "/exhibition*"],
    },
    vars: {
      SUPABASE_URL: publicEnv.VITE_SUPABASE_URL,
      SUPABASE_PUBLISHABLE_KEY: publicEnv.VITE_SUPABASE_PUBLISHABLE_KEY,
      AUTH_PROXY_ENABLED: "true",
      CLASSROOM_NEXT: "true",
    },
    hyperdrive: [
      { binding: "HYPERDRIVE", id: reader.CLOUDFLARE_HYPERDRIVE_ID },
      { binding: "HYPERDRIVE_WRITER", id: writer.CLOUDFLARE_HYPERDRIVE_ID },
    ],
    images: { binding: "IMAGES" },
  };
  if (config.name === "colorverse-dev" || config.name !== name)
    throw Error("FROZEN_WORKER_PROTECTED");
  const path = resolve("work/wrangler.classroom-next.json");
  await writeFile(path, JSON.stringify(config, null, 2));
  const cf = parseEnv(await readFile(".env.cloudflare.local", "utf8"));
  if (command === "build")
    await run(
      [
        "exec",
        "wrangler",
        "deploy",
        "--config",
        path,
        "--dry-run",
        "--outdir",
        "work/classroom-next-worker",
      ],
      { ...env, ...cf },
    );
  else {
    await run(["exec", "wrangler", "deploy", "--config", path], {
      ...env,
      ...cf,
    });
    const sb = await readDatabaseConfig();
    await run(
      [
        "exec",
        "wrangler",
        "secret",
        "put",
        "SUPABASE_SECRET_KEY",
        "--config",
        path,
      ],
      { ...env, ...cf },
      sb.SUPABASE_SECRET_KEY + "\n",
    );
  }
}
