import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { createHash, randomUUID } from "node:crypto";
import { SubmissionService } from "@colorverse/application";
import {
  createCourseDatabase,
  migrateCourses,
  type CourseDatabase,
} from "../apps/api/src/database";
import { SqlCourseRepository } from "../apps/api/src/course-repository";
import {
  seedDevelopmentCourse,
  courseDemo as demo,
} from "../apps/api/src/seed";
import { uid } from "@colorverse/fixtures";
import type { AssignmentInput, SubmissionDraft } from "@colorverse/contracts";
let db: CourseDatabase, repo: SqlCourseRepository, service: SubmissionService;
const now = "2026-10-10T12:00:00.000Z",
  hash = (s: string) => createHash("sha256").update(s).digest("hex");
const draft: SubmissionDraft = {
  description: "橙色与蓝色的对话",
  colorTags: ["温暖"],
  assets: [{ assetId: uid(86001), role: "final" }],
};
const assignment: AssignmentInput = {
  title: "测试提交",
  instructions: "",
  module: "色彩",
  dueAt: "2026-10-11T12:00:00Z",
  lateUntil: "2026-10-12T12:00:00Z",
  maxScore: 100,
  status: "published",
  allowResubmission: false,
};
const fresh = async () => {
  const a = await service.createAssignment(
    demo.teacher,
    demo.classId,
    assignment,
  );
  return service.open(demo.student, a.id);
};
beforeAll(async () => {
  db = await createCourseDatabase({
    connectionString: process.env.COURSE_TEST_DATABASE_URL,
    schema: process.env.COURSE_TEST_DATABASE_URL
      ? `test_course_${randomUUID().replaceAll("-", "")}`
      : undefined,
  });
  await migrateCourses(db);
  await seedDevelopmentCourse(db);
  repo = new SqlCourseRepository(db);
  service = new SubmissionService(repo, hash, () => now);
  for (const [id, owner, status] of [
    [uid(86001), demo.student, "ready"],
    [uid(86002), demo.otherStudent, "ready"],
    [uid(86003), demo.student, "pending"],
  ])
    await db.query(
      "INSERT INTO assets(id,owner_user_id,sha256,mime_type,byte_size,width,height,storage_key,status) VALUES($1::uuid,$2,$3,'image/png',100,512,512,$1::text,$4)",
      [id, owner, "a".repeat(64), status],
    );
}, 30000);
afterAll(async () => {
  await db?.close();
});
describe("atomic course submissions", () => {
  it("applies the migration once, preserves it on rerun and refuses modified migration metadata", async () => {
    await migrateCourses(db);
    expect(
      Number(
        (await db.query("SELECT count(*) AS n FROM course_migrations")).rows[0]
          .n,
      ),
    ).toBe(1);
    await db.query("UPDATE course_migrations SET sha256=$1 WHERE version=1", [
      "b".repeat(64),
    ]);
    await expect(migrateCourses(db)).rejects.toThrow("has changed");
    await db.query("UPDATE course_migrations SET sha256=$1 WHERE version=1", [
      createHash("sha256")
        .update(
          await (
            await import("node:fs/promises")
          ).readFile(
            new URL("../apps/api/migrations/001-course.sql", import.meta.url),
          ),
        )
        .digest("hex"),
    ]);
  });
  it("opens one submission per student and rejects cross-class/teacher writes", async () => {
    const s = await fresh();
    expect((await service.open(demo.student, s.assignmentId)).id).toBe(s.id);
    await expect(
      service.saveDraft(demo.otherStudent, s.id, 0, draft),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      service.open(demo.outsider, s.assignmentId),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      service.open(demo.teacher, s.assignmentId),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("rejects foreign/pending images and stale draft updates without modifying saved data", async () => {
    const s = await fresh();
    for (const assetId of [uid(86002), uid(86003), randomUUID()])
      await expect(
        service.saveDraft(demo.student, s.id, 0, {
          ...draft,
          assets: [{ assetId, role: "final" }],
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await service.saveDraft(demo.student, s.id, 0, draft);
    await expect(
      service.saveDraft(demo.student, s.id, 0, {
        ...draft,
        description: "过时",
      }),
    ).rejects.toMatchObject({ code: "REVISION_CONFLICT" });
    expect(
      (await repo.detail(demo.student, s.id)).submission.draft.description,
    ).toBe(draft.description);
  });
  it("freezes content and archives once under concurrent duplicate submit requests", async () => {
    const s = await fresh();
    await service.saveDraft(demo.student, s.id, 0, draft);
    const [a, b] = await Promise.all([
      service.submit(demo.student, s.id, 1, "duplicate_key_01"),
      service.submit(demo.student, s.id, 1, "duplicate_key_01"),
    ]);
    expect(a).toEqual(b);
    expect((await repo.detail(demo.student, s.id)).versions).toHaveLength(1);
    const entries = await db.query(
      "SELECT id FROM archive_entries WHERE submission_version_id=$1",
      [a.version.id],
    );
    expect(entries.rows).toHaveLength(1);
    await service.saveDraft(demo.student, s.id, 2, {
      ...draft,
      description: "新版草稿",
    });
    expect(
      (await repo.detail(demo.student, s.id)).versions[0].description,
    ).toBe(draft.description);
    await expect(
      db.query(
        "UPDATE submission_versions SET description='覆盖' WHERE id=$1",
        [a.version.id],
      ),
    ).rejects.toThrow(/Immutable/);
    await expect(
      db.query("DELETE FROM submission_version_assets WHERE version_id=$1", [
        a.version.id,
      ]),
    ).rejects.toThrow(/Immutable/);
  });
  it("rejects concurrent different submit requests and reused keys with a different revision", async () => {
    const s = await fresh();
    await service.saveDraft(demo.student, s.id, 0, draft);
    const result = await Promise.allSettled([
      service.submit(demo.student, s.id, 1, "parallel_key_01"),
      service.submit(demo.student, s.id, 1, "parallel_key_02"),
    ]);
    expect(result.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const winner = result.find((r) => r.status === "fulfilled")!;
    if (winner.status !== "fulfilled") throw new Error("Expected success");
    const key =
      result[0].status === "fulfilled" ? "parallel_key_01" : "parallel_key_02";
    await expect(
      service.submit(demo.student, s.id, 2, key),
    ).rejects.toMatchObject({ code: "REVISION_CONFLICT" });
  });
  it("rolls version, pointers and archive back together if archive insertion fails", async () => {
    const s = await fresh();
    await service.saveDraft(demo.student, s.id, 0, draft);
    const wrapped = {
      run: <T>(fn: Parameters<SqlCourseRepository["run"]>[0]) =>
        repo.run((tx) =>
          fn(
            new Proxy(tx, {
              get(target, key) {
                if (key === "appendArchive")
                  return async () => {
                    throw new Error("archive unavailable");
                  };
                const value = Reflect.get(target, key);
                return typeof value === "function" ? value.bind(target) : value;
              },
            }),
          ),
        ) as Promise<T>,
    };
    const broken = new SubmissionService(wrapped, hash, () => now);
    await expect(
      broken.submit(demo.student, s.id, 1, "rollback_key_01"),
    ).rejects.toThrow("archive unavailable");
    const detail = await repo.detail(demo.student, s.id);
    expect(detail.versions).toHaveLength(0);
    expect(detail.submission.revision).toBe(1);
    expect(detail.submission.currentVersionId).toBe(null);
  });
  it("allows same-class teachers to see versions but never the unsubmitted or edited private draft", async () => {
    const s = await fresh();
    await service.saveDraft(demo.student, s.id, 0, draft);
    await expect(repo.detail(demo.teacher, s.id)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await service.submit(demo.student, s.id, 1, "privacy_key_01");
    await service.saveDraft(demo.student, s.id, 2, {
      ...draft,
      description: "不向老师公开的草稿",
    });
    const view = await repo.detail(demo.teacher, s.id);
    expect(view.submission.draft.description).toBe("");
    expect(view.versions[0].description).toBe(draft.description);
    await expect(repo.detail(demo.otherStudent, s.id)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(repo.detail(demo.outsider, s.id)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
  it("returns, resubmits, grades and appends corrected reviews without replacing old versions/comments", async () => {
    const s = await fresh();
    await service.saveDraft(demo.student, s.id, 0, draft);
    const first = await service.submit(demo.student, s.id, 1, "review_key_01");
    await expect(
      service.review(demo.otherStudent, s.id, first.version.id, {
        expectedRevision: 2,
        decision: "returned",
        score: null,
        comment: "越权",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await service.review(demo.teacher, s.id, first.version.id, {
      expectedRevision: 2,
      decision: "returned",
      score: null,
      comment: "补充过程图",
    });
    await service.saveDraft(demo.student, s.id, 3, {
      ...draft,
      description: "修改后",
    });
    const second = await service.submit(demo.student, s.id, 4, "review_key_02");
    expect(second.version.versionNo).toBe(2);
    await expect(
      service.review(demo.teacher, s.id, second.version.id, {
        expectedRevision: 5,
        decision: "graded",
        score: 101,
        comment: "",
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    const grade = await service.review(demo.teacher, s.id, second.version.id, {
      expectedRevision: 5,
      decision: "graded",
      score: 88,
      comment: "配色清晰",
    });
    const correction = await service.review(
      demo.teacher,
      s.id,
      second.version.id,
      {
        expectedRevision: 6,
        decision: "graded",
        score: 90,
        comment: "补充批注",
      },
    );
    expect(correction.review.supersedesId).toBe(grade.review.id);
    await expect(
      service.submit(demo.student, s.id, 7, "review_key_03"),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await repo.detail(demo.student, s.id)).reviews).toHaveLength(3);
    await expect(
      db.query("UPDATE reviews SET comment='覆盖' WHERE id=$1", [
        grade.review.id,
      ]),
    ).rejects.toThrow(/Immutable/);
  });
  it("enforces server deadlines and inactive enrollment even for an existing session", async () => {
    const a = await service.createAssignment(demo.teacher, demo.classId, {
      ...assignment,
      dueAt: "2026-10-09T12:00:00Z",
      lateUntil: "2026-10-11T12:00:00Z",
    });
    const s = await service.open(demo.student, a.id);
    await service.saveDraft(demo.student, s.id, 0, draft);
    expect(
      (await service.submit(demo.student, s.id, 1, "late_key_01")).version
        .isLate,
    ).toBe(true);
    await db.query(
      "UPDATE enrollments SET status='inactive' WHERE user_id=$1",
      [demo.student],
    );
    await expect(
      service.saveDraft(demo.student, s.id, 2, draft),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await db.query("UPDATE enrollments SET status='active' WHERE user_id=$1", [
      demo.student,
    ]);
  });
});
