import { describe, expect, it, vi } from "vitest";
import { authProxy } from "../apps/worker/src/auth-proxy";
import { readAuthConfig } from "../apps/web/src/features/auth/auth-client";
const env = {
  AUTH_PROXY_ENABLED: "true",
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
};
const request = (
  path = "token?grant_type=password",
  body: unknown = {
    email: "student@example.test",
    password: "not-a-real-password",
  },
  headers: Record<string, string> = {},
) =>
  new Request("https://class.example/api/supabase/auth/v1/" + path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://class.example",
      ...headers,
    },
    body: JSON.stringify(body),
  });
describe("same-origin login proxy", () => {
  it("forwards only password and refresh grants to the configured project, using the public key", async () => {
    const transport = vi.fn<typeof fetch>(async () =>
      Response.json({
        access_token: "test-token",
        refresh_token: "test-refresh",
      }),
    );
    const input = request();
    input.headers.set("apikey", "sb_secret_forged");
    input.headers.set("Cookie", "private=cookie");
    const result = await authProxy(input, env, transport);
    expect(result.status).toBe(200);
    expect(result.headers.get("Cache-Control")).toBe("no-store");
    const [url, options] = transport.mock.calls[0];
    expect(url).toBe(
      "https://example.supabase.co/auth/v1/token?grant_type=password",
    );
    const forwarded = new Headers(options?.headers);
    expect(forwarded.get("apikey")).toBe(env.SUPABASE_PUBLISHABLE_KEY);
    expect(forwarded.get("Cookie")).toBeNull();
    expect(forwarded.get("Authorization")).toBeNull();
    expect(options?.redirect).toBe("manual");
    expect(
      (
        await authProxy(
          request("token?grant_type=refresh_token", {
            refresh_token: "test-refresh",
          }),
          env,
          transport,
        )
      ).status,
    ).toBe(200);
  });
  it("cannot forward admin, signup, arbitrary destinations, unsupported grants or other-origin requests", async () => {
    const transport = vi.fn<typeof fetch>();
    for (const path of [
      "admin/users",
      "signup",
      "token?grant_type=client_credentials",
      "token?grant_type=password&target=https://evil.test",
      "logout?scope=global",
    ])
      expect((await authProxy(request(path), env, transport)).ok).toBe(false);
    expect(
      (
        await authProxy(
          request(undefined, undefined, { Origin: "https://evil.test" }),
          env,
          transport,
        )
      ).status,
    ).toBe(403);
    expect(transport).not.toHaveBeenCalled();
  });
  it("requires a bearer for user lookup and local logout and strips cookies/upstream response headers", async () => {
    const transport = vi.fn<typeof fetch>(
      async () =>
        new Response(null, {
          status: 204,
          headers: {
            "Set-Cookie": "secret=session",
            Location: "https://evil.test",
          },
        }),
    );
    expect(
      (await authProxy(request("logout?scope=local"), env, transport)).status,
    ).toBe(401);
    const response = await authProxy(
      request(
        "logout?scope=local",
        {},
        { Authorization: "Bearer test.token.valid" },
      ),
      env,
      transport,
    );
    expect(response.status).toBe(204);
    expect(response.headers.get("Set-Cookie")).toBeNull();
    expect(response.headers.get("Location")).toBeNull();
    const user = await authProxy(
      new Request("https://class.example/api/supabase/auth/v1/user", {
        headers: { Authorization: "Bearer test.token.valid" },
      }),
      env,
      async () => Response.json({ id: "student" }),
    );
    expect(user.status).toBe(200);
  });
  it("preserves safe login error codes and rate-limit status without leaking provider errors", async () => {
    for (const [status, code] of [
      [400, "invalid_credentials"],
      [429, "over_request_rate_limit"],
      [500, "internal_failure"],
    ] as const) {
      const response = await authProxy(request(), env, async () =>
        Response.json({ code, message: "private database detail" }, { status }),
      );
      expect(response.status).toBe(status === 500 ? 503 : status);
      expect(await response.text()).not.toContain("private database detail");
    }
  });
  it("rejects oversized/invalid bodies, redirects and unconfigured endpoints", async () => {
    const transport = vi.fn<typeof fetch>();
    expect(
      (
        await authProxy(
          request(undefined, { email: "x", password: "x".repeat(18000) }),
          env,
          transport,
        )
      ).status,
    ).toBe(413);
    expect(
      (
        await authProxy(
          request(undefined, { email: "x", password: "x", source: "admin" }),
          env,
          transport,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await authProxy(
          request(),
          { ...env, AUTH_PROXY_ENABLED: undefined },
          transport,
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await authProxy(
          request(),
          { ...env, SUPABASE_URL: "https://evil.test" },
          transport,
        )
      ).status,
    ).toBe(503);
    expect(transport).not.toHaveBeenCalled();
    expect(
      (
        await authProxy(
          request(),
          env,
          async () => new Response(null, { status: 302 }),
        )
      ).status,
    ).toBe(503);
  });
  it("keeps the original project as the session storage identity while enabling an explicit proxy flag", () => {
    expect(
      readAuthConfig({
        VITE_ENABLE_CLOUD_AUTH: "true",
        VITE_SUPABASE_URL: env.SUPABASE_URL,
        VITE_SUPABASE_PUBLISHABLE_KEY: env.SUPABASE_PUBLISHABLE_KEY,
        VITE_USE_AUTH_PROXY: "true",
      }),
    ).toMatchObject({ url: env.SUPABASE_URL, useProxy: true });
  });
});
