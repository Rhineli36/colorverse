import { AuthFailure, verifyIdentity, type AuthEnvironment } from "./auth";
import { CloudSessionSchema } from "@colorverse/contracts";
import {
  resolveEnrollment,
  type EnrollmentEnvironment,
} from "./enrollment-database";

export interface WorkerEnvironment
  extends AuthEnvironment, EnrollmentEnvironment {
  ASSETS: { fetch(request: Request): Promise<Response> };
}
function json(status: number, data: unknown, extra?: Record<string, string>) {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      Vary: "Authorization",
      ...extra,
    },
  });
}
export async function handleRequest(
  request: Request,
  env: WorkerEnvironment,
  transport: typeof fetch = (input, init) => globalThis.fetch(input, init),
  enrollments: typeof resolveEnrollment = resolveEnrollment,
) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);
  if (!["/api/v1/health", "/api/v1/cloud/session"].includes(url.pathname))
    return json(404, { error: { code: "NOT_FOUND", message: "接口尚未开放" } });
  if (request.method !== "GET")
    return json(
      405,
      { error: { code: "METHOD_NOT_ALLOWED", message: "请求方式无效" } },
      { Allow: "GET" },
    );
  if (url.pathname === "/api/v1/health")
    return json(200, {
      status: "ok",
      development: false,
      stage: "auth-pilot",
      cloudWrites: false,
      enrollmentDatabaseConfigured: Boolean(env.HYPERDRIVE),
    });
  try {
    const identity = await verifyIdentity(request, env, transport);
    const enrollment = await enrollments(identity, env);
    return json(
      200,
      CloudSessionSchema.parse({
        identity: { id: identity.subject, email: identity.email },
        access: enrollment?.access ?? "pending-enrollment",
        database: enrollment ? "connected" : "not-configured",
        memberships: enrollment?.memberships ?? [],
        cloudWrites: false,
      }),
    );
  } catch (error) {
    if (error instanceof AuthFailure)
      return json(error.status, {
        error: { code: error.code, message: error.message },
      });
    console.warn(
      "cloud_session_failed",
      error instanceof Error ? error.name : "unknown",
    );
    return json(503, {
      error: {
        code: "SESSION_UNAVAILABLE",
        message: "暂时无法验证云端身份或班级权限",
      },
    });
  }
}
export default {
  fetch(request: Request, env: WorkerEnvironment) {
    return handleRequest(request, env);
  },
};
