import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
  createCourseDatabase,
  migrateCourses,
  type CourseDatabase,
} from "../apps/api/src/database";
import {
  handleStudentImport,
  handleStudentActivation,
  resolveStudentLogin,
} from "../apps/worker/src/student-import";
import { validateRoster, type RosterResult } from "@colorverse/contracts";

let db: CourseDatabase;
const schema = `test_course_${randomUUID().replaceAll("-", "")}`,
  ids = Array.from({ length: 12 }, () => randomUUID()),
  issuer = "https://example.supabase.co/auth/v1";
const sql = {
  query: (s: string, p: unknown[] = []) =>
    db.query(s.replaceAll("colorverse.", schema + "."), p),
};
const factory = () => ({
  ...sql,
  connect: async () => {},
  end: async () => {},
});
const teacher = { issuer, subject: ids[0], email: "teacher@example.test" },
  student = { issuer, subject: ids[1], email: "student@example.test" };
const env = {
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SECRET_KEY: "test-only-secret",
  HYPERDRIVE_WRITER: { connectionString: "test" },
};
const authUsers = new Map<
  string,
  {
    id: string;
    email: string;
    password: string;
    app_metadata: Record<string, string>;
  }
>();
const transport = vi.fn<typeof fetch>(async (url, options) => {
  const path = new URL(String(url)).pathname,
    body = options?.body ? JSON.parse(String(options.body)) : null;
  if (path.endsWith("/admin/users") && options?.method === "POST") {
    if ([...authUsers.values()].some((u) => u.email === body.email))
      return Response.json({ error: "exists" }, { status: 422 });
    const u = { ...body, id: randomUUID() };
    authUsers.set(u.id, u);
    return Response.json(u);
  }
  if (path.endsWith("/admin/users"))
    return Response.json({ users: [...authUsers.values()] });
  const id = path.split("/").at(-1)!,
    u = authUsers.get(id);
  if (!u) return Response.json({ error: "missing" }, { status: 404 });
  if (options?.method === "PUT") Object.assign(u, body);
  return Response.json(u);
});
const request = (path: string, body?: unknown, method = "POST") =>
  new Request("https://app.test/" + path, {
    method,
    body: body ? JSON.stringify(body) : undefined,
  });
const call = (
  resource: string,
  body?: unknown,
  identity = teacher,
  method = "POST",
  classId = ids[3],
) =>
  handleStudentImport(
    request(resource, body, method),
    env,
    identity,
    classId,
    resource,
    factory,
    transport,
  );
