import { z } from "zod";
import { ClassroomFailure, classroomActor } from "./classroom";
import { classroomScope } from "./classroom-management";
import {
  importConnection,
  smallJson,
  digest,
  type StudentImportEnvironment,
} from "./student-import";
import type { EnrollmentSql } from "./enrollment";
import type { VerifiedIdentity } from "./auth";

type Connection = EnrollmentSql & {
  connect(): Promise<unknown>;
  end(): Promise<unknown>;
};
const fail = (status: number, code: string, message: string) =>
  new ClassroomFailure(status, code, message);
const activatedMessage =
  "该账号已激活，请使用学号和密码登录；忘记密码请联系教师。";
const password = z.string().min(8, "密码至少 8 位").max(128);
type AuthUser = {
  id: string;
  email: string;
  app_metadata?: Record<string, unknown>;
  last_sign_in_at?: string;
};
async function authAdmin(
  env: StudentImportEnvironment,
  subject: string,
  transport: typeof fetch,
  body?: unknown,
): Promise<AuthUser> {
  const r = await transport(
    `${env.SUPABASE_URL}/auth/v1/admin/users/${subject}`,
    {
      method: body ? "PUT" : "GET",
      headers: {
        apikey: env.SUPABASE_SECRET_KEY!,
        Authorization: `Bearer ${env.SUPABASE_SECRET_KEY}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
      redirect: "manual",
      signal: AbortSignal.timeout(15000),
    },
  );
  if (!r.ok)
    throw fail(
      503,
      "AUTH_UPDATE_FAILED",
      "认证服务未完成操作，请保留输入后重试。",
    );
  return r.json();
}
async function protectUser(sql: EnrollmentSql, identity: VerifiedIdentity) {
  const rows = (
    await sql.query(
      `SELECT u.id,u.real_name,u.student_number,u.display_name,u.auth_subject,
    a.login_email,a.activated_at,a.must_change_password
    FROM colorverse.users u JOIN colorverse.enrollments e ON e.user_id=u.id JOIN colorverse.classes c ON c.id=e.class_id
    LEFT JOIN colorverse.student_accounts a ON a.user_id=u.id AND a.course_id=c.course_id
    WHERE u.auth_issuer=$1 AND u.auth_subject=$2 AND u.status='active' AND e.role='student' AND e.status='active' AND c.archived_at IS NULL
    AND NOT EXISTS(SELECT 1 FROM colorverse.enrollments frozen JOIN colorverse.classes fc ON fc.id=frozen.class_id JOIN colorverse.isolated_account_courses i ON i.course_id=fc.course_id WHERE frozen.user_id=u.id)`,
      [identity.issuer, identity.subject],
    )
  ).rows;
  if (!rows.length)
    throw fail(
      403,
      "CLASSROOM_STUDENT_REQUIRED",
      "请使用正式课堂学生账号；评审账号请保留原入口。",
    );
  return rows[0];
}
async function attempts(sql: EnrollmentSql, key: string) {
  await sql.query(
    `INSERT INTO colorverse.classroom_security_attempts(key_hash) VALUES($1) ON CONFLICT DO NOTHING`,
    [key],
  );
  const r = (
    await sql.query(
      "SELECT * FROM colorverse.classroom_security_attempts WHERE key_hash=$1 FOR UPDATE",
      [key],
    )
  ).rows[0];
  if (
    r.blocked_until &&
    new Date(r.blocked_until as string).getTime() > Date.now()
  )
    throw fail(429, "TOO_MANY_ATTEMPTS", "尝试次数较多，请 15 分钟后再试。");
  await sql.query(
    `UPDATE colorverse.classroom_security_attempts SET attempts=CASE WHEN window_start<now()-interval '15 minutes' THEN 1 ELSE attempts+1 END,
    window_start=CASE WHEN window_start<now()-interval '15 minutes' THEN now() ELSE window_start END,
    blocked_until=CASE WHEN window_start>=now()-interval '15 minutes' AND attempts>=9 THEN now()+interval '15 minutes' ELSE NULL END WHERE key_hash=$1`,
    [key],
  );
}
export async function verifyFirstLogin(
  sql: EnrollmentSql,
  env: StudentImportEnvironment,
  input: unknown,
  ip: string,
  transport: typeof fetch,
) {
  const v = z
    .strictObject({
      account: z.string().trim().min(1).max(100),
      name: z.string().trim().min(1).max(60),
    })
    .parse(input);
  // One durable IP counter covers unknown accounts too; no public roster enumeration.
  await attempts(
    sql,
    await digest("first-login-ip:" + ip + ":" + env.SUPABASE_SECRET_KEY),
  );
  const candidates = (
    await sql.query(
      `SELECT a.*,u.auth_subject FROM colorverse.student_accounts a JOIN colorverse.users u ON u.id=a.user_id
    WHERE (lower(a.login_account)=lower($1) OR a.student_number=$1) AND u.status='active'
    AND EXISTS(SELECT 1 FROM colorverse.enrollments e JOIN colorverse.classes c ON c.id=e.class_id WHERE e.user_id=u.id AND e.status='active' AND c.archived_at IS NULL AND c.course_id=a.course_id)
    AND NOT EXISTS(SELECT 1 FROM colorverse.enrollments frozen JOIN colorverse.classes fc ON fc.id=frozen.class_id JOIN colorverse.isolated_account_courses i ON i.course_id=fc.course_id WHERE frozen.user_id=u.id) FOR UPDATE OF a`,
      [v.account],
    )
  ).rows;
  if (candidates.length > 1)
    throw fail(
      400,
      "ACCOUNT_SCOPE_REQUIRED",
      "该学号对应多个课堂，请使用教师提供的完整登录账号明确所属范围。",
    );
  const a = candidates[0];
  if (!a)
    throw fail(400, "IDENTITY_MISMATCH", "学号或姓名不正确，请向教师核对。");
  await attempts(sql, await digest("first-login-account:" + a.id));
  if (a.activated_at) throw fail(409, "ALREADY_ACTIVATED", activatedMessage);
  if (String(a.real_name).trim() !== v.name)
    throw fail(400, "IDENTITY_MISMATCH", "学号或姓名不正确，请向教师核对。");
  const user = await authAdmin(env, String(a.auth_subject), transport);
  if (user.app_metadata?.colorverse_activated_at || user.last_sign_in_at) {
    await sql.query(
      "UPDATE colorverse.student_accounts SET activated_at=coalesce(activated_at,now()),activation_hash=NULL WHERE user_id=$1",
      [a.user_id],
    );
    throw fail(409, "ALREADY_ACTIVATED", activatedMessage);
  }
  const token = crypto.randomUUID() + crypto.randomUUID();
  await sql.query(
    `INSERT INTO colorverse.classroom_activation_challenges(token_hash,account_id,operation_id,expires_at) VALUES($1,$2,$3,now()+interval '10 minutes')`,
    [await digest(token), a.id, crypto.randomUUID()],
  );
  for (const key of [
    await digest("first-login-ip:" + ip + ":" + env.SUPABASE_SECRET_KEY),
    await digest("first-login-account:" + a.id),
  ])
    await sql.query(
      "UPDATE colorverse.classroom_security_attempts SET attempts=0,blocked_until=NULL,window_start=now() WHERE key_hash=$1",
      [key],
    );
  return { challenge: token, expiresIn: 600 };
}
export async function completeFirstLogin(
  sql: EnrollmentSql,
  env: StudentImportEnvironment,
  input: unknown,
  transport: typeof fetch,
) {
  const v = z
    .strictObject({
      challenge: z.string().min(60).max(100),
      password,
      confirmPassword: password,
    })
    .refine((v) => v.password === v.confirmPassword, "两次密码不一致")
    .parse(input);
  const r = (
    await sql.query(
      `SELECT ch.*,a.user_id,a.login_account,a.activated_at,u.auth_subject FROM colorverse.classroom_activation_challenges ch
    JOIN colorverse.student_accounts a ON a.id=ch.account_id JOIN colorverse.users u ON u.id=a.user_id
    WHERE ch.token_hash=$1 AND ch.expires_at>now() AND u.status='active' AND NOT EXISTS(SELECT 1 FROM colorverse.enrollments frozen JOIN colorverse.classes fc ON fc.id=frozen.class_id JOIN colorverse.isolated_account_courses i ON i.course_id=fc.course_id WHERE frozen.user_id=u.id) FOR UPDATE OF ch,a`,
      [await digest(v.challenge)],
    )
  ).rows[0];
  if (!r)
    throw fail(
      400,
      "CHALLENGE_INVALID",
      "核验已过期或无效，请重新填写学号和姓名。",
    );
  let user = await authAdmin(env, String(r.auth_subject), transport);
  const meta = user.app_metadata ?? {};
  if (r.consumed_at || r.activated_at || meta.colorverse_activated_at) {
    if (meta.colorverse_activation_operation === r.operation_id) {
      await sql.query(
        "UPDATE colorverse.student_accounts SET activated_at=coalesce(activated_at,now()),activation_hash=NULL WHERE user_id=$1",
        [r.user_id],
      );
      return { activated: true, account: String(r.login_account) };
    }
    throw fail(409, "ALREADY_ACTIVATED", activatedMessage);
  }
  // Password and authoritative activation marker are one atomic Auth user update.
  // A lost SQL commit/HTTP response is reconciled by this operation id; no second password is written.
  user = await authAdmin(env, String(r.auth_subject), transport, {
    password: v.password,
    app_metadata: {
      ...meta,
      colorverse_activated_at: new Date().toISOString(),
      colorverse_activation_operation: r.operation_id,
      colorverse_password_required: false,
    },
  });
  if (user.app_metadata?.colorverse_activation_operation !== r.operation_id)
    throw fail(503, "ACTIVATION_INCOMPLETE", "账号激活尚未完成，请重试。");
  await sql.query(
    "UPDATE colorverse.student_accounts SET activated_at=now(),activation_hash=NULL,failed_attempts=0,locked_until=NULL WHERE user_id=$1",
    [r.user_id],
  );
  await sql.query(
    "UPDATE colorverse.classroom_activation_challenges SET consumed_at=now() WHERE token_hash=$1",
    [await digest(v.challenge)],
  );
  return { activated: true, account: String(r.login_account) };
}
export async function accountInfo(
  sql: EnrollmentSql,
  env: StudentImportEnvironment,
  identity: VerifiedIdentity,
  transport: typeof fetch,
) {
  const u = await protectUser(sql, identity),
    auth = await authAdmin(env, identity.subject, transport);
  return {
    name: String(u.real_name ?? u.display_name),
    studentNumber: String(u.student_number ?? ""),
    mustChangePassword: Boolean(
      auth.app_metadata?.colorverse_password_required,
    ),
  };
}
export async function changePassword(
  sql: EnrollmentSql,
  env: StudentImportEnvironment,
  identity: VerifiedIdentity,
  input: unknown,
  transport: typeof fetch,
) {
  await protectUser(sql, identity);
  const v = z
    .strictObject({
      currentPassword: z.string().min(1).max(128),
      newPassword: password,
      confirmPassword: password,
    })
    .refine((v) => v.newPassword === v.confirmPassword, "两次密码不一致")
    .refine(
      (v) => v.newPassword !== v.currentPassword,
      "新密码不能与当前密码相同",
    )
    .parse(input);
  await attempts(sql, await digest("change-password:" + identity.subject));
  const proof = await transport(
    `${env.SUPABASE_URL}/auth/v1/token?grant_type=password`,
    {
      method: "POST",
      headers: {
        apikey: env.SUPABASE_PUBLISHABLE_KEY!,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: identity.email,
        password: v.currentPassword,
      }),
      redirect: "manual",
      signal: AbortSignal.timeout(15000),
    },
  );
  const value = await proof.json().catch(() => null);
  if (!proof.ok || value?.user?.id !== identity.subject)
    throw fail(400, "CURRENT_PASSWORD_INVALID", "当前密码不正确。");
  const user = await authAdmin(env, identity.subject, transport);
  await authAdmin(env, identity.subject, transport, {
    password: v.newPassword,
    app_metadata: { ...user.app_metadata, colorverse_password_required: false },
  });
  await sql.query(
    "UPDATE colorverse.student_accounts SET must_change_password=false WHERE user_id IN(SELECT id FROM colorverse.users WHERE auth_issuer=$1 AND auth_subject=$2)",
    [identity.issuer, identity.subject],
  );
  await sql.query(
    "UPDATE colorverse.classroom_security_attempts SET attempts=0,blocked_until=NULL WHERE key_hash=$1",
    [await digest("change-password:" + identity.subject)],
  );
  return { saved: true };
}
export async function resetStudentPassword(
  sql: EnrollmentSql,
  env: StudentImportEnvironment,
  identity: VerifiedIdentity,
  classId: string,
  enrollmentId: string,
  transport: typeof fetch,
) {
  await classroomScope(sql, classId);
  const actor = await classroomActor(sql, identity, classId);
  if (actor.role !== "teacher")
    throw fail(403, "TEACHER_REQUIRED", "只有本班教师可以重置密码。");
  const u = (
    await sql.query(
      `SELECT u.id,u.auth_subject FROM colorverse.enrollments e JOIN colorverse.users u ON u.id=e.user_id WHERE e.id=$1 AND e.class_id=$2 AND e.role='student' AND e.status='active' AND u.status='active' AND NOT EXISTS(SELECT 1 FROM colorverse.enrollments frozen JOIN colorverse.classes fc ON fc.id=frozen.class_id JOIN colorverse.isolated_account_courses i ON i.course_id=fc.course_id WHERE frozen.user_id=u.id)`,
      [enrollmentId, classId],
    )
  ).rows[0];
  if (!u) throw fail(404, "STUDENT_NOT_FOUND", "学生不存在或不属于本班。");
  const temporaryPassword = "88888888";
  const user = await authAdmin(env, String(u.auth_subject), transport);
  await authAdmin(env, String(u.auth_subject), transport, {
    password: temporaryPassword,
    app_metadata: {
      ...user.app_metadata,
      colorverse_password_required: true,
      colorverse_activated_at:
        user.app_metadata?.colorverse_activated_at ?? new Date().toISOString(),
    },
  });
  await sql.query(
    "UPDATE colorverse.student_accounts SET must_change_password=true,activated_at=coalesce(activated_at,now()),activation_hash=NULL WHERE user_id=$1",
    [u.id],
  );
  return {
    temporaryPassword,
    message:
      "临时密码为8个8，学生登录后必须立即设置个人密码。重置不会重新开放姓名激活入口。",
  };
}
export async function accountRequest(
  request: Request,
  env: StudentImportEnvironment,
  identity: VerifiedIdentity | null,
  path: string,
  factory: () => Connection = () => importConnection(env),
  transport: typeof fetch = fetch,
) {
  const sql = factory();
  await sql.connect();
  let committed = false;
  try {
    await sql.query("BEGIN", []);
    let value: unknown;
    const body =
      request.method === "POST" ? await smallJson(request) : undefined;
    if (path === "verify" && request.method === "POST")
      value = await verifyFirstLogin(
        sql,
        env,
        body,
        request.headers.get("CF-Connecting-IP") ?? "local",
        transport,
      );
    else if (path === "complete" && request.method === "POST")
      value = await completeFirstLogin(sql, env, body, transport);
    else if (identity && path === "account" && request.method === "GET")
      value = await accountInfo(sql, env, identity, transport);
    else if (identity && path === "password" && request.method === "POST")
      value = await changePassword(sql, env, identity, body, transport);
    else throw fail(405, "METHOD_NOT_ALLOWED", "请求方式无效。");
    await sql.query("COMMIT", []);
    committed = true;
    return value;
  } catch (e) {
    // Failed guesses must survive the request; unrelated failures roll back.
    if (
      e instanceof ClassroomFailure &&
      [
        "IDENTITY_MISMATCH",
        "ACCOUNT_SCOPE_REQUIRED",
        "ALREADY_ACTIVATED",
        "CURRENT_PASSWORD_INVALID",
        "TOO_MANY_ATTEMPTS",
      ].includes(e.code)
    ) {
      await sql.query("COMMIT", []);
      committed = true;
    }
    if (!committed) await sql.query("ROLLBACK", []).catch(() => {});
    throw e;
  } finally {
    await sql.end();
  }
}
