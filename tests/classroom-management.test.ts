import {
  awardCountSkins,
  skinCountEvidence,
} from "../apps/worker/src/classroom-skin-counts";
import { classroomDecorations } from "../apps/worker/src/classroom-decorations";
import { handleShowcaseCloud } from "../apps/worker/src/showcase-cloud";
import { learningTasks } from "../apps/worker/src/learning";
import type { Client } from "pg";
import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
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
import { classroomActor } from "../apps/worker/src/classroom";
import { ShowcaseReviewResponse } from "@colorverse/contracts";
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
    "014-assignment-media-and-skins",
    "015-count-skin-unlocks",
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
  it("redacts current and historical scores for classmates while preserving comments", async () => {
    const peer = await classroomActor(
      sql,
      { issuer, subject: id[2], email: "peer@example.test" },
      id[5],
    );
    const response = ShowcaseReviewResponse.parse(
      await Response.json(
        await showcaseReview(sql, peer, id[5], workId, "GET", undefined, true),
      ).json(),
    );
    expect(response.scoreVisible).toBe(false);
    expect(response.review).toMatchObject({ score: null, comment: "重新核对" });
    expect(response.history).toMatchObject([
      { score: null, comment: "零分回显测试", submissionRevision: 0 },
    ]);
    await expect(
      showcaseReview(sql, peer, id[5], workId, "POST", {}, true),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("keeps actual zero and current scores available to the author and class staff only", async () => {
    for (const subject of [id[0], id[1]]) {
      const actor = await classroomActor(
        sql,
        { issuer, subject, email: "reader@example.test" },
        id[5],
      );
      const response = ShowcaseReviewResponse.parse(
        await Response.json(
          await showcaseReview(
            sql,
            actor,
            id[5],
            workId,
            "GET",
            undefined,
            true,
          ),
        ).json(),
      );
      expect(response.scoreVisible).toBe(true);
      expect(response.review?.score).toBe(95);
      expect(response.history?.[0].score).toBe(0);
    }
    // A teacher role in another class never authorizes this class.
    await expect(
      classroomActor(
        sql,
        { issuer, subject: id[3], email: "foreign@example.test" },
        id[5],
      ),
    ).rejects.toMatchObject({ status: 403 });
    // Frozen competition behavior is deliberately retained.
    const legacy = await showcaseReview(
      sql,
      { id: id[10], role: "student" },
      id[5],
      workId,
      "GET",
    );
    expect(legacy.review?.score).toBe(95);
    expect(legacy).not.toHaveProperty("scoreVisible");
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
    expect(r.temporaryPassword).toBe("88888888");
    expect(authUsers.get(id[1])?.password).toBe("88888888");
    expect(
      authUsers.get(id[1])?.app_metadata.colorverse_password_required,
    ).toBe(true);
    await expect(
      account("verify", { account: "0001", name: "测试学生1" }),
    ).rejects.toMatchObject({ code: "ALREADY_ACTIVATED" });
    await expect(
      account(
        "password",
        {
          currentPassword: "88888888",
          newPassword: "88888888",
          confirmPassword: "88888888",
        },
        student,
      ),
    ).rejects.toBeDefined();
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
    expect(authUsers.get(id[1])?.password).toBe("Final123456");
    await expect(
      account(
        "password",
        {
          currentPassword: "88888888",
          newPassword: "Another12345",
          confirmPassword: "Another12345",
        },
        student,
      ),
    ).rejects.toMatchObject({ code: "CURRENT_PASSWORD_INVALID" });
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

describe("saved classroom assignment lifecycle", () => {
  it("saves privately, survives reload and duplicate save, and publishes only to confirmed recipients", async () => {
    const requestId = randomUUID(),
      taskId = `custom-${requestId}`;
    const definition = {
      title: "立冬测试（虚拟）",
      description: "观察冬日的冷暖关系",
      steps: ["绘制一张节气作品"],
      deliverables: "提交作品和说明",
    };
    const client = () =>
      ({
        ...sql,
        connect: async () => {},
        end: async () => {},
      }) as unknown as Pick<Client, "connect" | "query" | "end">;
    const save = (who = teacher) => {
      const form = new FormData();
      form.set("metadata", JSON.stringify({ requestId, definition }));
      return handleShowcaseCloud(
        new Request("https://classroom.test/", { method: "POST", body: form }),
        { ...env, IMAGES: {} } as never,
        who,
        id[5],
        "learning-tasks",
        client,
      );
    };
    const before = (await publications(sql, id[5])).length;
    expect((await save()).status).toBe(201);
    expect((await save()).status).toBe(200);
    const staff = await classroomActor(sql, teacher, id[5]);
    const pupil = await classroomActor(sql, student, id[5]);
    expect(
      (await learningTasks(sql, staff, id[5], "GET")).tasks.find(
        (t) => t.taskId === taskId,
      ),
    ).toMatchObject({
      published: false,
      definition: { title: definition.title },
    });
    expect(
      (await learningTasks(sql, pupil, id[5], "GET")).tasks.some(
        (t) => t.taskId === taskId,
      ),
    ).toBe(false);
    expect((await publications(sql, id[5])).length).toBe(before);
    expect(
      (
        await classroomNotifications(sql, pupil, id[5], true)
      ).notifications.some((n) => n.taskId === taskId),
    ).toBe(false);
    await expect(save(student)).rejects.toMatchObject({ status: 403 });
    const publication = (await action("publications", "POST", {
      requestId: randomUUID(),
      taskId,
      enrollmentIds: [id[9]],
      dueAt: null,
    })) as { id: string };
    expect(
      (await publications(sql, id[5])).find((p) => p.id === publication.id),
    ).toMatchObject({ expected: 1, submitted: 0 });
    expect(
      (await learningTasks(sql, pupil, id[5], "GET")).tasks.find(
        (t) => t.taskId === taskId,
      )?.published,
    ).toBe(true);
    expect(
      (
        await classroomNotifications(sql, pupil, id[5], true)
      ).notifications.filter((n) => n.taskId === taskId),
    ).toHaveLength(1);
  });
});

describe("winter skin is bound to real class/task grades", () => {
  it("rejects forged ownership/unlocks, accepts an actual zero grade and persists equipment", async () => {
    const bindingTask = "T02";
    await sql.query(
      "INSERT INTO colorverse.learning_task_settings(class_id,task_id,published,revision) VALUES($1,$2,false,1) ON CONFLICT DO NOTHING",
      [id[5], bindingTask],
    );
    await sql.query(
      "INSERT INTO colorverse.classroom_skin_bindings(class_id,skin_id,task_id) VALUES($1,'winter',$2)",
      [id[5], bindingTask],
    );
    const staff = await classroomActor(sql, teacher, id[5]);
    const pub = (await action("publications", "POST", {
      requestId: randomUUID(),
      taskId: bindingTask,
      enrollmentIds: [id[9]],
      dueAt: null,
    })) as { id: string };
    const wid = randomUUID();
    await sql.query(
      "INSERT INTO colorverse.showcase_works(id,planet_id,title,storage_key,byte_size,preset_id,request_id,publication_id) VALUES($1,$2,'立冬验收',$1::uuid::text,10,'crystal',$1,$3)",
      [wid, id[17], pub.id],
    );
    const read = () => classroomDecorations(sql, student, id[5], "GET", null);
    const payload = {
      frameId: "winter",
      placement: { x: 0.7, y: 0.3, amplitude: "gentle" },
      options: { particles: true, lantern: true },
      revision: 0,
    };
    expect((await read()).unlocked).toEqual([]);
    await expect(
      classroomDecorations(sql, student, id[5], "PUT", null, payload),
    ).rejects.toMatchObject({ status: 403, code: "SKIN_LOCKED" });
    await showcaseReview(
      sql,
      staff,
      id[5],
      wid,
      "POST",
      {
        score: null,
        comment: "只有评语",
        revision: 0,
        submissionRevision: 0,
        requestId: randomUUID(),
      },
      true,
    );
    expect((await read()).unlocked).toEqual([]);
    await showcaseReview(
      sql,
      staff,
      id[5],
      wid,
      "POST",
      {
        score: 90,
        comment: "初稿评分",
        revision: 1,
        submissionRevision: 0,
        requestId: randomUUID(),
      },
      true,
    );
    await sql.query(
      "UPDATE colorverse.showcase_works SET submission_revision=1 WHERE id=$1",
      [wid],
    );

    expect((await read()).unlocked).toEqual([]); // old grade belongs to an older version
    await showcaseReview(
      sql,
      staff,
      id[5],
      wid,
      "POST",
      {
        score: 0,
        comment: "实际零分也已评分",
        revision: 2,
        submissionRevision: 1,
        requestId: randomUUID(),
      },
      true,
    );
    expect((await read()).unlocked).toEqual(["winter"]);
    const applied = await classroomDecorations(
      sql,
      student,
      id[5],
      "PUT",
      null,
      payload,
    );
    expect(applied.settings).toMatchObject({
      frameId: "winter",
      revision: 1,
      placement: { x: 0.7 },
    });
    await expect(
      classroomDecorations(sql, student, id[5], "PUT", null, payload),
    ).rejects.toMatchObject({ code: "SKIN_CONFLICT" });
    await expect(
      classroomDecorations(sql, student, id[5], "PUT", null, {
        ...payload,
        frameId: "gold",
        revision: 1,
      }),
    ).rejects.toMatchObject({ code: "SKIN_LOCKED" });
    const visible = await classroomDecorations(
      sql,
      teacher,
      id[5],
      "GET",
      id[17],
    );
    expect(visible.settings.frameId).toBe("winter");
    expect(visible.unlocked).toEqual([]);
    await expect(
      classroomDecorations(sql, teacher, id[5], "PUT", id[17], {
        ...payload,
        revision: 1,
      }),
    ).rejects.toMatchObject({ code: "OWNER_REQUIRED" });
    const cleared = await classroomDecorations(
      sql,
      student,
      id[5],
      "PUT",
      null,
      { ...payload, frameId: null, revision: 1 },
    );
    expect(cleared.settings.frameId).toBeNull();
    expect(cleared.unlocked).toEqual(["winter"]);
  });
});

describe("multiple private assignment reference images", () => {
  it("stores ordered images, restricts draft media, and keeps indexed media private", async () => {
    const bytes = new Uint8Array(
      await readFile("apps/web/public/assignments/two-moods.webp"),
    );
    const uploaded: string[] = [];
    const transport = vi.fn(async (url: string, options?: RequestInit) => {
      if (options?.method === "POST") uploaded.push(url);
      return new Response(bytes, { headers: { "Content-Type": "image/webp" } });
    });
    vi.stubGlobal("fetch", transport);
    const imageEnv = {
      ...env,
      IMAGES: {
        input: () => ({
          transform: () => ({
            output: async () => ({ response: () => new Response(bytes) }),
          }),
        }),
      },
    };
    const factory = () =>
      ({
        ...sql,
        connect: async () => {},
        end: async () => {},
      }) as unknown as Pick<Client, "connect" | "query" | "end">;
    const rid = randomUUID();
    try {
      const form = new FormData();
      form.set(
        "metadata",
        JSON.stringify({
          requestId: rid,
          definition: {
            title: "双参考图",
            description: "按顺序看图",
            steps: [],
            deliverables: "一张作品",
          },
        }),
      );
      form.set("image", new Blob([bytes]), "first.webp");
      form.append("images", new Blob([bytes]), "second.webp");
      const response = await handleShowcaseCloud(
        new Request("https://classroom.test/", { method: "POST", body: form }),
        imageEnv,
        teacher,
        id[5],
        "learning-tasks",
        factory,
      );
      expect(response.status).toBe(201);
      expect(uploaded).toHaveLength(2);
      const result = (await response.json()) as {
        taskId: string;
        tasks: { taskId: string; definition?: { images?: string[] } }[];
      };
      const images = result.tasks.find((t) => t.taskId === result.taskId)
        ?.definition?.images;
      expect(images).toHaveLength(2);
      expect(images?.[1]).toContain("?index=1");
      const image = await handleShowcaseCloud(
        new Request("https://classroom.test/?index=1"),
        imageEnv,
        teacher,
        id[5],
        `learning-tasks/${result.taskId}/image`,
        factory,
      );
      expect(image.headers.get("Cache-Control")).toBe("private, no-store");
      expect(transport.mock.calls.at(-1)?.[0]).toContain(
        `assignment-${rid}-1.webp`,
      );
      await expect(
        handleShowcaseCloud(
          new Request("https://classroom.test/?index=1"),
          imageEnv,
          student,
          id[5],
          `learning-tasks/${result.taskId}/image`,
          factory,
        ),
      ).rejects.toMatchObject({ status: 404 });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

async function countFixture() {
  const cls = randomUUID();
  await sql.query(
    "INSERT INTO colorverse.classes(id,course_id,title,term,timezone) VALUES($1,$2,'成长验收班','2026','Asia/Shanghai')",
    [cls, id[7]],
  );
  const people = [];
  for (let i = 0; i < 2; i++) {
    const uid = randomUUID(),
      eid = randomUUID(),
      pid = randomUUID();
    await sql.query(
      "INSERT INTO colorverse.users(id,auth_issuer,auth_subject,display_name) VALUES($1,$2,$1::uuid::text,'虚拟同学')",
      [uid, issuer],
    );
    await sql.query(
      "INSERT INTO colorverse.enrollments(id,class_id,user_id,role) VALUES($1,$2,$3,'student')",
      [eid, cls, uid],
    );
    await sql.query(
      "INSERT INTO colorverse.planets(id,owner_enrollment_id,document) VALUES($1,$2,$3)",
      [
        pid,
        eid,
        JSON.stringify({
          metadata: { name: "成长星球" },
          useDefaultExterior: true,
        }),
      ],
    );
    people.push({
      uid,
      eid,
      pid,
      identity: { issuer, subject: uid, email: "count@example.test" },
    });
  }
  const [owner, peer] = people;
  const read = () =>
    classroomDecorations(sql, owner.identity, cls, "GET", null);
  const react = async (
    who: typeof owner,
    planetId: string,
    kind: string,
    content: string,
    workId: string | null = null,
    rid = randomUUID(),
  ) =>
    handleShowcaseCloud(
      new Request("https://classroom.test/", {
        method: "POST",
        body: JSON.stringify({
          requestId: rid,
          planetId,
          workId,
          kind,
          content,
        }),
      }),
      { ...env, IMAGES: {} } as never,
      who.identity,
      cls,
      "interactions",
      () =>
        ({
          ...sql,
          connect: async () => {},
          end: async () => {},
        }) as unknown as Pick<Client, "connect" | "query" | "end">,
    );
  const work = async (planetId: string, publication: string | null = null) => {
    const wid = randomUUID();
    await sql.query(
      "INSERT INTO colorverse.showcase_works(id,planet_id,title,storage_key,byte_size,preset_id,request_id,publication_id) VALUES($1,$2,'成长作品',$1::uuid::text,10,'crystal',$1,$3)",
      [wid, planetId, publication],
    );
    return wid;
  };
  return { cls, owner, peer, read, react, work };
}
describe("six classroom skin milestones from authoritative evidence", () => {
  it("unlocks upload milestone without any work, preserves it after switching defaults and only reveals own progress", async () => {
    const f = await countFixture();
    expect((await f.read()).progress.silver.current).toBe(0);
    await sql.query(
      "UPDATE colorverse.planets SET document=jsonb_set(document,'{media}',$1) WHERE id=$2",
      [
        JSON.stringify({
          exterior: { id: "image-a", key: "private-a", bytes: 100 },
        }),
        f.owner.pid,
      ],
    );
    expect((await f.read()).progress.silver.current).toBe(1);
    expect((await f.read()).unlocked).not.toContain("silver");
    await sql.query(
      "UPDATE colorverse.planets SET document=jsonb_set(document,'{media,interior}',$1) WHERE id=$2",
      [
        JSON.stringify({ id: "image-b", key: "private-b", bytes: 100 }),
        f.owner.pid,
      ],
    );
    expect((await f.read()).unlocked).toContain("silver");
    const proof = (
      await sql.query(
        "SELECT proof_work_id,evidence FROM colorverse.classroom_skin_unlocks WHERE enrollment_id=$1 AND skin_id='silver'",
        [f.owner.eid],
      )
    ).rows[0];
    expect(proof.proof_work_id).toBeNull();
    expect(proof.evidence).toMatchObject({
      exteriorUploaded: true,
      interiorUploaded: true,
    });
    await sql.query(
      "UPDATE colorverse.planets SET document=jsonb_set(document,'{media}','{}') WHERE id=$1",
      [f.owner.pid],
    );
    const retained = await f.read();
    expect(retained.unlocked).toContain("silver");
    expect(retained.progress.silver.current).toBe(0);
    const other = await classroomDecorations(
      sql,
      f.peer.identity,
      f.cls,
      "GET",
      f.owner.pid,
    );
    expect(other.unlocked).toEqual([]);
    expect(other.progress).toEqual({});
  });
  it("awards interaction thresholds at 20/50 on successful posts, deduplicates comments/retries and excludes self and removed works", async () => {
    const f = await countFixture();
    for (let i = 0; i < 19; i++)
      await f.react(f.owner, f.peer.pid, "comment", "观察 " + i);
    expect((await f.read()).progress.gold.current).toBe(19);
    expect((await f.read()).unlocked).not.toContain("gold");
    await f.react(f.owner, f.peer.pid, "comment", " 观察 0 ");
    expect((await f.read()).progress.gold.current).toBe(19);
    await f.react(f.owner, f.owner.pid, "comment", "自言自语");
    expect((await f.read()).progress.gold.current).toBe(19);
    const wid = await f.work(f.peer.pid);
    await sql.query(
      "UPDATE colorverse.showcase_works SET withdrawn_at=now(),withdrawn_by=$2 WHERE id=$1",
      [wid, f.peer.eid],
    );
    await sql.query(
      "INSERT INTO colorverse.classroom_interactions(id,actor_enrollment_id,planet_id,work_id,kind,content,request_id) VALUES($1,$2,$3,$4,'comment','已移除作品留言',$1)",
      [randomUUID(), f.owner.eid, f.peer.pid, wid],
    );
    expect((await f.read()).progress.gold.current).toBe(19);
    const rid = randomUUID();
    await f.react(f.owner, f.peer.pid, "emoji", "✨", null, rid);
    await f.react(f.owner, f.peer.pid, "emoji", "✨", null, rid);
    const awarded = (
      await sql.query(
        "SELECT skin_id FROM colorverse.classroom_skin_unlocks WHERE enrollment_id=$1",
        [f.owner.eid],
      )
    ).rows;
    expect(awarded.some((x) => x.skin_id === "gold")).toBe(true);
    expect((await f.read()).progress.gold.current).toBe(20);
    for (let i = 19; i < 48; i++)
      await f.react(f.owner, f.peer.pid, "comment", "观察 " + i);
    expect((await f.read()).progress.floral.current).toBe(49);
    expect((await f.read()).unlocked).not.toContain("floral");
    await f.react(f.owner, f.peer.pid, "like", "");
    expect((await f.read()).unlocked).toContain("floral");
    await sql.query(
      "DELETE FROM colorverse.classroom_interactions WHERE actor_enrollment_id=$1",
      [f.owner.eid],
    );
    expect((await f.read()).unlocked).toEqual(
      expect.arrayContaining(["gold", "floral"]),
    );
    expect((await f.read()).progress.gold.current).toBe(0);
  });
  it("combines unique received planet/work likes, awards the recipient immediately at 10 and preserves earned status after withdrawal", async () => {
    const f = await countFixture();
    const works = [];
    for (let i = 0; i < 9; i++) {
      const wid = await f.work(f.owner.pid);
      works.push(wid);
      await f.react(f.peer, f.owner.pid, "like", "", wid);
    }
    expect((await f.read()).progress.sapphire.current).toBe(9);
    expect((await f.read()).unlocked).not.toContain("sapphire");
    const rid = randomUUID();
    await f.react(f.peer, f.owner.pid, "like", "", null, rid);
    await f.react(f.peer, f.owner.pid, "like", "", null, rid);
    expect(
      (
        await sql.query(
          "SELECT skin_id FROM colorverse.classroom_skin_unlocks WHERE enrollment_id=$1 AND skin_id='sapphire'",
          [f.owner.eid],
        )
      ).rows,
    ).toHaveLength(1);
    expect((await f.read()).progress.sapphire.current).toBe(10);
    await sql.query(
      "UPDATE colorverse.showcase_works SET withdrawn_at=now(),withdrawn_by=$2 WHERE id=ANY($1::uuid[])",
      [works, f.owner.eid],
    );
    expect((await f.read()).progress.sapphire.current).toBe(1);
    expect((await f.read()).unlocked).toContain("sapphire");
  });
  it("counts different course tasks at 5/10, excludes free work and deduplicates resubmissions and repeated publications", async () => {
    const f = await countFixture();
    const publish = async (task: string) => {
      const pub = randomUUID();
      await sql.query(
        "INSERT INTO colorverse.classroom_publications(id,class_id,task_id,definition,target_label,publisher_enrollment_id,request_id) VALUES($1,$2,$3,'{}','验收',$4,$1)",
        [pub, f.cls, task, f.owner.eid],
      );
      await sql.query(
        "INSERT INTO colorverse.classroom_recipients(publication_id,enrollment_id) VALUES($1,$2)",
        [pub, f.owner.eid],
      );
      return pub;
    };
    for (let i = 0; i < 4; i++)
      await f.work(f.owner.pid, await publish("count-task-" + i));
    await f.work(f.owner.pid);
    await f.work(f.owner.pid, await publish("count-task-0"));
    expect((await f.read()).progress.emerald.current).toBe(4);
    expect((await f.read()).unlocked).not.toContain("emerald");
    const fifth = await publish("count-task-4");
    await f.work(f.owner.pid, fifth);
    await f.work(f.owner.pid, fifth);
    expect((await f.read()).unlocked).toContain("emerald");
    expect((await f.read()).progress.emerald.current).toBe(5);
    for (let i = 5; i < 9; i++)
      await f.work(f.owner.pid, await publish("count-task-" + i));
    expect((await f.read()).progress.glass.current).toBe(9);
    expect((await f.read()).unlocked).not.toContain("glass");
    await f.work(f.owner.pid, await publish("count-task-9"));
    await awardCountSkins(sql, f.cls, [f.owner.eid]);
    expect((await f.read()).unlocked).toEqual(
      expect.arrayContaining(["emerald", "glass"]),
    );
    const other = await countFixture();
    expect(await skinCountEvidence(sql, other.cls, f.owner.eid)).toBeNull();
    expect((await f.read()).unlocked).not.toContain("winter");
  });
});
