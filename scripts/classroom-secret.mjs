import { readFile } from "node:fs/promises";
import { parseEnv } from "node:util";
try {
  const cf = parseEnv(await readFile(".env.cloudflare.local", "utf8")),
    sb = parseEnv(await readFile(".env.supabase.local", "utf8"));
  if (!sb.SUPABASE_SECRET_KEY?.startsWith("sb_secret_"))
    throw new Error("SECRET_KEY_REQUIRED");
  const r = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${cf.CLOUDFLARE_ACCOUNT_ID}/workers/scripts/colorverse-dev/secrets`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${cf.CLOUDFLARE_API_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "SUPABASE_SECRET_KEY",
        text: sb.SUPABASE_SECRET_KEY,
        type: "secret_text",
      }),
      redirect: "error",
      signal: AbortSignal.timeout(20000),
    },
  );
  const result = await r.json();
  if (!r.ok || !result.success) throw new Error("WORKER_SECRET_UPLOAD_FAILED");
  console.log("Backend Storage secret installed; value not printed.");
} catch {
  console.error("Backend secret setup failed; credentials not printed.");
  process.exitCode = 1;
}
