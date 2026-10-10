import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import { resolve, join } from "node:path";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import type {
  Submission,
  SubmissionDetail,
  SubmissionReceipt,
} from "@colorverse/contracts";
import {
  createCourseDatabase,
  migrateCourses,
  type CourseDatabase,
} from "../apps/api/src/database";
import { createCourseServer } from "../apps/api/src/server";
import { SubmissionService } from "@colorverse/application";
import { SqlCourseRepository } from "../apps/api/src/course-repository";
import {
  seedDevelopmentCourse,
  courseDemo as demo,
} from "../apps/api/src/seed";
let db: CourseDatabase, server: Server, url: string, temp: string;
const origin = "http://127.0.0.1:5173",
  hash = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
type Session = { cookie: string; csrf: string };
const request = async <T = Record<string, unknown>>(
  path: string,
  method = "GET",
  body?: unknown,
  session?: Session,
  extra: Record<string, string> = {},
) => {
  const response = await fetch(url + path, {
    method,
    headers: {
      Origin: origin,
      ...(session
        ? { Cookie: session.cookie, "X-CSRF-Token": session.csrf }
        : {}),
      ...(body !== undefined && !Buffer.isBuffer(body)
        ? { "Content-Type": "application/json" }
        : {}),
      ...extra,
    },
    body:
      body === undefined
        ? undefined
        : Buffer.isBuffer(body)
          ? new Uint8Array(body)
          : JSON.stringify(body),
  });
  const data = (await response.json().catch(() => null)) as T;
  return { response, data };
};
const login = async (id: string) => {
  const { response, data } = await request<{ csrfToken: string }>(
    "/dev/login",
    "POST",
    { userId: id },
  );
  expect(response.status).toBe(200);
  expect(response.headers.get("set-cookie")).toContain(
    "HttpOnly; SameSite=Lax",
  );
  return {
    cookie: response.headers.get("set-cookie")!.split(";")[0],
    csrf: data.csrfToken,
  };
};
const open = async (session: Session) => {
  const { data } = await request<Submission>(
    `/assignments/${demo.assignmentId}/submissions`,
    "POST",
    {},
    session,
  );
  return data;
};
beforeAll(async () => {
  await mkdir(resolve("work"), { recursive: true });
  temp = await mkdtemp(resolve("work/test-course-http-"));
  db = await createCourseDatabase({
    connectionString: process.env.COURSE_TEST_DATABASE_URL,
    schema: process.env.COURSE_TEST_DATABASE_URL
      ? `test_course_${randomUUID().replaceAll("-", "")}`
      : undefined,
  });
  await migrateCourses(db);
  await seedDevelopmentCourse(db);
  server = createCourseServer({
    db,
    mediaRoot: join(temp, "media"),
    origins: [origin],
    development: true,
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;
}, 30000);
afterAll(async () => {
  server?.closeIdleConnections();
  if (server) await new Promise<void>((done) => server.close(() => done()));
  await db?.close();
  if (
    (temp && temp.startsWith(resolve("work") + "\\")) ||
    (temp && temp.startsWith(resolve("work") + "/"))
  )
    await rm(temp, { recursive: true, force: true });
});
describe("course HTTP and private media", () => {
  it("rejects anonymous and forged identity requests", async () => {
    expect((await request("/classes")).response.status).toBe(401);
    expect(
      (
        await request("/classes", "GET", undefined, undefined, {
          Cookie: "colorverse_session=fake",
          "X-Role": "teacher",
          "X-User-Id": demo.teacher,
        })
      ).response.status,
    ).toBe(401);
  });
  it("binds writes to an allowed origin and CSRF token, and invalidates logout sessions", async () => {
    const session = await login(demo.student);
    expect(
      (
        await request(
          `/assignments/${demo.assignmentId}/submissions`,
          "POST",
          {},
          session,
          { Origin: "https://untrusted.invalid" },
        )
      ).response.status,
    ).toBe(403);
    expect(
      (
        await request(
          `/assignments/${demo.assignmentId}/submissions`,
          "POST",
          {},
          session,
          { "X-CSRF-Token": "fake" },
        )
      ).response.status,
    ).toBe(403);
    expect(
      (await request("/logout", "POST", {}, session)).response.status,
    ).toBe(200);
    expect(
      (await request("/me", "GET", undefined, session)).response.status,
    ).toBe(401);
  });
  it("checks actual image bytes, hash and decode before ready, and keeps originals immutable/private", async () => {
    const session = await login(demo.student),
      bytes = await readFile(
        new URL("./fixtures/media/sample-0.png", import.meta.url),
      );
    expect(
      (
        await request("/assets", "POST", bytes, session, {
          "X-Content-Sha256": "b".repeat(64),
        })
      ).response.status,
    ).toBe(422);
    const truncated = bytes.subarray(0, 40);
    expect(
      (
        await request("/assets", "POST", truncated, session, {
          "X-Content-Sha256": hash(truncated),
        })
      ).response.status,
    ).toBe(422);
    const { response, data } = await request<{ id: string; sha256: string }>(
      "/assets",
      "POST",
      bytes,
      session,
      { "X-Content-Sha256": hash(bytes) },
    );
    expect(response.status).toBe(201);
    expect(data.sha256).toBe(hash(bytes));
    expect("storageKey" in data).toBe(false);
    expect(await readFile(join(temp, "media", data.id, "original"))).toEqual(
      bytes,
    );
    await expect(
      db.query("UPDATE assets SET sha256=$2 WHERE id=$1", [
        data.id,
        "b".repeat(64),
      ]),
    ).rejects.toThrow(/immutable/);
    const image = await fetch(url + `/assets/${data.id}/display`, {
      headers: { Cookie: session.cookie },
    });
    expect(image.status).toBe(200);
    expect(image.headers.get("content-type")).toBe("image/webp");
    expect(image.headers.get("cache-control")).toBe("no-store");
    const teacher = await login(demo.teacher);
    expect(
      (await request(`/assets/${data.id}/display`, "GET", undefined, teacher))
        .response.status,
    ).toBe(403);
    const other = await login(demo.otherStudent);
    expect(
      (await request(`/assets/${data.id}/display`, "GET", undefined, other))
        .response.status,
    ).toBe(403);
  });
  it("submits over HTTP, replays duplicate requests and grants private media only to the same-class teacher", async () => {
    const student = await login(demo.student),
      s = await open(student),
      bytes = await readFile(
        new URL("./fixtures/media/sample-1.jpg", import.meta.url),
      );
    const image = (
      await request<{ id: string }>("/assets", "POST", bytes, student, {
        "X-Content-Sha256": hash(bytes),
      })
    ).data;
    const draft = {
      description: "已提交的配色说明",
      colorTags: ["对比"],
      assets: [{ assetId: image.id, role: "final" }],
    };
    await request(
      `/submissions/${s.id}/draft`,
      "PUT",
      { expectedRevision: s.revision, draft },
      student,
    );
    const a = await request<SubmissionReceipt>(
      `/submissions/${s.id}/submit`,
      "POST",
      { expectedRevision: s.revision + 1 },
      student,
      { "Idempotency-Key": "http_submit_01" },
    );
    expect(a.response.status).toBe(200);
    const b = await request<SubmissionReceipt>(
      `/submissions/${s.id}/submit`,
      "POST",
      { expectedRevision: s.revision + 1 },
      student,
      { "Idempotency-Key": "http_submit_01" },
    );
    expect(b.data).toEqual(a.data);
    await request(
      `/submissions/${s.id}/draft`,
      "PUT",
      {
        expectedRevision: s.revision + 2,
        draft: { ...draft, description: "仍是私密的修改草稿" },
      },
      student,
    );
    const teacher = await login(demo.teacher),
      view = await request<SubmissionDetail>(
        `/submissions/${s.id}`,
        "GET",
        undefined,
        teacher,
      );
    expect(view.response.status).toBe(200);
    expect(view.data.submission.draft.description).toBe("");
    expect(view.data.versions[0].description).toBe(draft.description);
    expect(
      (await request(`/assets/${image.id}/display`, "GET", undefined, teacher))
        .response.status,
    ).toBe(200);
    const outsider = await login(demo.outsider);
    expect(
      (await request(`/assets/${image.id}/display`, "GET", undefined, outsider))
        .response.status,
    ).toBe(403);
    expect(
      (await request(`/submissions/${s.id}`, "GET", undefined, outsider))
        .response.status,
    ).toBe(403);
    const result = await request<{ submission: Submission }>(
      `/submissions/${s.id}/versions/${a.data.version.id}/reviews`,
      "POST",
      {
        expectedRevision: s.revision + 3,
        decision: "returned",
        score: null,
        comment: "请补充过程图",
      },
      teacher,
    );
    expect(result.response.status).toBe(201);
    expect(result.data.submission.draft.description).toBe("");
  });
  it("returns bounded validation errors without file paths or database details", async () => {
    const session = await login(demo.student);
    const result = await request<{
      error: { code: string; message: string; requestId: string };
    }>("/submissions/invalid-id", "GET", undefined, session);
    expect(result.response.status).toBe(422);
    expect(result.data.error.message).not.toMatch(/SELECT|postgres|C:\\/);
    expect(result.data.error.requestId).toMatch(/^[a-f\d-]{36}$/);
  });
  it("disables development login routes when the server has no development identity provider", async () => {
    const production = createCourseServer({
      db,
      mediaRoot: join(temp, "media"),
      origins: [origin],
      development: false,
    });
    await new Promise<void>((done) => production.listen(0, "127.0.0.1", done));
    try {
      const response = await fetch(
        `http://127.0.0.1:${(production.address() as AddressInfo).port}/api/v1/dev/login`,
        {
          method: "POST",
          headers: { Origin: origin, "Content-Type": "application/json" },
          body: JSON.stringify({ userId: demo.teacher }),
        },
      );
      expect(response.status).toBe(401);
    } finally {
      production.closeIdleConnections();
      await new Promise<void>((done) => production.close(() => done()));
    }
  });
  it("persists the PostgreSQL development store and submission history across database reopen", async () => {
    const dataDir = join(temp, "persistence");
    let disk = await createCourseDatabase({ dataDir });
    await migrateCourses(disk);
    await seedDevelopmentCourse(disk);
    await disk.query(
      "UPDATE assignments SET instructions='持久保存验证' WHERE id=$1",
      [demo.assignmentId],
    );
    const assetId = randomUUID();
    await disk.query(
      "INSERT INTO assets(id,owner_user_id,sha256,mime_type,byte_size,width,height,storage_key,status) VALUES($1::uuid,$2,$3,'image/png',100,512,512,$1::text,'ready')",
      [assetId, demo.student, "a".repeat(64)],
    );
    const service = new SubmissionService(
      new SqlCourseRepository(disk),
      (text) => createHash("sha256").update(text).digest("hex"),
    );
    const submission = await service.open(demo.student, demo.assignmentId);
    const saved = await service.saveDraft(demo.student, submission.id, 0, {
      description: "数据库重启后保留的提交",
      colorTags: ["宁静"],
      assets: [{ assetId, role: "final" }],
    });
    const receipt = await service.submit(
      demo.student,
      submission.id,
      saved.revision,
      "disk-reopen",
    );
    await disk.close();
    disk = await createCourseDatabase({ dataDir });
    try {
      await migrateCourses(disk);
      expect(
        (
          await disk.query("SELECT instructions FROM assignments WHERE id=$1", [
            demo.assignmentId,
          ])
        ).rows[0].instructions,
      ).toBe("持久保存验证");
      const persisted = await new SqlCourseRepository(disk).detail(
        demo.student,
        submission.id,
      );
      expect(persisted.versions).toEqual([receipt.version]);
      expect(persisted.submission.currentVersionId).toBe(receipt.version.id);
      expect(
        Number(
          (
            await disk.query(
              "SELECT count(*) AS n FROM archive_entries WHERE submission_version_id=$1",
              [receipt.version.id],
            )
          ).rows[0].n,
        ),
      ).toBe(1);
    } finally {
      await disk.close();
    }
  });
});
