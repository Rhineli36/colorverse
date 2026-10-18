import { describe, expect, it, vi } from "vitest";
import {
  handleRequest,
  type WorkerEnvironment,
} from "../apps/worker/src/index";
import worker from "../apps/worker/src/index";
import {
  readAuthConfig,
  loginError,
} from "../apps/web/src/features/auth/auth-client";

const id = "7d050bbd-2ea7-416c-b70b-748594dc9a05";
const user = {
  id,
  email: "student@example.test",
  email_confirmed_at: "2026-10-11T00:00:00Z",
};
const environment = (): WorkerEnvironment => ({
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
  ASSETS: { fetch: vi.fn(async () => new Response("static")) },
});
const request = (
  path = "/api/v1/cloud/session",
  token = "valid.token.test",
  method = "GET",
) =>
  new Request(`https://colorverse.example${path}`, {
    method,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

describe("cloud auth boundary", () => {
  it("preserves the Workers global fetch receiver in the real entry point", async () => {
    vi.stubGlobal("fetch", function (this: unknown) {
      expect(this).toBe(globalThis);
      return Promise.resolve(Response.json(user));
    });
    try {
      expect((await worker.fetch(request(), environment())).status).toBe(200);
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it("verifies with Auth and grants no role from arbitrary user metadata", async () => {
    const transport = vi.fn<typeof fetch>(async () =>
      Response.json({
        ...user,
        user_metadata: { role: "teacher" },
        app_metadata: { role: "admin" },
      }),
    );
    const result = await handleRequest(request(), environment(), transport);
    expect(result.status).toBe(200);
    expect(await result.json()).toEqual({
      identity: { id, email: user.email },
      access: "pending-enrollment",
      database: "not-configured",
      memberships: [],
      cloudWrites: false,
    });
    expect(transport.mock.calls[0][0]).toBe(
      "https://example.supabase.co/auth/v1/user",
    );
    expect(transport.mock.calls[0][1]?.headers).toEqual({
      Authorization: "Bearer valid.token.test",
      apikey: "sb_publishable_test",
    });
    expect(result.headers.get("cache-control")).toBe("no-store");
    expect(transport.mock.calls[0][1]?.redirect).toBe("manual");
    expect(result.headers.get("vary")).toBe("Authorization");
  });
  it.each(["", "invalid token", "a".repeat(8192)])(
    "rejects absent or malformed bearer before contacting Auth",
    async (token) => {
      const transport = vi.fn<typeof fetch>();
      expect(
        (
          await handleRequest(
            request(undefined, token),
            environment(),
            transport,
          )
        ).status,
      ).toBe(401);
      expect(transport).not.toHaveBeenCalled();
    },
  );
  it.each([401, 403])(
    "rejects expired/invalid tokens (%i) even with forged role headers",
    async (status) => {
      const input = request();
      input.headers.set("X-Role", "teacher");
      const result = await handleRequest(input, environment(), async () =>
        Response.json({ message: "private detail" }, { status }),
      );
      expect(result.status).toBe(401);
      expect(await result.text()).not.toContain("private detail");
    },
  );
  it.each([429, 500])(
    "keeps service failures distinct from invalid login (%i)",
    async (status) => {
      expect(
        (
          await handleRequest(
            request(),
            environment(),
            async () => new Response("secret", { status }),
          )
        ).status,
      ).toBe(503);
    },
  );
  it("handles network failure without leaking tokens or provider errors", async () => {
    const response = await handleRequest(request(), environment(), async () => {
      throw new Error("valid.token.test sb_secret_sensitive");
    });
    expect(response.status).toBe(503);
    expect(await response.text()).not.toMatch(/valid.token|sb_secret/);
  });
  it("rejects Auth redirects without forwarding bearer credentials", async () => {
    const transport = vi.fn<typeof fetch>(
      async () =>
        new Response(null, {
          status: 302,
          headers: { Location: "https://attacker.example" },
        }),
    );
    expect(
      (await handleRequest(request(), environment(), transport)).status,
    ).toBe(503);
    expect(transport).toHaveBeenCalledTimes(1);
    expect(transport.mock.calls[0][1]?.redirect).toBe("manual");
  });
  it.each([
    null,
    { ...user, id: "fake" },
    { ...user, email_confirmed_at: null },
    { ...user, email_confirmed_at: "bad" },
  ])("requires a verified email identity", async (body) => {
    expect(
      (
        await handleRequest(request(), environment(), async () =>
          Response.json(body),
        )
      ).status,
    ).toBe(401);
  });
  it("fails closed when server configuration is missing or points elsewhere", async () => {
    const env = environment();
    env.SUPABASE_URL = "https://attacker.example";
    const transport = vi.fn<typeof fetch>();
    expect((await handleRequest(request(), env, transport)).status).toBe(503);
    expect(transport).not.toHaveBeenCalled();
  });
  it("does not turn unknown API requests into the SPA or expose development login", async () => {
    const env = environment();
    for (const path of [
      "/api/v1/dev/login",
      "/api/v1/assets",
      "/api/v1/classes",
    ]) {
      expect((await handleRequest(request(path, "", "POST"), env)).status).toBe(
        404,
      );
    }
    expect(env.ASSETS.fetch).not.toHaveBeenCalled();
    const result = await handleRequest(request(undefined, "", "POST"), env);
    expect(result.status).toBe(405);
    expect(result.headers.get("allow")).toBe("GET");
  });
  it("serves static assets separately and honestly reports pilot health", async () => {
    const env = environment();
    expect(await (await handleRequest(request("/"), env)).text()).toBe(
      "static",
    );
    expect(
      await (await handleRequest(request("/api/v1/health", ""), env)).json(),
    ).toEqual({
      status: "ok",
      development: false,
      stage: "auth-pilot",
      cloudWrites: false,
      enrollmentDatabaseConfigured: false,
    });
  });
});
describe("browser configuration", () => {
  const config = {
    VITE_ENABLE_CLOUD_AUTH: "true",
    VITE_SUPABASE_URL: "https://example.supabase.co",
    VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
  };
  it("requires explicit opt-in and refuses secret keys", () => {
    expect(
      readAuthConfig({ ...config, VITE_ENABLE_CLOUD_AUTH: "false" }),
    ).toBeNull();
    expect(
      readAuthConfig({
        ...config,
        VITE_SUPABASE_PUBLISHABLE_KEY: "sb_secret_sensitive",
      }),
    ).toBeNull();
    expect(readAuthConfig(config)?.url).toBe(config.VITE_SUPABASE_URL);
  });
  it("uses actionable login errors without echoing provider internals", () => {
    expect(loginError(400, "invalid_credentials")).toContain("账号、密码");
    expect(loginError(429)).toContain("稍后");
    expect(loginError(400, "email_not_confirmed")).toContain("邮箱验证");
    expect(loginError()).toContain("无法连接");
  });
});
