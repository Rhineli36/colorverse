import { Buffer } from "node:buffer";
import { z } from "zod";
import {
  RosterRowsSchema,
  validateRoster,
  identityFromDisplayName,
  type RosterRow,
  type RosterPreviewRow,
  type RosterResult,
} from "@colorverse/contracts";
import { classroomActor, ClassroomFailure } from "./classroom";
import { databaseClient, type DatabaseBinding } from "./database-client";
import type { VerifiedIdentity, AuthEnvironment } from "./auth";
import type { EnrollmentSql } from "./enrollment";

export interface StudentImportEnvironment extends AuthEnvironment {
  SUPABASE_SECRET_KEY?: string;
  HYPERDRIVE_WRITER?: DatabaseBinding;
}
type Sql = EnrollmentSql;
type Connection = Sql & {
  connect(): Promise<unknown>;
  end(): Promise<unknown>;
};
export const importConnection = (env: StudentImportEnvironment): Connection =>
  databaseClient(env.HYPERDRIVE_WRITER!, 20000);
export function studentImportsReady(env: StudentImportEnvironment) {
  return Boolean(
    env.SUPABASE_URL && env.SUPABASE_SECRET_KEY && env.HYPERDRIVE_WRITER,
  );
}
export async function smallJson(request: Request) {
  if (Number(request.headers.get("Content-Length")) > 150000)
    throw new ClassroomFailure(413, "TOO_LARGE", "名单内容过大，最多 500 人");
  const reader = request.body?.getReader();
  if (!reader) throw new ClassroomFailure(400, "INVALID_INPUT", "缺少请求内容");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 150000) {
      await reader.cancel();
      throw new ClassroomFailure(413, "TOO_LARGE", "名单内容过大");
    }
    chunks.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new ClassroomFailure(400, "INVALID_INPUT", "请求内容无效");
  }
}
export async function digest(text: string) {
  return Buffer.from(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)),
  ).toString("hex");
}
async function cipherKey(env: StudentImportEnvironment) {
  return crypto.subtle.importKey(
    "raw",
    await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(
        "colorverse-roster-results-v1:" + env.SUPABASE_SECRET_KEY,
      ),
    ),
    "AES-GCM",
    false,
    ["encrypt", "decrypt"],
  );
}
async function seal(env: StudentImportEnvironment, results: RosterResult[]) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await cipherKey(env),
    new TextEncoder().encode(JSON.stringify(results)),
  );
  return Buffer.concat([iv, new Uint8Array(data)]).toString("base64");
}
async function unseal(
  env: StudentImportEnvironment,
  text: string,
): Promise<RosterResult[]> {
  const bytes = Buffer.from(text, "base64");
  return JSON.parse(
    new TextDecoder().decode(
      await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: bytes.subarray(0, 12) },
        await cipherKey(env),
        bytes.subarray(12),
      ),
    ),
  );
}
async function admin(
  env: StudentImportEnvironment,
  path: string,
  transport: typeof fetch,
  method = "GET",
  body?: unknown,
) {
  const r = await transport(`${env.SUPABASE_URL}/auth/v1/admin/${path}`, {
    method,
    headers: {
      apikey: env.SUPABASE_SECRET_KEY!,
      Authorization: `Bearer ${env.SUPABASE_SECRET_KEY!}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
    redirect: "manual",
    signal: AbortSignal.timeout(15000),
  });
  const data = await r.json().catch(() => null);
  return { ok: r.ok, status: r.status, data };
}
async function existingStudents(sql: Sql, courseId: string) {
  return (
    await sql.query(
      `SELECT DISTINCT u.id,u.auth_subject,u.status,u.display_name,u.student_number,u.real_name,a.login_account,a.login_email FROM colorverse.users u JOIN colorverse.enrollments e ON e.user_id=u.id JOIN colorverse.classes c ON c.id=e.class_id LEFT JOIN colorverse.student_accounts a ON a.user_id=u.id AND a.course_id=c.course_id WHERE c.course_id=$1 AND e.role='student'`,
      [courseId],
    )
  ).rows;
}
function matching(rows: Record<string, unknown>[], input: RosterRow) {
  return rows.filter(
    (u) =>
      String(
        u.student_number ||
          identityFromDisplayName(String(u.display_name))?.studentNumber ||
          "",
      ).toLowerCase() === input.studentNumber.toLowerCase(),
  );
}
async function preview(
  sql: Sql,
  rows: RosterRow[],
  courseId: string,
): Promise<RosterPreviewRow[]> {
  const students = await existingStudents(sql, courseId);
  return validateRoster(rows).map((r) => {
    if (r.status === "invalid") return r;
    const found = matching(students, r);
    if (found.length > 1)
      return {
        ...r,
        status: "invalid",
        message: "现有学生中学号不唯一，请联系维护者核对",
      };
    if (!found.length) return r;
    const u = found[0],
      name = String(
        u.real_name ||
          identityFromDisplayName(String(u.display_name))?.realName ||
          u.display_name,
      );
    if (u.status !== "active")
      return {
        ...r,
        status: "invalid",
        message: "该学生账号已停用，请联系维护者",
      };
    if (name !== r.name)
      return {
        ...r,
        status: "invalid",
        message: "学号已存在，但姓名不一致，请核对",
      };
    return {
      ...r,
      status: "existing",
      message: "已有学生，将保留密码与数据并关联班级",
    };
  });
}
async function enroll(sql: Sql, userId: string, classId: string) {
  await sql.query(
    "INSERT INTO colorverse.enrollments(id,class_id,user_id,role) VALUES($1,$2,$3,'student') ON CONFLICT(class_id,user_id) DO NOTHING",
    [crypto.randomUUID(), classId, userId],
  );
  const e = (
    await sql.query(
      "SELECT role,status FROM colorverse.enrollments WHERE class_id=$1 AND user_id=$2",
      [classId, userId],
    )
  ).rows[0];
  if (e?.role !== "student" || e.status !== "active")
    throw new ClassroomFailure(
      409,
      "ENROLLMENT_CONFLICT",
      "原班级关系已停用或身份不一致，请联系维护者",
    );
}
async function createRow(
  sql: Sql,
  env: StudentImportEnvironment,
  courseId: string,
  classId: string,
  className: string,
  row: RosterRow,
  transport: typeof fetch,
): Promise<RosterResult> {
  await sql.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
    courseId + ":" + row.studentNumber.toLowerCase(),
  ]);
  const check = (await preview(sql, [row], courseId))[0];
  if (check.status === "invalid")
    throw new ClassroomFailure(409, "STUDENT_CONFLICT", check.message);
  const base = { ...row, className, activationCode: "" };
  if (check.status === "existing") {
    const u = matching(await existingStudents(sql, courseId), row)[0];
    await enroll(sql, String(u.id), classId);
    let loginAccount = String(u.login_account || "");
    if (!loginAccount) {
      const info = await admin(env, `users/${u.auth_subject}`, transport);
      if (!info.ok || !info.data?.email)
        throw new ClassroomFailure(
          503,
          "ACCOUNT_UNAVAILABLE",
          "原登录账号暂不可读取，未修改密码",
        );
      loginAccount = row.studentNumber + "-" + courseId.slice(0, 8);
      await sql.query(
        "INSERT INTO colorverse.student_accounts(id,course_id,student_number,real_name,login_account,login_email,user_id,activated_at) VALUES($1,$2,$3,$4,$5,$6,$7,now())",
        [
          crypto.randomUUID(),
          courseId,
          row.studentNumber,
          row.name,
          loginAccount,
          info.data.email,
          u.id,
        ],
      );
    }
    return {
      ...base,
      loginAccount,
      result: "已有",
      message: "保留原密码和数据；首次激活码不重复发放",
    };
  }
  const key = (
    await digest(courseId + ":" + row.studentNumber.toLowerCase())
  ).slice(0, 32);
  const loginAccount = row.studentNumber + "-" + courseId.slice(0, 8),
    email = `s-${key}@students.colorverse.invalid`;
  const proof = { colorverse_student: key, course_id: courseId };
  let auth = await admin(env, "users", transport, "POST", {
    email,
    password: crypto.randomUUID() + crypto.randomUUID(),
    email_confirm: true,
    app_metadata: proof,
  });
  if (!auth.ok) {
    // Reconcile an earlier successful Auth write whose HTTP response or SQL commit was lost.
    let found: Record<string, unknown> | undefined;
    for (let page = 1; page <= 10; page++) {
      const list = await admin(
        env,
        `users?page=${page}&per_page=1000`,
        transport,
      );
      if (!list.ok) break;
      const users = list.data?.users ?? [];
      found = users.find((u: { email: string }) => u.email === email);
      if (found || users.length < 1000) break;
    }
    const metadata = found?.app_metadata as Record<string, unknown> | undefined;
    if (
      !found ||
      metadata?.colorverse_student !== key ||
      metadata.course_id !== courseId
    )
      throw new ClassroomFailure(
        503,
        "ACCOUNT_CREATE_FAILED",
        "账号服务暂不可用，请稍后重新导入；已有密码不会更改",
      );
    auth = { ok: true, status: 200, data: found };
  }
  if (!z.uuid().safeParse(auth.data?.id).success || auth.data.email !== email)
    throw new ClassroomFailure(
      503,
      "ACCOUNT_CREATE_FAILED",
      "账号服务返回异常，请稍后重试",
    );
  const userId = crypto.randomUUID(),
    accountId = crypto.randomUUID();
  const code = Array.from(
    crypto.getRandomValues(new Uint8Array(16)),
    (v) => "ABCDEFGHJKMNPQRSTUVWXYZ23456789"[v % 29],
  ).join("");
  await sql.query(
    "INSERT INTO colorverse.users(id,auth_issuer,auth_subject,display_name,student_number,real_name) VALUES($1,$2,$3,$4,$5,$6)",
    [
      userId,
      `${env.SUPABASE_URL}/auth/v1`,
      auth.data.id,
      `${row.name} · 学号 ${row.studentNumber}`,
      row.studentNumber,
      row.name,
    ],
  );
  await sql.query(
    "INSERT INTO colorverse.student_accounts(id,course_id,student_number,real_name,login_account,login_email,user_id,activation_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
    [
      accountId,
      courseId,
      row.studentNumber,
      row.name,
      loginAccount,
      email,
      userId,
      await digest(loginAccount.toLowerCase() + ":" + code),
    ],
  );
  await enroll(sql, userId, classId);
  return {
    ...base,
    loginAccount,
    activationCode: code.match(/.{4}/g)!.join("-"),
    result: "新建",
    message: "首次使用请激活并设置自己的密码",
  };
}
export async function handleStudentImport(
  request: Request,
  env: StudentImportEnvironment,
  identity: VerifiedIdentity,
  classId: string,
  resource: string,
  factory = () => importConnection(env),
  transport: typeof fetch = fetch,
) {
  if (!studentImportsReady(env))
    throw new ClassroomFailure(503, "IMPORT_NOT_READY", "导入学生暂未开放");
  const sql = factory();
  await sql.connect();
  try {
    await sql.query("BEGIN", []);
    const actor = await classroomActor(sql, identity, classId);
    if (actor.role !== "teacher" && actor.role !== "assistant")
      throw new ClassroomFailure(
        403,
        "TEACHER_REQUIRED",
        "仅本班教师可以导入学生",
      );
    const courseId = String(
      (
        await sql.query(
          "SELECT course_id FROM colorverse.classes WHERE id=$1",
          [classId],
        )
      ).rows[0].course_id,
    );
    if (resource === "preview" && request.method === "POST") {
      const input = z
        .object({ rows: RosterRowsSchema })
        .parse(await smallJson(request));
      const rows = await preview(sql, input.rows, courseId);
      await sql.query("COMMIT", []);
      return { rows, valid: rows.every((r) => r.status !== "invalid") };
    }
    if (resource === "" && request.method === "POST") {
      const input = z
        .strictObject({ requestId: z.uuid(), rows: RosterRowsSchema })
        .parse(await smallJson(request));
      const rows = await preview(sql, input.rows, courseId);
      if (rows.some((r) => r.status === "invalid"))
        throw new ClassroomFailure(
          400,
          "INVALID_ROSTER",
          "名单存在问题，请修改后重新预览",
        );
      const normalized = input.rows.map((r) => ({
        row: r.row,
        studentNumber: r.studentNumber,
        name: r.name,
      }));
      await sql.query(
        "INSERT INTO colorverse.student_import_batches(id,class_id,actor_id,rows,result_cipher) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING",
        [
          input.requestId,
          classId,
          actor.id,
          JSON.stringify(normalized),
          await seal(env, []),
        ],
      );
      const job = (
        await sql.query(
          "SELECT * FROM colorverse.student_import_batches WHERE id=$1 AND class_id=$2 AND actor_id=$3",
          [input.requestId, classId, actor.id],
        )
      ).rows[0];
      if (
        !job ||
        JSON.stringify(
          (job.rows as RosterRow[]).map((r) => [
            r.row,
            r.studentNumber,
            r.name,
          ]),
        ) !==
          JSON.stringify(
            normalized.map((r) => [r.row, r.studentNumber, r.name]),
          )
      )
        throw new ClassroomFailure(
          409,
          "IMPORT_CONFLICT",
          "本次导入编号已被使用，请重新预览",
        );
      await sql.query("COMMIT", []);
      return {
        id: input.requestId,
        total: normalized.length,
        completed: Number(job.completed),
      };
    }
    const match = /^([a-f0-9-]{36})(\/process)?$/.exec(resource);
    if (!match || !z.uuid().safeParse(match[1]).success)
      throw new ClassroomFailure(404, "NOT_FOUND", "导入记录不存在");
    const process = Boolean(match[2]);
    if (request.method !== (process ? "POST" : "GET"))
      throw new ClassroomFailure(405, "METHOD_NOT_ALLOWED", "请求方式无效");
    const job = (
      await sql.query(
        "SELECT * FROM colorverse.student_import_batches WHERE id=$1 AND class_id=$2 AND actor_id=$3 FOR UPDATE",
        [match[1], classId, actor.id],
      )
    ).rows[0];
    if (!job)
      throw new ClassroomFailure(404, "NOT_FOUND", "导入记录不存在或无权查看");
    const rows = job.rows as RosterRow[],
      results = await unseal(env, String(job.result_cipher));
    let completed = Number(job.completed);
    if (process && completed < rows.length) {
      await sql.query("SAVEPOINT import_student", []);
      try {
        results.push(
          await createRow(
            sql,
            env,
            courseId,
            classId,
            String(actor.title),
            rows[completed],
            transport,
          ),
        );
      } catch (error) {
        await sql.query("ROLLBACK TO SAVEPOINT import_student", []);
        results.push({
          ...rows[completed],
          loginAccount: "",
          className: String(actor.title),
          activationCode: "",
          result: "失败",
          message:
            error instanceof ClassroomFailure
              ? error.message
              : "创建暂未完成，请稍后重新导入；已有密码不会更改",
        });
      }
      completed++;
      await sql.query(
        "UPDATE colorverse.student_import_batches SET completed=$2,result_cipher=$3 WHERE id=$1",
        [job.id, completed, await seal(env, results)],
      );
    }
    await sql.query("COMMIT", []);
    return { id: job.id, total: rows.length, completed, results };
  } catch (error) {
    await sql.query("ROLLBACK", []).catch(() => {});
    throw error;
  } finally {
    await sql.end();
  }
}

export async function resolveStudentLogin(sql: Sql, account: string) {
  const alias = (
    await sql.query(
      "SELECT a.login_email FROM colorverse.classroom_login_aliases a JOIN colorverse.users u ON u.id=a.user_id WHERE lower(a.login_account)=lower($1) AND u.status='active'",
      [account],
    )
  ).rows[0];
  if (alias) return String(alias.login_email);
  const rows = (
    await sql.query(
      "SELECT a.login_email,a.activated_at FROM colorverse.student_accounts a JOIN colorverse.users u ON u.id=a.user_id WHERE (lower(a.login_account)=lower($1) OR lower(a.student_number)=lower($1)) AND u.status='active' AND EXISTS(SELECT 1 FROM colorverse.enrollments e JOIN colorverse.classes c ON c.id=e.class_id WHERE e.user_id=u.id AND e.status='active' AND c.archived_at IS NULL)",
      [account],
    )
  ).rows;
  if (
    new Set(rows.map((r) => r.login_email)).size !== 1 ||
    !rows.some((r) => r.activated_at)
  )
    throw new ClassroomFailure(
      400,
      "invalid_credentials",
      "账号尚未激活或账号、密码不正确；重号时请使用清单中的完整登录账号",
    );
  return String(rows[0].login_email);
}

export async function handleStudentActivation(
  request: Request,
  env: StudentImportEnvironment,
  factory = () => importConnection(env),
  transport: typeof fetch = fetch,
) {
  if (!studentImportsReady(env))
    throw new ClassroomFailure(503, "IMPORT_NOT_READY", "学生激活暂未开放");
  if (request.method !== "POST")
    throw new ClassroomFailure(405, "METHOD_NOT_ALLOWED", "请求方式无效");
  const input = z
    .strictObject({
      account: z.string().trim().min(1).max(100),
      code: z.string().min(1).max(80),
      password: z.string().min(8).max(128),
    })
    .parse(await smallJson(request));
  const sql = factory();
  await sql.connect();
  try {
    await sql.query("BEGIN", []);
    const accounts = (
      await sql.query(
        "SELECT a.*,u.auth_subject,u.status FROM colorverse.student_accounts a JOIN colorverse.users u ON u.id=a.user_id WHERE lower(a.login_account)=lower($1) OR lower(a.student_number)=lower($1) FOR UPDATE OF a",
        [input.account],
      )
    ).rows;
    if (accounts.length !== 1 || accounts[0].status !== "active")
      throw new ClassroomFailure(
        400,
        "INVALID_ACTIVATION",
        "账号或激活码无效；重号时请使用清单中的完整登录账号",
      );
    const a = accounts[0];
    if (a.activated_at)
      throw new ClassroomFailure(
        409,
        "ALREADY_ACTIVATED",
        "此账号已激活，请直接使用自己的密码登录",
      );
    if (a.locked_until && Date.parse(String(a.locked_until)) > Date.now())
      throw new ClassroomFailure(
        429,
        "ACTIVATION_LIMITED",
        "尝试次数较多，请 15 分钟后再试",
      );
    const code = input.code.replace(/[\s-]/g, "").toUpperCase(),
      hash = await digest(String(a.login_account).toLowerCase() + ":" + code);
    if (hash !== a.activation_hash) {
      const failures = a.locked_until ? 1 : Number(a.failed_attempts) + 1;
      await sql.query(
        "UPDATE colorverse.student_accounts SET failed_attempts=$2,locked_until=CASE WHEN $2>=10 THEN now()+interval '15 minutes' ELSE NULL END WHERE id=$1",
        [a.id, failures],
      );
      await sql.query("COMMIT", []);
      throw new ClassroomFailure(
        400,
        "INVALID_ACTIVATION",
        "账号或激活码不正确",
      );
    }
    const updated = await admin(
      env,
      `users/${a.auth_subject}`,
      transport,
      "PUT",
      { password: input.password },
    );
    if (!updated.ok)
      throw new ClassroomFailure(
        400,
        "PASSWORD_REJECTED",
        "密码设置未完成，请使用至少 8 位的字母和数字密码后重试",
      );
    await sql.query(
      "UPDATE colorverse.student_accounts SET activation_hash=NULL,activated_at=now(),failed_attempts=0,locked_until=NULL WHERE id=$1",
      [a.id],
    );
    await sql.query("COMMIT", []);
    return { activated: true, account: a.login_account };
  } catch (error) {
    await sql.query("ROLLBACK", []).catch(() => {});
    throw error;
  } finally {
    await sql.end();
  }
}
