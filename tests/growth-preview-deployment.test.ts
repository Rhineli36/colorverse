import { expect, it, vi } from "vitest";
import { growthPreviewRequest } from "../apps/worker/src/growth-preview-entry";

it("serves only read-only prefixed static assets, strips credentials, and never offers classroom APIs", async () => {
  const env = {
    ASSETS: {
      fetch: vi.fn<(request: Request) => Promise<Response>>(
        async () =>
          new Response("asset", {
            headers: { "Content-Type": "text/javascript" },
          }),
      ),
    },
  };
  const response = await growthPreviewRequest(
    new Request("https://colorverse.de5.net/growth-preview/assets/a.js", {
      headers: { Authorization: "Bearer private", Cookie: "private=true" },
    }),
    env,
  );
  expect(response.status).toBe(200);
  expect(response.headers.get("Cache-Control")).toContain("immutable");
  const forwarded = env.ASSETS.fetch.mock.calls[0]?.[0] as unknown as Request;
  expect(new URL(forwarded.url).pathname).toBe("/assets/a.js");
  expect(forwarded.headers.has("Authorization")).toBe(false);
  expect(forwarded.headers.has("Cookie")).toBe(false);
  for (const path of [
    "/api/v1/cloud/session",
    "/growth-preview/api/v1/cloud/session",
    "/growth-preview/src/main.tsx",
  ]) {
    expect(
      (
        await growthPreviewRequest(
          new Request("https://colorverse.de5.net" + path),
          env,
        )
      ).status,
    ).toBe(404);
  }
  expect(
    (
      await growthPreviewRequest(
        new Request("https://colorverse.de5.net/growth-preview/", {
          method: "POST",
          body: "test",
        }),
        env,
      )
    ).status,
  ).toBe(405);
  expect(env.ASSETS.fetch).toHaveBeenCalledTimes(1);
});
it("redirects the folder root and serves HTML without caching stale releases", async () => {
  const env = {
    ASSETS: {
      fetch: vi.fn<(request: Request) => Promise<Response>>(
        async () => new Response("html"),
      ),
    },
  };
  const redirect = await growthPreviewRequest(
    new Request("https://colorverse.de5.net/growth-preview?view=winter"),
    env,
  );
  expect(redirect.status).toBe(308);
  expect(redirect.headers.get("Location")).toBe(
    "https://colorverse.de5.net/growth-preview/?view=winter",
  );
  const response = await growthPreviewRequest(
    new Request("https://colorverse.de5.net/growth-preview/"),
    env,
  );
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(
    new URL((env.ASSETS.fetch.mock.calls[0]?.[0] as unknown as Request).url)
      .pathname,
  ).toBe("/index.html");
  env.ASSETS.fetch.mockImplementationOnce(
    async () => new Response("missing", { status: 404 }),
  );
  const missing = await growthPreviewRequest(
    new Request("https://colorverse.de5.net/growth-preview/assets/missing.js"),
    env,
  );
  expect(missing.status).toBe(404);
  expect(missing.headers.get("Cache-Control")).toBe("no-store");
});
