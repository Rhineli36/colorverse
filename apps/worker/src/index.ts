import { AuthFailure, verifyIdentity, type AuthEnvironment } from "./auth";
import { CloudSessionSchema } from "@colorverse/contracts";
import { ClassroomFailure } from "./classroom";
import { resolveClassroomOverview } from "./classroom-database";
import {
  handleShowcaseCloud,
  cloudUploadsReady,
  type ShowcaseCloudEnvironment,
} from "./showcase-cloud";
import {
  resolveEnrollment,
  type EnrollmentEnvironment,
} from "./enrollment-database";

export interface WorkerEnvironment
  extends AuthEnvironment, EnrollmentEnvironment, ShowcaseCloudEnvironment {
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
  const showcase =
    /^\/api\/v1\/cloud\/classes\/([^/]+)\/(guide|planets|planets\/[a-f0-9-]+\/(appearance|exterior|interior)|works|works\/[a-f0-9-]+\/(image|original|element)|interactions)$/.exec(
      url.pathname,
    );
  if (showcase) {
    try {
      const identity = await verifyIdentity(request, env, transport);
      const response = await handleShowcaseCloud(
        request,
        env,
        identity,
        showcase[1],
        showcase[2],
      );
      response.headers.set("Cache-Control", "no-store");
      response.headers.set("X-Content-Type-Options", "nosniff");
      response.headers.set("Vary", "Authorization");
      return response;
    } catch (error) {
      if (error instanceof AuthFailure || error instanceof ClassroomFailure)
        return json(error.status, {
          error: { code: error.code, message: error.message },
        });
      console.warn("cloud_showcase_failed");
      return json(503, {
        error: {
          code: "SHOWCASE_UNAVAILABLE",
          message: "云端作品暂不可用，请稍后重试",
        },
      });
    }
  }
  const classroom = /^\/api\/v1\/cloud\/classes\/([^/]+)\/overview$/.exec(
    url.pathname,
  );
  if (classroom) {
    if (request.method !== "GET")
      return json(
        405,
        { error: { code: "METHOD_NOT_ALLOWED", message: "请求方式无效" } },
        { Allow: "GET" },
      );
    try {
      const identity = await verifyIdentity(request, env, transport);
      return json(
        200,
        await resolveClassroomOverview(identity, env, classroom[1]),
      );
    } catch (error) {
      if (error instanceof AuthFailure || error instanceof ClassroomFailure)
        return json(error.status, {
          error: { code: error.code, message: error.message },
        });
      console.warn("classroom_overview_failed");
      return json(503, {
        error: {
          code: "CLASSROOM_UNAVAILABLE",
          message: "班级统计暂不可用，请稍后刷新",
        },
      });
    }
  }
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
      stage: cloudUploadsReady(env) ? "classroom-pilot" : "auth-pilot",
      cloudWrites: cloudUploadsReady(env),
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
        cloudWrites: cloudUploadsReady(env),
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
