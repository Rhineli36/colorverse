import { handleRequest, type WorkerEnvironment } from "./index";
import { verifyIdentity, AuthFailure } from "./auth";
import { ClassroomFailure } from "./classroom";
import { databaseClient } from "./database-client";
import { accountRequest, resetStudentPassword } from "./classroom-accounts";
import { classroomScope, managementAction } from "./classroom-management";
import { smallJson } from "./student-import";
import { z } from "zod";

const reply = (status: number, value: unknown) =>
  Response.json(value, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      Vary: "Authorization, Origin",
    },
  });
export async function nextClassroomRequest(
  request: Request,
  environment: WorkerEnvironment,
) {
  const env = { ...environment, CLASSROOM_NEXT: "true" };
  const url = new URL(request.url);
  if (
    url.pathname.startsWith("/review") ||
    url.pathname.startsWith("/exhibition")
  )
    return reply(404, { error: { message: "参赛评审请使用原入口。" } });
  if (!url.pathname.startsWith("/api/")) return handleRequest(request, env);
  if (
    request.headers.get("Origin") &&
    request.headers.get("Origin") !== url.origin
  )
    return reply(403, {
      error: { code: "ORIGIN_FORBIDDEN", message: "请从本站操作。" },
    });
  try {
    if (url.pathname === "/api/v1/student/activate")
      throw new ClassroomFailure(
        410,
        "FIRST_LOGIN_REQUIRED",
        "请使用首次登录入口，通过学号和姓名核验。",
      );
    const first = /^\/api\/v1\/student\/first-login\/(verify|complete)$/.exec(
      url.pathname,
    );
    if (first)
      return reply(200, await accountRequest(request, env, null, first[1]));
    if (url.pathname.startsWith("/api/supabase/"))
      return handleRequest(request, env);
    if (url.pathname === "/api/v1/health")
      return reply(200, {
        status: "ok",
        mode: "classroom-next",
        reviewDeploymentTouched: false,
      });
    const identity = await verifyIdentity(request, env);
    if (/^\/api\/v1\/cloud\/account(?:\/password)?$/.test(url.pathname))
      return reply(
        200,
        await accountRequest(
          request,
          env,
          identity,
          url.pathname.endsWith("/password") ? "password" : "account",
        ),
      );
    if (identity.mustChangePassword && url.pathname !== "/api/v1/cloud/session")
      throw new ClassroomFailure(
        403,
        "PASSWORD_CHANGE_REQUIRED",
        "请先在账号设置中修改临时密码。",
      );
    const cls = /^\/api\/v1\/cloud\/classes\/([a-f0-9-]{36})\//.exec(
      url.pathname,
    );
    const managed =
      /^\/api\/v1\/cloud\/classes\/([a-f0-9-]{36})\/(management\/(.+)|publications(?:\/(.*))?)$/.exec(
        url.pathname,
      );
    if (cls) {
      const sql = databaseClient(env.HYPERDRIVE_WRITER!);
      await sql.connect();
      try {
        await sql.query("BEGIN");
        await classroomScope(sql, cls[1]);
        if (managed) {
          const resource =
            managed[3] ?? "publications" + (managed[4] ? "/" + managed[4] : "");
          const reset = /^students\/([a-f0-9-]{36})\/reset-password$/.exec(
            resource,
          );
          if (reset && request.method !== "POST")
            throw new ClassroomFailure(
              405,
              "METHOD_NOT_ALLOWED",
              "请求方式无效。",
            );
          const value = reset
            ? await resetStudentPassword(
                sql,
                env,
                identity,
                cls[1],
                reset[1],
                fetch,
              )
            : await managementAction(
                sql,
                identity,
                cls[1],
                resource,
                request.method,
                request.method === "POST"
                  ? await smallJson(request)
                  : undefined,
              );
          await sql.query("COMMIT");
          return reply(200, value);
        }
        await sql.query("ROLLBACK");
      } catch (e) {
        await sql.query("ROLLBACK");
        throw e;
      } finally {
        await sql.end();
      }
    }
    const response = await handleRequest(request, env);
    if (url.pathname === "/api/v1/cloud/session" && response.ok) {
      const value = await response.json();
      if (value.access !== "active") return reply(200, value);
      const sql = databaseClient(env.HYPERDRIVE_WRITER!);
      await sql.connect();
      try {
        const allowed = (
          await sql.query(
            `SELECT c.id FROM colorverse.classes c WHERE c.id=ANY($1::uuid[]) AND NOT EXISTS(SELECT 1 FROM colorverse.isolated_account_courses i WHERE i.course_id=c.course_id)`,
            [value.memberships.map((m: { classId: string }) => m.classId)],
          )
        ).rows.map((r) => r.id);
        value.memberships = value.memberships.filter((m: { classId: string }) =>
          allowed.includes(m.classId),
        );
        if (!value.memberships.length) value.access = "pending-enrollment";
        else
          await sql.query(
            `INSERT INTO colorverse.classroom_login_history(user_id) SELECT id FROM colorverse.users WHERE auth_issuer=$1 AND auth_subject=$2 ON CONFLICT(user_id) DO UPDATE SET last_seen=now()`,
            [identity.issuer, identity.subject],
          );
      } finally {
        await sql.end();
      }
      return reply(200, value);
    }
    return response;
  } catch (e) {
    if (e instanceof AuthFailure || e instanceof ClassroomFailure)
      return reply(e.status, { error: { code: e.code, message: e.message } });
    if (e instanceof z.ZodError)
      return reply(400, {
        error: {
          code: "INVALID_INPUT",
          message: e.issues[0]?.message ?? "填写内容无效。",
        },
      });
    console.warn("classroom_next_request_failed", {
      type: e instanceof Error ? e.name : "unknown",
      code:
        e && typeof e === "object" && "code" in e ? String(e.code) : "unknown",
    });
    return reply(503, {
      error: {
        code: "CLASSROOM_UNAVAILABLE",
        message: "课堂服务暂不可用，请重试；未保存内容请保留。",
      },
    });
  }
}
export default { fetch: nextClassroomRequest };
