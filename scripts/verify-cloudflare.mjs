import { mkdir, writeFile } from "node:fs/promises";

const target = process.argv[2];
if (
  !target ||
  !/^https:\/\/[a-z0-9-]+\.[a-z0-9-]+\.workers\.dev\/?$/.test(target)
) {
  console.error(
    "Usage: pnpm cloud:verify https://<worker>.<account>.workers.dev",
  );
  process.exit(1);
}
const base = target.replace(/\/$/, "");
const results = [];
for (const [path, method, token, status] of [
  ["/", "GET", "", 200],
  ["/api/v1/health", "GET", "", 200],
  ["/api/v1/cloud/session", "GET", "", 401],
  ["/api/v1/cloud/session", "GET", "invalid.token.test", 401],
  ["/api/v1/dev/login", "POST", "", 404],
  ["/api/v1/assets", "POST", "", 404],
  ["/api/v1/cloud/session", "POST", "", 405],
]) {
  try {
    const response = await fetch(base + path, {
      method,
      headers: {
        "Cache-Control": "no-cache",
        ...(token
          ? { Authorization: `Bearer ${token}`, "X-Role": "teacher" }
          : {}),
      },
      signal: AbortSignal.timeout(15000),
      redirect: "error",
    });
    const body = path.startsWith("/api/")
      ? await response.json()
      : await response.text();
    const passed =
      response.status === status &&
      (path !== "/api/v1/health" ||
        (body.stage === "auth-pilot" && body.cloudWrites === false)) &&
      (path !== "/" || body.includes('<div id="root">')) &&
      (path !== "/api/v1/cloud/session" ||
        method !== "GET" ||
        body.error?.code === "UNAUTHENTICATED");
    const result = {
      path,
      method,
      withInvalidToken: Boolean(token),
      status: response.status,
      passed,
    };
    results.push(result);
    console.log(JSON.stringify(result));
  } catch {
    results.push({
      path,
      method,
      passed: false,
      error: "Network or response failure",
    });
    console.log(JSON.stringify(results.at(-1)));
  }
}
await mkdir("outputs", { recursive: true });
await writeFile(
  "outputs/cloudflare-live-api-report.json",
  JSON.stringify({ base, results }, null, 2),
);
if (results.some((result) => !result.passed)) process.exitCode = 1;
