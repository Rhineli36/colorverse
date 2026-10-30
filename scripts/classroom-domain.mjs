// Independent gateway only. Never rebuild/deploy colorverse-dev or its frozen assets.
import { readFile, writeFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import { resolve } from "node:path";
import { spawn } from "node:child_process";
const cf = parseEnv(await readFile(".env.cloudflare.local", "utf8"));
const command = process.argv[2],
  name = "colorverse-domain-gateway",
  hostname = "colorverse.de5.net";
if (!["deploy", "bind", "rollback"].includes(command))
  throw Error("USE_DEPLOY_BIND_OR_ROLLBACK");
async function api(path, body) {
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${cf.CLOUDFLARE_ACCOUNT_ID}/workers/${path}`,
    {
      method: body ? "PUT" : "GET",
      headers: {
        Authorization: `Bearer ${cf.CLOUDFLARE_API_TOKEN}`,
        "Content-Type": "application/json",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(30000),
    },
  );
  const value = await response.json();
  if (!response.ok || !value.success)
    throw Error(
      `CLOUDFLARE_${response.status}: ${JSON.stringify(value.errors)}`,
    );
  return value.result;
}
if (command === "deploy") {
  // Preserve deployed routing identifiers; no credentials or emails go into source/config.
  const settings = await api(`scripts/${name}/settings`);
  const vars = Object.fromEntries(
    settings.bindings
      .filter((b) => b.type === "plain_text")
      .map((b) => [b.name, b.text]),
  );
  for (const key of ["REVIEW_SUBJECTS", "REVIEW_CLASS_IDS"])
    if (!Array.isArray(JSON.parse(vars[key])) || !JSON.parse(vars[key]).length)
      throw Error("REVIEW_ROUTING_IDS_MISSING");
  const config = {
    name,
    main: resolve("apps/worker/src/domain-gateway.ts"),
    compatibility_date: "2026-10-30",
    workers_dev: true,
    services: [
      { binding: "CLASSROOM", service: "colorverse-classroom-next" },
      { binding: "COMPETITION", service: "colorverse-dev" },
    ],
    vars,
  };
  const path = resolve("work/wrangler.domain-gateway.json");
  await writeFile(path, JSON.stringify(config, null, 2));
  const child = spawn(
    process.execPath,
    [
      "node_modules/wrangler/bin/wrangler.js",
      "deploy",
      "--config",
      path,
      ...(process.argv.includes("--dry-run") ? ["--dry-run"] : []),
    ],
    { env: { ...process.env, ...cf }, stdio: "inherit", windowsHide: true },
  );
  await new Promise((ok, no) => {
    child.on("error", no);
    child.on("exit", (code) =>
      code === 0 ? ok() : no(Error("GATEWAY_DEPLOY_FAILED")),
    );
  });
} else {
  const domain = (await api("domains")).find((d) => d.hostname === hostname);
  if (!domain || !["colorverse-dev", name].includes(domain.service))
    throw Error("UNEXPECTED_DOMAIN_BINDING");
  const service = command === "rollback" ? "colorverse-dev" : name;
  const result = await api("domains", {
    hostname,
    zone_id: domain.zone_id,
    service,
    environment: "production",
    override_existing_origin: true,
  });
  console.log(
    JSON.stringify({
      hostname: result.hostname,
      service: result.service,
      enabled: result.enabled,
    }),
  );
}
