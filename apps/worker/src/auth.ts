export interface AuthEnvironment {
  CLASSROOM_NEXT?: string;
  SUPABASE_URL?: string;
  SUPABASE_PUBLISHABLE_KEY?: string;
}
export interface VerifiedIdentity {
  mustChangePassword?: boolean;
  issuer: string;
  subject: string;
  email: string;
}
export class AuthFailure extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export async function verifyIdentity(
  request: Request,
  env: AuthEnvironment,
  transport: typeof fetch = (input, init) => globalThis.fetch(input, init),
): Promise<VerifiedIdentity> {
  const authorization = request.headers.get("Authorization") ?? "";
  if (
    !/^Bearer [A-Za-z0-9._~-]+$/i.test(authorization) ||
    authorization.length > 8192
  )
    throw new AuthFailure(401, "UNAUTHENTICATED", "请先登录");
  const url = env.SUPABASE_URL;
  if (
    !url ||
    !/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(url) ||
    !env.SUPABASE_PUBLISHABLE_KEY?.startsWith("sb_publishable_")
  )
    throw new AuthFailure(503, "AUTH_UNAVAILABLE", "登录服务尚未配置");
  let response: Response;
  try {
    // Auth checks the token remotely. Never trust decoded JWT/user_metadata roles.
    response = await transport(`${url}/auth/v1/user`, {
      headers: {
        Authorization: authorization,
        apikey: env.SUPABASE_PUBLISHABLE_KEY,
      },
      signal: AbortSignal.timeout(8000),
      // Reject redirects without forwarding credentials; compatible with the edge runtime.
      redirect: "manual",
    });
  } catch (error) {
    console.warn(
      "auth_transport_failed",
      error instanceof Error ? error.name : "unknown",
    );
    throw new AuthFailure(
      503,
      "AUTH_UNAVAILABLE",
      "登录服务暂时无法连接，请稍后再试",
    );
  }
  if (response.status === 401 || response.status === 403)
    throw new AuthFailure(401, "UNAUTHENTICATED", "登录已失效，请重新登录");
  if (!response.ok) {
    console.warn("auth_upstream_unavailable", response.status);
    throw new AuthFailure(
      503,
      "AUTH_UNAVAILABLE",
      "登录服务暂时无法连接，请稍后再试",
    );
  }
  const user: unknown = await response.json().catch(() => null);
  if (
    !user ||
    typeof user !== "object" ||
    !("id" in user) ||
    typeof user.id !== "string" ||
    !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(user.id) ||
    !("email" in user) ||
    typeof user.email !== "string" ||
    !("email_confirmed_at" in user) ||
    typeof user.email_confirmed_at !== "string" ||
    !Number.isFinite(Date.parse(user.email_confirmed_at))
  )
    throw new AuthFailure(
      401,
      "UNAUTHENTICATED",
      "请使用已验证邮箱的课堂账户登录",
    );
  const metadata =
    "app_metadata" in user
      ? (user.app_metadata as Record<string, unknown> | undefined)
      : undefined;
  return {
    issuer: `${url}/auth/v1`,
    subject: user.id,
    email: user.email,
    ...(metadata?.colorverse_password_required === true
      ? { mustChangePassword: true }
      : {}),
  };
}
