import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import {
  managementAction,
  publicationRows,
  publications,
  classroomRoster,
} from "../apps/worker/src/classroom-management";
import { showcaseReview } from "../apps/worker/src/showcase-review";
import {
  accountRequest,
  resetStudentPassword,
} from "../apps/worker/src/classroom-accounts";
import { classroomNotifications } from "../apps/worker/src/notifications";
import type { StudentImportEnvironment } from "../apps/worker/src/student-import";

let db: PGlite;
const id = Array.from({ length: 20 }, () => randomUUID()),
  issuer = "https://example.supabase.co/auth/v1";
const teacher = { issuer, subject: id[0], email: "teacher@example.test" },
  student = { issuer, subject: id[1], email: "student1@example.test" };
const sql = {
  query: async (s: string, p: unknown[] = []) =>
    db.query<Record<string, unknown>>(s, p),
};
const env: StudentImportEnvironment = {
  CLASSROOM_NEXT: "true",
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
  SUPABASE_SECRET_KEY: "test-only",
  HYPERDRIVE_WRITER: { connectionString: "test" },
};
type TestUser = {
  id: string;
  email: string;
  password: string;
  app_metadata: Record<string, unknown>;
  last_sign_in_at?: string;
};
const authUsers = new Map<string, TestUser>();
let failWrite = false;
const transport: typeof fetch = async (url, init) => {
  const path = new URL(String(url)).pathname,
    body = init?.body ? JSON.parse(String(init.body)) : null;
  if (path.endsWith("/token")) {
    const u = [...authUsers.values()].find(
      (u) => u.email === body.email && u.password === body.password,
    );
    return u
      ? Response.json({ user: u, access_token: "test-session" })
      : Response.json({ error: "invalid" }, { status: 400 });
  }
  const u = authUsers.get(path.split("/").at(-1)!);
  if (!u) return Response.json({}, { status: 404 });
  if (init?.method === "PUT") {
    if (failWrite) {
      failWrite = false;
      return Response.json({}, { status: 503 });
    }
    Object.assign(u, body);
  }
  return Response.json(u);
};
const action = (
  resource: string,
  method = "GET",
  body?: unknown,
  who = teacher,
  cls = id[5],
) => managementAction(sql, who, cls, resource, method, body);
const account = (
  path: string,
  body: unknown,
  who: typeof teacher | null = null,
) =>
  accountRequest(
    new Request("https://classroom.test/api/" + path, {
      method: "POST",
      headers: {
        "CF-Connecting-IP": "198.51.100.1",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }),
    env,
    who,
    path,
    () => ({ ...sql, connect: async () => {}, end: async () => {} }),
    transport,
  );
beforeAll(async () => {
  db = await PGlite.create();
  await db.exec(
    "CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE colorverse_identity_reader;CREATE ROLE colorverse_classroom_writer;CREATE SCHEMA colorverse;SET search_path=colorverse,pg_catalog;CREATE TABLE course_migrations(version int primary key,sha256 text)",
  );
  for (const name of [
    "001-course",
    "002-classroom-showcase",
    "003-showcase-originals",
    "004-showcase-withdrawal",
    "005-showcase-reviews",
    "006-learning-context",
    "007-custom-assignments",
    "008-precompetition",
    "009-student-import",
    "010-import-account-scope",
    "011-explicit-runtime-grants",
    "012-classroom-management",
    "013-submission-content-history",
  ])
    await db.exec(await readFile(`apps/api/migrations/${name}.sql`, "utf8"));
  for (let i = 0; i < 5; i++)
    await sql.query(
      "INSERT INTO colorverse.users(id,auth_issuer,auth_subject,display_name,student_number,real_name) VALUES($1,$2,$1::uuid::text,$3,$4,$3)",
      [
        id[i],
        issuer,
        i === 0 ? "测试教师" : "测试学生" + i,
        i === 0 ? null : "000" + i,
      ],
    );
  await sql.query(
    "INSERT INTO colorverse.courses(id,title,created_by) VALUES($1,'测试课程',$2)",
    [id[7], id[0]],
  );
  for (const c of [id[5], id[6]])
    await sql.query(
      "INSERT INTO colorverse.classes(id,course_id,title,term,timezone) VALUES($1,$2,'测试班级','2026','Asia/Shanghai')",
      [c, id[7]],
    );
  for (let i = 0; i < 4; i++)
    await sql.query(
      "INSERT INTO colorverse.enrollments(id,class_id,user_id,role) VALUES($1,$2,$3,$4)",
      [
        id[8 + i],
        i === 3 ? id[6] : id[5],
        id[i],
        i === 0 ? "teacher" : "student",
      ],
    );
  for (let i = 1; i <= 2; i++) {
    await sql.query(
      "INSERT INTO colorverse.student_accounts(id,course_id,student_number,real_name,login_account,login_email,user_id,activation_hash) VALUES($1,$2,$3,$4,$3,$5,$6,'legacy-code')",
      [
        id[12 + i],
        id[7],
        "000" + i,
        "测试学生" + i,
        `student${i}@example.test`,
        id[i],
      ],
    );
    authUsers.set(id[i], {
      id: id[i],
      email: `student${i}@example.test`,
      password: "InitialPass123",
      app_metadata: { original: "preserve" },
    });
  }
}, 30000);
afterAll(async () => db?.close());
let publicationId: string, workId: string;
describe("classroom roster and assignment snapshots", () => {
  it("lists enrolled imported students before login and before planet creation", async () => {
    const r = await classroomRoster(sql, id[5]);
    expect(r).toHaveLength(2);
    expect(r.every((s) => !s.planetId && !s.loggedIn && !s.activated)).toBe(
      true,
    );
  });
  it("snapshots recipients and changes history only on explicit supplement", async () => {
    const body = {
      requestId: randomUUID(),
      taskId: "T01",
      enrollmentIds: [id[9], id[10]],
      dueAt: null,
    };
    publicationId = String(
      ((await action("publications", "POST", body)) as { id: string }).id,
    );
    expect(
      ((await action("publications", "POST", body)) as { id: string }).id,
    ).toBe(publicationId);
    await sql.query(
      "INSERT INTO colorverse.enrollments(id,class_id,user_id,role) VALUES($1,$2,$3,'student')",
      [id[16], id[5], id[4]],
    );
    expect((await publications(sql, id[5]))[0]).toMatchObject({
      expected: 2,
      submitted: 0,
      missing: 2,
      pending: 0,
      reviewed: 0,
    });
    await action(`publications/${publicationId}/recipients`, "POST", {
      enrollmentIds: [id[16]],
    });
    expect((await publications(sql, id[5]))[0].expected).toBe(3);
  });
  it("counts one student once; zero-point review is graded; a new submission requires review and preserves old history", async () => {
    await sql.query(
      "INSERT INTO colorverse.planets(id,owner_enrollment_id,document) VALUES($1,$2,$3)",
      [id[17], id[9], JSON.stringify({ metadata: { name: "验证星球" } })],
    );
    workId = randomUUID();
    const insert = async (idWork: string, date: string) =>
      sql.query(
        `INSERT INTO colorverse.showcase_works(id,planet_id,title,storage_key,byte_size,preset_id,request_id,publication_id,created_at) VALUES($1,$2,'测试作品',$1::uuid::text,10,'crystal',$1,$3,$4)`,
        [idWork, id[17], publicationId, date],
      );
    await insert(workId, "2026-10-01T00:00:00Z");
    await showcaseReview(
      sql,
      { id: id[8], role: "teacher" },
      id[5],
      workId,
      "POST",
      {
        score: 0,
        comment: "零分回显测试",
        revision: 0,
        requestId: randomUUID(),
      },
    );
    expect((await publications(sql, id[5]))[0]).toMatchObject({
      expected: 3,
      submitted: 1,
      missing: 2,
      pending: 0,
      reviewed: 1,
    });
    expect(
      (await publicationRows(sql, id[5], publicationId)).find(
        (r) => r.workId === workId,
      )?.score,
    ).toBe(0);
    await insert(randomUUID(), "2026-10-02T00:00:00Z");
    const p = (await publications(sql, id[5]))[0];
    expect(p).toMatchObject({
      expected: 3,
      submitted: 1,
      missing: 2,
      pending: 1,
      reviewed: 0,
    });
    expect(p.expected).toBe(p.submitted + p.missing);
    expect(p.submitted).toBe(p.pending + p.reviewed);
    expect(
      (await publicationRows(sql, id[5], publicationId)).find(
        (r) => r.enrollmentId === id[9],
      ),
    ).toMatchObject({ status: "pending", updated: true, score: null });
    expect(
      (
        await showcaseReview(
          sql,
          { id: id[9], role: "student" },
          id[5],
          workId,
          "GET",
        )
      ).review?.score,
    ).toBe(0);
  });
  it("keeps previous content grades separate and rejects grading a changed submission", async () => {
    await sql.query(
      "UPDATE colorverse.showcase_works SET submission_revision=1 WHERE id=$1",
      [workId],
    );
    const actor = { id: id[8], role: "teacher" };
    const before = await showcaseReview(
      sql,
      actor,
      id[5],
      workId,
      "GET",
      undefined,
      true,
    );
    expect(before).toMatchObject({
      review: null,
      latestRevision: 1,
      submissionRevision: 1,
      history: [{ score: 0 }],
    });
    await expect(
      showcaseReview(
        sql,
        actor,
        id[5],
        workId,
        "POST",
        {
          score: 95,
          comment: "草稿",
          revision: 1,
          submissionRevision: 0,
          requestId: randomUUID(),
        },
        true,
      ),
    ).rejects.toMatchObject({ code: "SUBMISSION_CHANGED" });
    const saved = await showcaseReview(
      sql,
      actor,
      id[5],
      workId,
      "POST",
      {
        score: 95,
        comment: "重新核对",
        revision: 1,
        submissionRevision: 1,
        requestId: randomUUID(),
      },
      true,
    );
    expect(saved).toMatchObject({
      review: { score: 95 },
      history: [{ score: 0 }],
    });
  });
  it("deduplicates assignment submission notifications and directs to latest work", async () => {
    const n = await classroomNotifications(
      sql,
      { id: id[8], role: "teacher" },
      id[5],
      true,
    );
    expect(n.notifications.filter((n) => n.kind === "submission")).toHaveLength(
      1,
    );
    expect(n.notifications.find((n) => n.kind === "submission")).toMatchObject({
      publicationId,
      pending: true,
    });
  });
  it("keeps free creations outside completion rate and returns explicit zero-recipient counts", async () => {
    await sql.query(
      `INSERT INTO colorverse.showcase_works(id,planet_id,title,storage_key,byte_size,preset_id,request_id) VALUES($1,$2,'自由创作',$1::uuid::text,10,'crystal',$1)`,
      [randomUUID(), id[17]],
    );
    expect((await publications(sql, id[5]))[0].submitted).toBe(1);
    const p = (await action("publications", "POST", {
      requestId: randomUUID(),
      taskId: "T02",
      enrollmentIds: [],
    })) as { id: string };
    expect(
      (await publications(sql, id[5])).find((x) => x.id === p.id),
    ).toMatchObject({
      expected: 0,
      submitted: 0,
      missing: 0,
      pending: 0,
      reviewed: 0,
    });
  });
  it("denies students and foreign classes and requires explicit historical work association", async () => {
    await expect(
      action("roster", "GET", undefined, student),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      action("roster", "GET", undefined, teacher, id[6]),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      action(`publications/${publicationId}/link`, "POST", { workId }),
    ).rejects.toMatchObject({ status: 409 });
  });
});
describe("student password lifecycle", () => {
  let challenge: string;
  it("matches exact trimmed name and preserves leading-zero school number; returns only a password challenge", async () => {
    await expect(
      account("verify", { account: "0001", name: "错误姓名" }),
    ).rejects.toMatchObject({ code: "IDENTITY_MISMATCH" });
    const v = (await account("verify", {
      account: " 0001 ",
      name: " 测试学生1 ",
    })) as { challenge: string };
    challenge = v.challenge;
    expect(v).not.toHaveProperty("access_token");
    expect(challenge.length).toBeGreaterThan(60);
  });
  it("does not activate on failed Auth update and atomically preserves other Auth metadata on success", async () => {
    failWrite = true;
    const body = {
      challenge,
      password: "Personal1234",
      confirmPassword: "Personal1234",
    };
    await expect(account("complete", body)).rejects.toMatchObject({
      code: "AUTH_UPDATE_FAILED",
    });
    expect(
      (
        await sql.query(
          "SELECT activated_at FROM colorverse.student_accounts WHERE user_id=$1",
          [id[1]],
        )
      ).rows[0].activated_at,
    ).toBeNull();
    await account("complete", body);
    expect(authUsers.get(id[1])?.password).toBe("Personal1234");
    expect(authUsers.get(id[1])?.app_metadata.original).toBe("preserve");
    await account("complete", {
      ...body,
      password: "Overwrite123",
      confirmPassword: "Overwrite123",
    });
    expect(authUsers.get(id[1])?.password).toBe("Personal1234");
  });
  it("never permits activated identity login to replace the password", async () => {
    await expect(
      account("verify", { account: "0001", name: "测试学生1" }),
    ).rejects.toMatchObject({ code: "ALREADY_ACTIVATED" });
    await expect(
      account("complete", {
        challenge: randomUUID() + randomUUID(),
        password: "Attack12345",
        confirmPassword: "Attack12345",
      }),
    ).rejects.toMatchObject({ code: "CHALLENGE_INVALID" });
  });
  it("checks the current password before changing and does not let the caller select another user", async () => {
    await expect(
      account(
        "password",
        {
          currentPassword: "Wrong1234",
          newPassword: "Personal5678",
          confirmPassword: "Personal5678",
        },
        student,
      ),
    ).rejects.toMatchObject({ code: "CURRENT_PASSWORD_INVALID" });
    await account(
      "password",
      {
        currentPassword: "Personal1234",
        newPassword: "Personal5678",
        confirmPassword: "Personal5678",
      },
      student,
    );
    expect(authUsers.get(id[1])?.password).toBe("Personal5678");
    await expect(
      account(
        "password",
        {
          userId: id[2],
          currentPassword: "Personal5678",
          newPassword: "Attack12345",
          confirmPassword: "Attack12345",
        },
        student,
      ),
    ).rejects.toBeDefined();
  });
  it("allows only the owning teacher to reset; forces personal password and never reopens identity activation", async () => {
    await expect(
      resetStudentPassword(sql, env, student, id[5], id[10], transport),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      resetStudentPassword(sql, env, teacher, id[5], id[11], transport),
    ).rejects.toMatchObject({ status: 404 });
    const r = await resetStudentPassword(
      sql,
      env,
      teacher,
      id[5],
      id[9],
      transport,
    );
    expect(authUsers.get(id[1])?.password).toBe(r.temporaryPassword);
    expect(
      authUsers.get(id[1])?.app_metadata.colorverse_password_required,
    ).toBe(true);
    await expect(
      account("verify", { account: "0001", name: "测试学生1" }),
    ).rejects.toMatchObject({ code: "ALREADY_ACTIVATED" });
    await account(
      "password",
      {
        currentPassword: r.temporaryPassword,
        newPassword: "Final123456",
        confirmPassword: "Final123456",
      },
      student,
    );
    expect(
      authUsers.get(id[1])?.app_metadata.colorverse_password_required,
    ).toBe(false);
  });
  it("requires a scoped login account when two account ranges share a school number", async () => {
    const course = randomUUID(),
      cls = randomUUID();
    await sql.query(
      "INSERT INTO colorverse.courses(id,title,created_by) VALUES($1,'另一账号范围',$2)",
      [course, id[0]],
    );
    await sql.query(
      "INSERT INTO colorverse.classes(id,course_id,title,term,timezone) VALUES($1,$2,'另一班','2026','Asia/Shanghai')",
      [cls, course],
    );
    await sql.query(
      "INSERT INTO colorverse.enrollments(id,class_id,user_id,role) VALUES($1,$2,$3,'student')",
      [randomUUID(), cls, id[4]],
    );
    await sql.query(
      "INSERT INTO colorverse.student_accounts(id,course_id,student_number,real_name,login_account,login_email,user_id) VALUES($1,$2,'0002','同号同学','0002-other-scope','other@example.test',$3)",
      [randomUUID(), course, id[4]],
    );
    authUsers.set(id[4], {
      id: id[4],
      email: "other@example.test",
      password: "RandomInitial123",
      app_metadata: {},
    });
    await expect(
      account("verify", { account: "0002", name: "同号同学" }),
    ).rejects.toMatchObject({ code: "ACCOUNT_SCOPE_REQUIRED" });
    expect(
      await account("verify", {
        account: "0002-other-scope",
        name: "同号同学",
      }),
    ).toHaveProperty("challenge");
  });
  it("persists a limit for unknown account guesses too", async () => {
    for (let i = 0; i < 10; i++)
      await account("verify", { account: "unknown", name: "未知" }).catch(
        () => {},
      );
    await expect(
      account("verify", { account: "unknown", name: "未知" }),
    ).rejects.toMatchObject({ status: 429 });
  });
});
