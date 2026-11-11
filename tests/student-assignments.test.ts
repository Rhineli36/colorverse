import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import {
  AssignmentCatalog,
  StudentAssignmentsSchema,
} from "@colorverse/contracts";
import { managementAction } from "../apps/worker/src/classroom-management";
import { showcaseReview } from "../apps/worker/src/showcase-review";

let db: PGlite;
const ids = Array.from({ length: 14 }, () => randomUUID());
const [
  teacherId,
  studentId,
  peerId,
  courseId,
  classId,
  otherClass,
  teacherEnrollment,
  enrollment,
  peerEnrollment,
  assigned,
  peerAssignment,
  planetId,
] = ids;
const issuer = "https://test.example/auth/v1";
const student = { issuer, subject: studentId, email: "student@example.test" };
const teacher = { issuer, subject: teacherId, email: "teacher@example.test" };
const peer = { issuer, subject: peerId, email: "peer@example.test" };
const sql = {
  query: (query: string, args: unknown[] = []) =>
    db.query<Record<string, unknown>>(query, args),
};
const read = async (who = student, cls = classId) =>
  StudentAssignmentsSchema.parse(
    await managementAction(sql, who, cls, "my-assignments", "GET"),
  );
beforeAll(async () => {
  db = await PGlite.create();
  await db.exec(
    "CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE colorverse_identity_reader;CREATE ROLE colorverse_classroom_writer;CREATE SCHEMA colorverse;SET search_path=colorverse,pg_catalog;CREATE TABLE course_migrations(version int primary key,sha256 text)",
  );
  for (const file of [
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
    await db.exec(await readFile(`apps/api/migrations/${file}.sql`, "utf8"));
  for (const user of [teacherId, studentId, peerId])
    await sql.query(
      "INSERT INTO colorverse.users(id,auth_issuer,auth_subject,display_name) VALUES($1,$2,$1::uuid::text,'虚拟验收身份')",
      [user, issuer],
    );
  await sql.query(
    "INSERT INTO colorverse.courses(id,title,created_by) VALUES($1,'验收课程',$2)",
    [courseId, teacherId],
  );
  for (const cls of [classId, otherClass])
    await sql.query(
      "INSERT INTO colorverse.classes(id,course_id,title,term,timezone) VALUES($1,$2,'验收班级','2026','Asia/Shanghai')",
      [cls, courseId],
    );
  for (const [eid, user, role] of [
    [teacherEnrollment, teacherId, "teacher"],
    [enrollment, studentId, "student"],
    [peerEnrollment, peerId, "student"],
  ])
    await sql.query(
      "INSERT INTO colorverse.enrollments(id,class_id,user_id,role) VALUES($1,$2,$3,$4)",
      [eid, classId, user, role],
    );
  for (const [pid, eid] of [
    [assigned, enrollment],
    [peerAssignment, peerEnrollment],
  ]) {
    await sql.query(
      "INSERT INTO colorverse.classroom_publications(id,class_id,task_id,definition,target_label,due_at,publisher_enrollment_id,request_id) VALUES($1,$2,$3,$4,'验收对象','2026-11-01T15:59:00Z',$5,$1)",
      [
        pid,
        classId,
        AssignmentCatalog[0].id,
        JSON.stringify(AssignmentCatalog[0]),
        teacherEnrollment,
      ],
    );
    await sql.query(
      "INSERT INTO colorverse.classroom_recipients(publication_id,enrollment_id) VALUES($1,$2)",
      [pid, eid],
    );
  }
}, 30000);
afterAll(async () => db?.close());

describe("student assignment center uses own published recipients and actual work versions", () => {
  it("lists assigned work before creating a planet, without leaking another student's assignments", async () => {
    const data = await read();
    expect(data.planetId).toBeNull();
    expect(data.works).toEqual([]);
    expect(data.assignments).toHaveLength(1);
    expect(data.assignments[0]).toMatchObject({
      id: assigned,
      latestWorkId: null,
      dueAt: "2026-11-01T15:59:00.000Z",
    });
    expect((await read(peer)).assignments.map((a) => a.id)).toEqual([
      peerAssignment,
    ]);
  });
  it("counts a course task once, preserves all submissions and zero scores, and separates stale reviews", async () => {
    await sql.query(
      "INSERT INTO colorverse.planets(id,owner_enrollment_id,document) VALUES($1,$2,$3)",
      [
        planetId,
        enrollment,
        JSON.stringify({ visible: false, metadata: { name: "我的隐藏星球" } }),
      ],
    );
    const addWork = async (
      publicationId: string | null,
      day: number,
      taskId: string | null = null,
    ) => {
      const id = randomUUID();
      await sql.query(
        "INSERT INTO colorverse.showcase_works(id,planet_id,title,storage_key,byte_size,preset_id,request_id,publication_id,learning_context,created_at) VALUES($1,$2,'真实提交记录',$1::uuid::text,10,'crystal',$1,$3,$4,$5)",
        [
          id,
          planetId,
          publicationId,
          JSON.stringify({ taskId }),
          `2026-11-${String(day).padStart(2, "0")}T00:00:00Z`,
        ],
      );
      return id;
    };
    const review = (workId: string, score: number, revision = 0) =>
      showcaseReview(
        sql,
        { id: teacherEnrollment, role: "teacher" },
        classId,
        workId,
        "POST",
        {
          score,
          comment: "本版本的反馈",
          revision,
          submissionRevision: 0,
          requestId: randomUUID(),
        },
        true,
      );
    const first = await addWork(assigned, 1);
    await review(first, 0);
    let data = await read();
    expect(data.assignments[0].latestWorkId).toBe(first);
    expect(data.works[0]).toMatchObject({
      id: first,
      status: "reviewed",
      score: 0,
    });
    const second = await addWork(assigned, 2);
    const free = await addWork(null, 3);
    const legacy = await addWork(null, 4, "T01");
    data = await read();
    expect(data.planetId).toBe(planetId);
    expect(data.assignments).toHaveLength(1);
    expect(data.assignments[0].latestWorkId).toBe(second);
    expect(data.works).toHaveLength(4);
    expect(data.works.find((w) => w.id === second)).toMatchObject({
      status: "pending",
      updated: true,
      score: null,
    });
    expect(data.works.find((w) => w.id === free)).toMatchObject({
      publicationId: null,
      taskId: null,
    });
    expect(data.works.find((w) => w.id === legacy)).toMatchObject({
      publicationId: null,
      taskId: "T01",
    });
    expect((await read(peer)).works).toEqual([]);
    await review(second, 88);
    expect((await read()).works.find((w) => w.id === second)).toMatchObject({
      status: "reviewed",
      score: 88,
      updated: false,
    });
    await sql.query(
      "UPDATE colorverse.showcase_works SET submission_revision=submission_revision+1 WHERE id=$1",
      [second],
    );
    expect((await read()).works.find((w) => w.id === second)).toMatchObject({
      status: "pending",
      updated: true,
      score: null,
      comment: "",
    });
    await sql.query(
      "UPDATE colorverse.showcase_works SET withdrawn_at=now(),withdrawn_by=$2 WHERE id=ANY($1::uuid[])",
      [[first, second], enrollment],
    );
    data = await read();
    expect(data.assignments[0].latestWorkId).toBeNull();
    expect(data.works.filter((w) => w.withdrawn)).toHaveLength(2);
    expect(
      (
        await sql.query(
          "SELECT count(*)::int count FROM colorverse.showcase_reviews WHERE work_id=ANY($1::uuid[])",
          [[first, second]],
        )
      ).rows[0].count,
    ).toBe(2);
  });
  it("rejects cross-class access, staff use and writes to this read-only student endpoint", async () => {
    await expect(read(student, otherClass)).rejects.toMatchObject({
      code: "CLASS_FORBIDDEN",
    });
    await expect(read(teacher)).rejects.toMatchObject({
      code: "STUDENT_REQUIRED",
    });
    await expect(
      managementAction(sql, student, classId, "my-assignments", "POST", {
        enrollmentId: peerEnrollment,
      }),
    ).rejects.toMatchObject({ status: 405 });
  });
});
