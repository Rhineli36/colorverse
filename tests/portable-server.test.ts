import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, writeFile, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { createPortableServer, staticAssets } from "../apps/server/src/server";
import { serverImages } from "../apps/server/src/images";
import { handleRequest } from "../apps/worker/src/index";
let root: string,
  origin: string,
  server: ReturnType<typeof createPortableServer>;
beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "colorverse-server-test-"));
  await mkdir(join(root, "assets"));
  await writeFile(join(root, "index.html"), "<main>test site</main>");
  await writeFile(join(root, "assets", "app.js"), "export default 1");
  const env = {
    ASSETS: await staticAssets(root),
    AUTH_PROXY_ENABLED: "true",
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
  };
  server = createPortableServer(
    env,
    "https://class.example",
    (request, environment) =>
      handleRequest(request, environment, async () =>
        Response.json({ access_token: "test-token" }),
      ),
  );
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
  const address = server.address();
  if (!address || typeof address === "string") throw Error("NO_ADDRESS");
  origin = `http://127.0.0.1:${address.port}`;
});
afterAll(async () => {
  await new Promise<void>((ok, bad) =>
    server.close((e) => (e ? bad(e) : ok())),
  );
  await rm(root, { recursive: true, force: true });
});
describe("portable production classroom adapter", () => {
  it("serves static assets and client routes while retaining strict API boundaries", async () => {
    expect(await (await fetch(origin + "/")).text()).toContain("test site");
    expect((await fetch(origin + "/exhibition-route")).status).toBe(200);
    const asset = await fetch(origin + "/assets/app.js");
    expect(asset.headers.get("content-type")).toContain("javascript");
    expect(asset.headers.get("cache-control")).toContain("immutable");
    for (const path of [
      "/.env",
      "/assets/missing.js",
      "/api/v1/dev/login",
      "/%2Esecret",
    ])
      expect((await fetch(origin + path)).status).toBe(404);
    const health = await (await fetch(origin + "/api/v1/health")).json();
    expect(health).toMatchObject({ development: false, cloudWrites: false });
  });
  it("transfers login JSON through the real HTTP adapter with same-origin checks", async () => {
    const response = await fetch(
      origin + "/api/supabase/auth/v1/token?grant_type=password",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://class.example",
        },
        body: JSON.stringify({ email: "x@example.test", password: "example" }),
      },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ access_token: "test-token" });
    expect(
      (
        await fetch(
          origin + "/api/supabase/auth/v1/token?grant_type=password",
          {
            method: "POST",
            headers: { Origin: "https://evil.test" },
            body: "{}",
          },
        )
      ).status,
    ).toBe(403);
  });
  it("creates bounded WebP previews without upscaling and leaves original image bytes intact", async () => {
    const source = await sharp({
        create: { width: 320, height: 160, channels: 3, background: "#c567ae" },
      })
        .png()
        .toBuffer(),
      before = Buffer.from(source);
    const output = await serverImages
      .input(new Blob([source]).stream())
      .transform({ width: 2048, height: 2048, fit: "scale-down" })
      .output({ format: "image/webp", quality: 90, anim: false });
    const bytes = Buffer.from(await output.response().arrayBuffer());
    expect(await sharp(bytes).metadata()).toMatchObject({
      format: "webp",
      width: 320,
      height: 160,
    });
    expect(source).toEqual(before);
    await expect(
      serverImages
        .input(new Blob([new Uint8Array([1, 2, 3])]).stream())
        .transform({ width: 200, height: 200, fit: "scale-down" })
        .output({ format: "image/webp" }),
    ).rejects.toThrow();
  });
});
