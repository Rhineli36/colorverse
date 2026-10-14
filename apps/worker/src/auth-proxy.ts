import type { AuthEnvironment } from "./auth";

export interface AuthProxyEnvironment extends AuthEnvironment {
  AUTH_PROXY_ENABLED?: string;
}
const reply = (
  status: number,
  message: string,
  code = "AUTH_PROXY_UNAVAILABLE",
) =>
  Response.json(
    { message, code },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        Vary: "Authorization, Origin",
      },
    },
  );
export async function authProxy(
  request: Request,
  env: AuthProxyEnvironment,
  transport: typeof fetch,
) {
  if (env.AUTH_PROXY_ENABLED !== "true") return reply(404, "登录转接未启用");
  const url = new URL(request.url),
    path = url.pathname.slice("/api/supabase".length);
  const method = request.method;
  const allowed =
    (path === "/auth/v1/token" && method === "POST") ||
    (path === "/auth/v1/user" && method === "GET") ||
    (path === "/auth/v1/logout" && method === "POST");
  if (!allowed) return reply(404, "接口未开放", "NOT_FOUND");
  if (
    request.headers.get("Origin") &&
    request.headers.get("Origin") !== url.origin
  )
    return reply(403, "请从本站登录", "ORIGIN_FORBIDDEN");
  if (
    !/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(env.SUPABASE_URL ?? "") ||
    !env.SUPABASE_PUBLISHABLE_KEY?.startsWith("sb_publishable_")
  )
    return reply(503, "登录服务未配置");
  if (
    path.endsWith("token") &&
    (!["password", "refresh_token"].includes(
      url.searchParams.get("grant_type") ?? "",
    ) ||
      [...url.searchParams.keys()].some((k) => k !== "grant_type"))
  )
    return reply(400, "登录方式无效", "INVALID_INPUT");
  if (
    path.endsWith("logout") &&
    ([...url.searchParams.keys()].some((k) => k !== "scope") ||
      (url.searchParams.has("scope") &&
        url.searchParams.get("scope") !== "local"))
  )
    return reply(400, "退出方式无效", "INVALID_INPUT");
  if (path.endsWith("user") && url.search)
    return reply(400, "请求无效", "INVALID_INPUT");
  const headers = new Headers({
    apikey: env.SUPABASE_PUBLISHABLE_KEY,
    "Content-Type": "application/json",
  });
  if (!path.endsWith("token")) {
    const authorization = request.headers.get("Authorization") ?? "";
    if (
      !/^Bearer [A-Za-z0-9._~-]+$/i.test(authorization) ||
      authorization.length > 8192
    )
      return reply(401, "请先登录", "UNAUTHENTICATED");
    headers.set("Authorization", authorization);
  }
  try {
    let body: Uint8Array | undefined;
    if (path.endsWith("token")) {
      if (Number(request.headers.get("Content-Length")) > 16384)
        return reply(413, "登录内容过大", "TOO_LARGE");
      const reader = request.body?.getReader();
      if (!reader) return reply(400, "缺少登录内容", "INVALID_INPUT");
      const chunks: Uint8Array[] = [];
      let length = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.length;
        if (length > 16384) {
          await reader.cancel();
          return reply(413, "登录内容过大", "TOO_LARGE");
        }
        chunks.push(value);
      }
      body = new Uint8Array(length);
      let offset = 0;
      for (const chunk of chunks) {
        body.set(chunk, offset);
        offset += chunk.length;
      }
      const payload = JSON.parse(new TextDecoder().decode(body));
      const keys =
        url.searchParams.get("grant_type") === "password"
          ? ["email", "password", "gotrue_meta_security"]
          : ["refresh_token"];
      if (
        !payload ||
        Array.isArray(payload) ||
        typeof payload !== "object" ||
        Object.keys(payload).some((k) => !keys.includes(k)) ||
        (keys[0] === "email"
          ? typeof payload.email !== "string" ||
            typeof payload.password !== "string"
          : typeof payload.refresh_token !== "string")
      )
        return reply(400, "登录内容无效", "INVALID_INPUT");
    }
    const response = await transport(
      `${env.SUPABASE_URL}${path}${url.search}`,
      {
        method,
        headers,
        body: body as BodyInit | undefined,
        redirect: "manual",
        signal: AbortSignal.timeout(8000),
      },
    );
    if (response.status >= 300 && response.status < 400)
      return reply(503, "登录服务暂不可用");
    if (!response.ok) {
      const error = await response.json().catch(() => null);
      const code = [
        "invalid_credentials",
        "email_not_confirmed",
        "over_request_rate_limit",
        "refresh_token_not_found",
        "refresh_token_already_used",
        "session_not_found",
        "bad_jwt",
      ].includes(error?.code)
        ? error.code
        : "AUTH_UPSTREAM_ERROR";
      const status = [400, 401, 403, 429].includes(response.status)
        ? response.status
        : 503;
      return reply(
        status,
        status === 429
          ? "尝试次数较多，请稍后再试"
          : status === 503
            ? "登录服务暂不可用"
            : "请检查登录信息或重新登录",
        code,
      );
    }
    const safeHeaders = {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Type": "application/json",
      Vary: "Authorization, Origin",
    };
    return new Response(response.body, {
      status: response.status,
      headers: safeHeaders,
    });
  } catch (error) {
    return reply(
      error instanceof SyntaxError ? 400 : 503,
      error instanceof SyntaxError ? "登录内容无效" : "登录服务暂时无法连接",
    );
  }
}