beforeAll(async () => {
  db = await createCourseDatabase({});
  await db.exec(`CREATE SCHEMA ${schema};SET search_path=${schema}`);
  await migrateCourses(db);
  await db.exec(
    "ALTER TABLE users ADD COLUMN student_number text, ADD COLUMN real_name text",
  );
  await db.exec(
    await readFile("apps/api/migrations/009-student-import.sql", "utf8"),
  );
  await db.exec(
    await readFile("apps/api/migrations/010-import-account-scope.sql", "utf8"),
  );
  for (const [id, name, number] of [
    [ids[0], "教师", null],
    [ids[1], "原学生 · 学号 0008", null],
  ])
    await sql.query(
      "INSERT INTO colorverse.users(id,auth_issuer,auth_subject,display_name,student_number) VALUES($1::uuid,$2,$1::uuid::text,$3,$4)",
      [id, issuer, name, number],
    );
  authUsers.set(ids[1], {
    id: ids[1],
    email: "existing@example.test",
    password: "ExistingPassword",
    app_metadata: {},
  });
  await sql.query("INSERT INTO colorverse.courses VALUES($1,'课程',$2)", [
    ids[2],
    ids[0],
  ]);
  for (const id of [ids[3], ids[4]])
    await sql.query(
      "INSERT INTO colorverse.classes(id,course_id,title,term,timezone) VALUES($1,$2,'测试班','测试','Asia/Shanghai')",
      [id, ids[2]],
    );
  await sql.query(
    "INSERT INTO colorverse.enrollments(id,class_id,user_id,role) VALUES($1,$2,$3,'teacher'),($4,$2,$5,'student')",
    [ids[5], ids[3], ids[0], ids[6], ids[1]],
  );
  await sql.query(
    "INSERT INTO colorverse.planets(id,owner_enrollment_id) VALUES($1,$2)",
    [ids[7], ids[6]],
  );
}, 30000);
afterAll(async () => await db?.close());
describe("roster import and one-time activation", () => {
  it("marks missing fields and both duplicate rows while preserving leading zeroes", () => {
    const result = validateRoster([
      { row: 2, studentNumber: " 0012 ", name: " 同学 " },
      { row: 3, studentNumber: "0012", name: "同学" },
      { row: 4, studentNumber: "", name: "同学" },
      { row: 5, studentNumber: "0004", name: "" },
    ]);
    expect(result.every((r) => r.status === "invalid")).toBe(true);
    expect(result[0].studentNumber).toBe("0012");
  });
  it("requires a teacher in the actual class and preview makes no Auth write", async () => {
    const body = {
      rows: [
        { row: 2, studentNumber: "0008", name: "原学生" },
        { row: 3, studentNumber: "0012", name: "新同学" },
      ],
    };
    await expect(call("preview", body, student)).rejects.toMatchObject({
      status: 403,
    });
    await expect(
      call("preview", body, teacher, "POST", ids[4]),
    ).rejects.toMatchObject({ status: 403 });
    const result = await call("preview", body);
    expect(result).toMatchObject({
      valid: true,
      rows: [{ status: "existing" }, { status: "new" }],
    });
    expect(transport).not.toHaveBeenCalled();
  });
  it("rejects invalid confirmation and protects mismatched existing identities", async () => {
    await expect(
      call("", {
        requestId: randomUUID(),
        rows: [{ row: 2, studentNumber: "0008", name: "其他人" }],
      }),
    ).rejects.toMatchObject({ status: 400 });
    expect(authUsers.size).toBe(1);
  });
  let results: RosterResult[], jobId: string;
  it("creates real Auth records, associates existing students without resetting passwords, and retries idempotently", async () => {
    jobId = randomUUID();
    const rows = [
      { row: 2, studentNumber: "0008", name: "原学生" },
      { row: 3, studentNumber: "0012", name: "新同学" },
    ];
    await call("", { requestId: jobId, rows });
    await call("", { requestId: jobId, rows });
    await call(jobId + "/process");
    await call(jobId + "/process");
    const done = (await call(jobId + "/process")) as {
      results: RosterResult[];
      completed: number;
    };
    results = done.results;
    expect(done.completed).toBe(2);
    expect(results.map((r) => r.result)).toEqual(["已有", "新建"]);
    expect(results[0].activationCode).toBe("");
    expect(results[1].activationCode).toMatch(/^[A-Z2-9]{4}(-[A-Z2-9]{4}){3}$/);
    expect(authUsers.size).toBe(2);
    expect(authUsers.get(ids[1])?.password).toBe("ExistingPassword");
    expect(
      (
        await sql.query(
          "SELECT id FROM colorverse.planets WHERE owner_enrollment_id=$1",
          [ids[6]],
        )
      ).rows[0].id,
    ).toBe(ids[7]);
    const stored = (
      await sql.query(
        "SELECT result_cipher FROM colorverse.student_import_batches WHERE id=$1",
        [jobId],
      )
    ).rows[0];
    expect(String(stored.result_cipher)).not.toContain(
      results[1].activationCode,
    );
    expect(await resolveStudentLogin(sql, "0008")).toBe(
      "existing@example.test",
    );
    await expect(resolveStudentLogin(sql, "0012")).rejects.toMatchObject({
      status: 400,
    });
  });
  it("activates once with a chosen password, resolves student-number login, and never resets on duplicate import", async () => {
    await expect(
      handleStudentActivation(
        request("activate", {
          account: "0012",
          code: "wrong",
          password: "NewPassword2026",
        }),
        env,
        factory,
        transport,
      ),
    ).rejects.toMatchObject({ status: 400 });
    await handleStudentActivation(
      request("activate", {
        account: "0012",
        code: results[1].activationCode,
        password: "NewPassword2026",
      }),
      env,
      factory,
      transport,
    );
    const email = await resolveStudentLogin(sql, "0012");
    expect(
      [...authUsers.values()].find((u) => u.email === email)?.password,
    ).toBe("NewPassword2026");
    await expect(
      handleStudentActivation(
        request("activate", {
          account: "0012",
          code: results[1].activationCode,
          password: "OtherPassword2026",
        }),
        env,
        factory,
        transport,
      ),
    ).rejects.toMatchObject({ status: 409 });
    const repeat = randomUUID();
    await call("", {
      requestId: repeat,
      rows: [{ row: 2, studentNumber: "0012", name: "新同学" }],
    });
    const result = (await call(repeat + "/process")) as {
      results: RosterResult[];
    };
    expect(result.results[0]).toMatchObject({
      result: "已有",
      activationCode: "",
    });
    expect(
      [...authUsers.values()].find((u) => u.email === email)?.password,
    ).toBe("NewPassword2026");
    expect(
      (
        await sql.query(
          "SELECT activation_hash FROM colorverse.student_accounts WHERE student_number=$1",
          ["0012"],
        )
      ).rows[0].activation_hash,
    ).toBeNull();
  });
  it("reuses an existing student across classroom courses and isolates review course identities", async () => {
    const course = randomUUID(),
      cls = randomUUID(),
      teacherEnrollment = randomUUID();
    await sql.query("INSERT INTO colorverse.courses VALUES($1,'另一课程',$2)", [
      course,
      ids[0],
    ]);
    await sql.query(
      "INSERT INTO colorverse.classes(id,course_id,title,term,timezone) VALUES($1,$2,'另一班','测试','Asia/Shanghai')",
      [cls, course],
    );
    await sql.query(
      "INSERT INTO colorverse.enrollments(id,class_id,user_id,role) VALUES($1,$2,$3,'teacher')",
      [teacherEnrollment, cls, ids[0]],
    );
    const rows = [{ row: 2, studentNumber: "0012", name: "新同学" }],
      job = randomUUID();
    expect(await call("preview", { rows }, teacher, "POST", cls)).toMatchObject(
      { valid: true, rows: [{ status: "existing" }] },
    );
    await call("", { requestId: job, rows }, teacher, "POST", cls);
    const result = (await call(
      job + "/process",
      undefined,
      teacher,
      "POST",
      cls,
    )) as { results: RosterResult[] };
    expect(result.results[0].result).toBe("已有");
    expect(authUsers.size).toBe(2);
    const isolatedCourse = randomUUID(),
      isolatedClass = randomUUID();
    await sql.query("INSERT INTO colorverse.courses VALUES($1,'评审课程',$2)", [
      isolatedCourse,
      ids[0],
    ]);
    await sql.query(
      "INSERT INTO colorverse.isolated_account_courses VALUES($1)",
      [isolatedCourse],
    );
    await sql.query(
      "INSERT INTO colorverse.classes(id,course_id,title,term,timezone) VALUES($1,$2,'评审班','测试','Asia/Shanghai')",
      [isolatedClass, isolatedCourse],
    );
    await sql.query(
      "INSERT INTO colorverse.enrollments(id,class_id,user_id,role) VALUES($1,$2,$3,'teacher')",
      [randomUUID(), isolatedClass, ids[0]],
    );
    expect(
      await call("preview", { rows }, teacher, "POST", isolatedClass),
    ).toMatchObject({ valid: true, rows: [{ status: "new" }] });
  });
});
