import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { serverImages } from "./images";
import { createPortableServer, staticAssets } from "./server";
import type { DatabaseBinding } from "../../worker/src/database-client";
import type { WorkerEnvironment } from "../../worker/src/index";

async function database(name: string): Promise<DatabaseBinding> {
  const value = process.env[name];
  if (!value) throw new Error("DATABASE_CONFIGURATION_REQUIRED");
  const url = new URL(value);
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !url.hostname ||
    !url.username ||
    !url.password ||
    url.search ||
    url.hash ||
    /^(postgres|supabase_admin)(\.|$)/.test(decodeURIComponent(url.username))
  )
    throw new Error("RESTRICTED_DATABASE_URL_REQUIRED");
  const ca = await readFile(process.env.DATABASE_CA_FILE ?? "", "utf8");
  if (!ca.includes("-----BEGIN CERTIFICATE-----"))
    throw new Error("DATABASE_CA_REQUIRED");
  return { connectionString: value, ssl: { rejectUnauthorized: true, ca } };
}
try {
  const origin = process.env.PUBLIC_ORIGIN ?? "";
  if (
    !origin.startsWith("https://") &&
    !(
      process.env.SERVER_LOCAL_TEST === "true" &&
      /^http:\/\/127\.0\.0\.1:\d+$/.test(origin)
    )
  )
    throw new Error("HTTPS_PUBLIC_ORIGIN_REQUIRED");
  if (
    !/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(
      process.env.SUPABASE_URL ?? "",
    ) ||
    !process.env.SUPABASE_PUBLISHABLE_KEY?.startsWith("sb_publishable_") ||
    !process.env.SUPABASE_SECRET_KEY?.startsWith("sb_secret_")
  )
    throw new Error("SUPABASE_CONFIGURATION_REQUIRED");
  const env: WorkerEnvironment = {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY: process.env.SUPABASE_PUBLISHABLE_KEY,
    SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
    AUTH_PROXY_ENABLED: "true",
    HYPERDRIVE: await database("DATABASE_READER_URL"),
    HYPERDRIVE_WRITER: await database("DATABASE_WRITER_URL"),
    IMAGES: serverImages,
    ASSETS: await staticAssets(resolve("apps/web/dist")),
  };
  const port = Number(process.env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("INVALID_PORT");
  const server = createPortableServer(env, origin);
  server.listen(port, process.env.SERVER_HOST ?? "0.0.0.0", () =>
    console.log(
      JSON.stringify({
        status: "classroom_server_ready",
        port,
        development: false,
      }),
    ),
  );
  server.requestTimeout = 60000;
  server.headersTimeout = 15000;
  for (const signal of ["SIGTERM", "SIGINT"] as const)
    process.on(signal, () => {
      server.close(() => process.exit(0));
      setTimeout(() => process.exit(1), 10000).unref();
    });
} catch {
  console.error(
    "Server configuration invalid or unavailable; credentials were not printed.",
  );
  process.exitCode = 1;
}
