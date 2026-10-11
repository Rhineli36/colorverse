import { readFile, writeFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import { X509Certificate } from "node:crypto";
import { readDatabaseConfig } from "./supabase-database.mjs";

const command = process.argv[2];
if (!["check", "create"].includes(command)) {
  console.error("Usage: pnpm cloud:hyperdrive check|create");
  process.exit(1);
}
let stage = "configuration";
try {
  const cf = parseEnv(await readFile(".env.cloudflare.local", "utf8"));
  if (
    !/^[a-f0-9]{32}$/i.test(cf.CLOUDFLARE_ACCOUNT_ID ?? "") ||
    !cf.CLOUDFLARE_API_TOKEN
  )
    throw new Error("LOCAL_CLOUDFLARE_CONFIGURATION_REQUIRED");
  const base = `https://api.cloudflare.com/client/v4/accounts/${cf.CLOUDFLARE_ACCOUNT_ID}`;
  const api = async (path, body) => {
    const response = await fetch(base + path, {
      method: body ? "POST" : "GET",
      headers: {
        Authorization: `Bearer ${cf.CLOUDFLARE_API_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
      redirect: "error",
      signal: AbortSignal.timeout(30000),
    });
    const result = await response.json();
    if (!response.ok || !result.success) {
      // Do not echo provider messages: origin credentials may be reflected in them.
      console.error(
        JSON.stringify({
          stage,
          httpStatus: response.status,
          providerCodes: result.errors?.map((item) => item.code),
        }),
      );
      throw new Error("CLOUDFLARE_DATABASE_OPERATION_FAILED");
    }
    return result.result;
  };
  stage = "hyperdrive_permission";
  const configs = await api("/hyperdrive/configs");
  stage = "certificate_permission";
  const certificates = await api("/mtls_certificates");
  if (command === "check") {
    console.log(
      JSON.stringify({
        status: "hyperdrive_and_certificate_read_access_verified",
        createPermissionProven: false,
      }),
    );
  } else {
    const db = await readDatabaseConfig();
    const reader = parseEnv(
      await readFile(".env.cloud-database.local", "utf8"),
    );
    if (
      reader.CLOUD_DATABASE_USER !== "colorverse_identity_reader" ||
      !/^[a-f0-9]{64}$/.test(reader.CLOUD_DATABASE_PASSWORD ?? "")
    )
      throw new Error("RESTRICTED_READER_REQUIRED");
    const ca = await readFile(db.SUPABASE_DB_CA_FILE, "utf8");
    const fingerprint = new X509Certificate(ca).fingerprint256;
    const matches = certificates.filter(
      (item) =>
        item.ca &&
        item.certificates &&
        new X509Certificate(item.certificates).fingerprint256 === fingerprint,
    );
    let certificate = matches[0];
    if (!certificate) {
      stage = "upload_database_root_ca";
      certificate = await api("/mtls_certificates", {
        ca: true,
        certificates: ca,
        name: "colorverse-supabase-root",
      });
    }
    if (!certificate?.id) throw new Error("ROOT_CERTIFICATE_ID_REQUIRED");
    const existing = configs.filter(
      (item) => item.name === "colorverse-enrollment-dev",
    );
    if (existing.length > 1)
      throw new Error("MULTIPLE_HYPERDRIVE_CONFIGURATIONS");
    let configuration = existing[0];
    if (!configuration) {
      stage = "create_restricted_hyperdrive";
      configuration = await api("/hyperdrive/configs", {
        name: "colorverse-enrollment-dev",
        origin: {
          host: db.SUPABASE_DB_HOST,
          port: 5432,
          database: "postgres",
          scheme: "postgres",
          user: reader.CLOUD_DATABASE_USER,
          password: reader.CLOUD_DATABASE_PASSWORD,
        },
        caching: { disabled: true },
        mtls: { ca_certificate_id: certificate.id, sslmode: "verify-full" },
        origin_connection_limit: 5,
      });
    }
    if (
      !/^[a-f0-9]{32}$/i.test(configuration.id ?? "") ||
      configuration.origin?.host !== db.SUPABASE_DB_HOST ||
      configuration.origin?.user !== reader.CLOUD_DATABASE_USER ||
      configuration.origin?.database !== "postgres" ||
      configuration.caching?.disabled !== true ||
      configuration.mtls?.sslmode !== "verify-full" ||
      configuration.mtls?.ca_certificate_id !== certificate.id
    )
      throw new Error("HYPERDRIVE_CONFIGURATION_REQUIRES_REVIEW");
    await writeFile(
      ".env.hyperdrive.local",
      `# Non-secret binding ID; database credentials stay in Hyperdrive.\nCLOUDFLARE_HYPERDRIVE_ID=${configuration.id}\n`,
    );
    console.log(
      JSON.stringify({
        status: "restricted_hyperdrive_ready",
        queryCaching: false,
        tlsMode: "verify-full",
        originConnections: configuration.origin_connection_limit,
      }),
    );
  }
} catch (error) {
  const safe = error.code ?? error.message;
  console.error(
    JSON.stringify({
      status: "failed",
      stage,
      code: /^[A-Z0-9_]{1,50}$/.test(safe ?? "")
        ? safe
        : "HYPERDRIVE_OPERATION_FAILED",
    }),
  );
  process.exitCode = 1;
}
