import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import {
  editPublishedAssignment,
  publishedAssignmentRequest,
} from "../apps/worker/src/published-assignment";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import {
  AssignmentCatalog,
  StudentAssignmentsSchema,
} from "@colorverse/contracts";
import { managementAction } from "../apps/worker/src/classroom-management";
import { showcaseReview } from "../apps/worker/src/showcase-review";
import { handleShowcaseCloud } from "../apps/worker/src/showcase-cloud";
import { publicationRows } from "../apps/worker/src/classroom-management";
import { classroomNotifications } from "../apps/worker/src/notifications";

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
    "017-published-assignment-edits",
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

describe("published assignment content edits", () => {
  const taskId = "custom-" + randomUUID();
  const definition = {
    ...AssignmentCatalog[0],
    id: taskId,
    title: "原发布要求",
    image: "private:original-image",
    images: ["private:original-image", "private:second-image"],
  };
  const fields = {
    title: "修改后的要求",
    description: "更新文字细节",
    steps: ["保留手动编号"],
    stepLayout: "manual",
    deliverables: "提交要求保持清楚",
  };
  const seed = async () => {
    await sql.query(
      "INSERT INTO colorverse.learning_task_settings(class_id,task_id,published,revision,definition,image_storage_key,image_storage_keys) VALUES($1,$2,true,1,$3,'legacy-a.webp',$4)",
      [
        classId,
        taskId,
        JSON.stringify(definition),
        JSON.stringify(["legacy-a.webp", "legacy-b.webp"]),
      ],
    );
    await sql.query(
      "UPDATE colorverse.classroom_publications SET task_id=$3,definition=$4 WHERE class_id=$1 AND id=ANY($2::uuid[])",
      [classId, [assigned, peerAssignment], taskId, JSON.stringify(definition)],
    );
  };
  it("replaces images and text only for the chosen publication, preserving recipients, works, grades and old media references", async () => {
    await sql.query("BEGIN");
    try {
      await seed();
      const before = (
        await sql.query(
          "SELECT id,task_id,target_label,due_at,published_at,request_id FROM colorverse.classroom_publications WHERE id=$1",
          [assigned],
        )
      ).rows[0];
      const recipients = (
        await sql.query(
          "SELECT * FROM colorverse.classroom_recipients ORDER BY publication_id,enrollment_id",
        )
      ).rows;
      const grades = (
        await sql.query("SELECT * FROM colorverse.showcase_reviews ORDER BY id")
      ).rows;
      const workRecords = (
        await sql.query("SELECT * FROM colorverse.showcase_works ORDER BY id")
      ).rows;
      const edited = await editPublishedAssignment(
        sql,
        teacher,
        classId,
        assigned,
        { revision: 0, definition: fields, keepImageIndices: [1] },
        async (remaining) => {
          expect(remaining).toBe(5);
          return ["replacement.webp"];
        },
      );
      expect(edited).toMatchObject({
        id: assigned,
        revision: 1,
        definition: {
          title: fields.title,
          description: fields.description,
          stepLayout: "manual",
        },
      });
      expect(edited.definition.images).toEqual(
        [0, 1].map(
          (index) =>
            `private:classes/${classId}/publications/${assigned}/image?revision=1&index=${index}`,
        ),
      );
      const row = (
        await sql.query(
          "SELECT * FROM colorverse.classroom_publications WHERE id=$1",
          [assigned],
        )
      ).rows[0];
      expect(row.image_storage_keys).toEqual([
        "legacy-b.webp",
        "replacement.webp",
      ]);
      expect(row.content_history).toMatchObject([
        {
          revision: 0,
          definition: { title: definition.title },
          imageStorageKeys: ["legacy-a.webp", "legacy-b.webp"],
        },
      ]);
      expect(
        (
          await sql.query(
            "SELECT id,task_id,target_label,due_at,published_at,request_id FROM colorverse.classroom_publications WHERE id=$1",
            [assigned],
          )
        ).rows[0],
      ).toEqual(before);
      expect(
        (
          await sql.query(
            "SELECT * FROM colorverse.classroom_recipients ORDER BY publication_id,enrollment_id",
          )
        ).rows,
      ).toEqual(recipients);
      expect(
        (
          await sql.query(
            "SELECT * FROM colorverse.showcase_reviews ORDER BY id",
          )
        ).rows,
      ).toEqual(grades);
      expect(
        (await sql.query("SELECT * FROM colorverse.showcase_works ORDER BY id"))
          .rows,
      ).toEqual(workRecords);
      expect(
        (
          await sql.query(
            "SELECT definition FROM colorverse.classroom_publications WHERE id=$1",
            [peerAssignment],
          )
        ).rows[0].definition,
      ).toEqual(definition);
      expect((await read()).assignments[0].definition).toEqual(
        edited.definition,
      );
      await editPublishedAssignment(sql, teacher, classId, assigned, {
        revision: 1,
        definition: fields,
        keepImageIndices: [],
      });
      expect((await read()).assignments[0].definition.images).toEqual([]);
    } finally {
      await sql.query("ROLLBACK");
    }
  });
  it("rejects stale edits, student edits, cross-class requests, and invalid retained image indices before upload", async () => {
    await sql.query("BEGIN");
    try {
      await seed();
      const append = vi.fn(async () => ["new.webp"]);
      await expect(
        editPublishedAssignment(
          sql,
          student,
          classId,
          assigned,
          { revision: 0, definition: fields },
          append,
        ),
      ).rejects.toMatchObject({ status: 403 });
      await expect(
        editPublishedAssignment(
          sql,
          teacher,
          otherClass,
          assigned,
          { revision: 0, definition: fields },
          append,
        ),
      ).rejects.toMatchObject({ status: 403 });
      await expect(
        editPublishedAssignment(
          sql,
          teacher,
          classId,
          randomUUID(),
          { revision: 0, definition: fields },
          append,
        ),
      ).rejects.toMatchObject({ status: 404 });
      await expect(
        editPublishedAssignment(
          sql,
          teacher,
          classId,
          assigned,
          { revision: 1, definition: fields },
          append,
        ),
      ).rejects.toMatchObject({ code: "TASK_CONFLICT" });
      await expect(
        editPublishedAssignment(
          sql,
          teacher,
          classId,
          assigned,
          { revision: 0, definition: fields, keepImageIndices: [4] },
          append,
        ),
      ).rejects.toMatchObject({ code: "TASK_CONFLICT" });
      expect(append).not.toHaveBeenCalled();
      expect(
        (
          await sql.query(
            "SELECT content_revision FROM colorverse.classroom_publications WHERE id=$1",
            [assigned],
          )
        ).rows[0].content_revision,
      ).toBe(0);
    } finally {
      await sql.query("ROLLBACK");
    }
  });
  it("serves the correct private publication image and blocks peers and stale media versions", async () => {
    await sql.query("BEGIN");
    const fetcher = vi.fn(async (url: unknown) => {
      expect(String(url)).toContain("storage/v1/object");
      return new Response("private-image");
    });
    vi.stubGlobal("fetch", fetcher);
    const env = {
      CLASSROOM_NEXT: "true",
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SECRET_KEY: "test",
    };
    try {
      await seed();
      await editPublishedAssignment(sql, teacher, classId, assigned, {
        revision: 0,
        definition: fields,
        keepImageIndices: [1],
      });
      const request = () =>
        new Request("https://classroom.test/?revision=1&index=0");
      const response = await publishedAssignmentRequest(
        request(),
        env,
        student,
        classId,
        assigned,
        "image",
        sql,
        [],
      );
      expect(await response.text()).toBe("private-image");
      expect(String(fetcher.mock.calls[0][0])).toContain("legacy-b.webp");
      await expect(
        publishedAssignmentRequest(
          request(),
          env,
          peer,
          classId,
          assigned,
          "image",
          sql,
          [],
        ),
      ).rejects.toMatchObject({ status: 404 });
      await expect(
        publishedAssignmentRequest(
          new Request("https://classroom.test/?revision=0"),
          env,
          student,
          classId,
          assigned,
          "image",
          sql,
          [],
        ),
      ).rejects.toMatchObject({ code: "TASK_CONFLICT" });
      await expect(
        publishedAssignmentRequest(
          request(),
          env,
          student,
          classId,
          assigned,
          "content",
          sql,
          [],
        ),
      ).rejects.toMatchObject({ status: 403 });
      expect(fetcher).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
      await sql.query("ROLLBACK");
    }
  });
  it("accepts a real multipart image replacement through the published edit request handler", async () => {
    await sql.query("BEGIN");
    const bytes = new Uint8Array(
      await readFile("apps/web/public/assignments/two-moods.webp"),
    );
    const uploads: string[] = [];
    const transport = vi.fn(async (url: unknown, options?: RequestInit) => {
      expect(options?.method).toBe("POST");
      expect(String(url)).toContain("colorverse-classroom/");
      return new Response("{}");
    });
    vi.stubGlobal("fetch", transport);
    try {
      await seed();
      const form = new FormData();
      form.set(
        "metadata",
        JSON.stringify({
          revision: 0,
          definition: fields,
          keepImageIndices: [],
        }),
      );
      form.set(
        "image",
        new Blob([bytes], { type: "image/webp" }),
        "replacement.webp",
      );
      const env = {
        CLASSROOM_NEXT: "true",
        SUPABASE_URL: "https://example.supabase.co",
        SUPABASE_SECRET_KEY: "test",
        IMAGES: {
          input: () => ({
            transform: () => ({
              output: async () => ({ response: () => new Response(bytes) }),
            }),
          }),
        },
      };
      const response = await publishedAssignmentRequest(
        new Request("https://classroom.test/", { method: "PATCH", body: form }),
        env,
        teacher,
        classId,
        assigned,
        "content",
        sql,
        uploads,
      );
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        id: assigned,
        revision: 1,
        definition: { title: fields.title },
      });
      expect(uploads).toHaveLength(1);
      expect(transport).toHaveBeenCalledTimes(1);
      const saved = (
        await sql.query(
          "SELECT image_storage_keys,content_history FROM colorverse.classroom_publications WHERE id=$1",
          [assigned],
        )
      ).rows[0];
      expect(saved.image_storage_keys).toEqual(uploads);
      expect(saved.content_history).toMatchObject([
        { imageStorageKeys: ["legacy-a.webp", "legacy-b.webp"] },
      ]);
    } finally {
      vi.unstubAllGlobals();
      await sql.query("ROLLBACK");
    }
  });
});

describe("authorized teacher submission uses the student's existing work pipeline", () => {
  it("scopes recipients, preserves idempotency and originals, and updates student/teacher counts with audit history", async () => {
    const publicationId = randomUUID(),
      requestId = randomUUID(),
      targetPlanet = randomUUID();
    await sql.query(
      "INSERT INTO colorverse.planets(id,owner_enrollment_id,document) VALUES($1,$2,$3)",
      [
        targetPlanet,
        peerEnrollment,
        JSON.stringify({
          color: "#abcdee",
          metadata: { name: "代交验收星球" },
        }),
      ],
    );
    await sql.query(
      "INSERT INTO colorverse.classroom_publications(id,class_id,task_id,definition,target_label,publisher_enrollment_id,request_id) VALUES($1,$2,'T02',$3,'验收学生',$4,$1)",
      [
        publicationId,
        classId,
        JSON.stringify(AssignmentCatalog[1]),
        teacherEnrollment,
      ],
    );
    await sql.query(
      "INSERT INTO colorverse.classroom_recipients(publication_id,enrollment_id) VALUES($1,$2)",
      [publicationId, peerEnrollment],
    );
    await sql.query(
      "INSERT INTO colorverse.learning_task_settings(class_id,task_id,published,require_explanation,allow_peer_review,show_intent_to_peers,revision) VALUES($1,'T02',true,true,true,true,1) ON CONFLICT(class_id,task_id) DO UPDATE SET published=true,require_explanation=true",
      [classId],
    );
    const bytes = new Uint8Array(
      await readFile("apps/web/public/assignments/two-moods.webp"),
    );
    const images = {
      input: () => ({
        transform: () => ({
          output: async () => ({ response: () => new Response(bytes) }),
        }),
      }),
    };
    const storage = vi.fn(async () => new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", storage);
    const client = () => ({
      ...sql,
      connect: async () => {},
      end: async () => {},
    });
    const upload = (
      who = teacher,
      target = peerEnrollment,
      pub = publicationId,
      retry = requestId,
      explanation = true,
      cls = classId,
    ) => {
      const form = new FormData();
      form.set("image", new Blob([bytes], { type: "image/webp" }), "work.webp");
      form.set(
        "metadata",
        JSON.stringify({
          title: "教师代交验收作品",
          description: "学生提供的说明",
          learning: {
            taskId: "T02",
            publicationId: pub,
            customMood: explanation ? "宁静" : "",
            colorRationale: explanation ? "冷暖对照" : "",
          },
        }),
      );
      return handleShowcaseCloud(
        new Request(
          `https://classroom.test/?requestId=${retry}&onBehalfOf=${target}&publicationId=${pub}`,
          { method: "POST", body: form },
        ),
        {
          CLASSROOM_NEXT: "true",
          HYPERDRIVE_WRITER: { connectionString: "test" },
          SUPABASE_SECRET_KEY: "test",
          SUPABASE_URL: "https://test.supabase.co",
          IMAGES: images,
        } as never,
        who,
        cls,
        "works",
        client as never,
      );
    };
    try {
      await expect(upload(student)).rejects.toMatchObject({ status: 403 });
      await expect(upload(teacher, enrollment)).rejects.toMatchObject({
        code: "RECIPIENT_REQUIRED",
      });
      await expect(
        upload(
          teacher,
          peerEnrollment,
          peerAssignment,
          randomUUID(),
          true,
          otherClass,
        ),
      ).rejects.toMatchObject({ status: 403 });
      await expect(
        upload(teacher, peerEnrollment, publicationId, requestId, false),
      ).rejects.toMatchObject({ code: "LEARNING_EXPLANATION_REQUIRED" });
      expect(storage).not.toHaveBeenCalled();
      const result = await (await upload()).json();
      expect(result.created).toBe(true);
      expect(await (await upload()).json()).toMatchObject({
        id: result.id,
        created: false,
      });
      await expect(
        upload(teacher, peerEnrollment, publicationId, randomUUID()),
      ).rejects.toMatchObject({ code: "ALREADY_SUBMITTED" });
      expect(storage).toHaveBeenCalledTimes(2);
      const saved = (
        await sql.query("SELECT * FROM colorverse.showcase_works WHERE id=$1", [
          result.id,
        ])
      ).rows[0];
      expect(saved.planet_id).toBe(targetPlanet);
      expect(saved.original_byte_size).toBe(bytes.length);
      expect(saved.original_storage_key).toContain(peerId + "/");
      expect(saved.submission_history).toEqual([
        expect.objectContaining({
          event: "teacher_submission",
          submittedByEnrollmentId: teacherEnrollment,
          studentEnrollmentId: peerEnrollment,
          publicationId,
        }),
      ]);
      const row = (await publicationRows(sql, classId, publicationId))[0];
      expect(row).toMatchObject({
        workId: result.id,
        status: "pending",
        submittedByTeacher: true,
      });
      const mine = await read(peer);
      expect(
        mine.assignments.find((a) => a.id === publicationId)?.latestWorkId,
      ).toBe(result.id);
      const notices = await classroomNotifications(
        sql,
        { id: teacherEnrollment, role: "teacher" },
        classId,
        true,
      );
      expect(notices.notifications).toContainEqual(
        expect.objectContaining({ workId: result.id, pending: true }),
      );
      const runtime = {
        CLASSROOM_NEXT: "true",
        HYPERDRIVE_WRITER: { connectionString: "test" },
        SUPABASE_SECRET_KEY: "test",
        SUPABASE_URL: "https://test.supabase.co",
        IMAGES: images,
      } as never;
      const editId = randomUUID();
      const edit = (who = peer, revision = 0, rid = editId) => {
        const form = new FormData();
        form.set(
          "image",
          new Blob([bytes], { type: "image/webp" }),
          "replacement.webp",
        );
        form.append(
          "images",
          new Blob([bytes], { type: "image/webp" }),
          "second.webp",
        );
        form.set(
          "metadata",
          JSON.stringify({
            title: "学生修改后的标题",
            description: "修改说明",
            learning: {
              taskId: "T02",
              publicationId,
              customMood: "宁静",
              colorRationale: "重新分析配色",
            },
          }),
        );
        return handleShowcaseCloud(
          new Request(
            `https://classroom.test/?requestId=${rid}&replaceWorkId=${result.id}&revision=${revision}`,
            { method: "POST", body: form },
          ),
          runtime,
          who,
          classId,
          "works",
          client as never,
        );
      };
      await expect(edit(student)).rejects.toMatchObject({ status: 403 });
      await expect(edit(peer, 9)).rejects.toMatchObject({
        code: "WORK_CONFLICT",
      });
      expect(await (await edit()).json()).toMatchObject({
        id: result.id,
        updated: true,
        created: false,
      });
      const changed = (
        await sql.query("SELECT * FROM colorverse.showcase_works WHERE id=$1", [
          result.id,
        ])
      ).rows[0];
      expect(changed).toMatchObject({
        title: "学生修改后的标题",
        revision: 1,
        submission_revision: 1,
        publication_id: publicationId,
      });
      expect(changed.gallery_images).toHaveLength(1);
      expect(
        (await read(peer)).works.find((w) => w.id === result.id)?.canEdit,
      ).toBe(true);
      expect(await (await edit()).json()).toMatchObject({
        id: result.id,
        created: false,
      });
      const visibility = (withdrawn: boolean, revision: number) =>
        handleShowcaseCloud(
          new Request("https://classroom.test/", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ withdrawn, revision }),
          }),
          runtime,
          peer,
          classId,
          `works/${result.id}/visibility`,
          client as never,
        );
      await visibility(true, 1);
      expect(
        (await read(peer)).assignments.find((a) => a.id === publicationId)
          ?.latestWorkId,
      ).toBeNull();
      await visibility(false, 2);
      await showcaseReview(
        sql,
        { id: teacherEnrollment, role: "teacher" },
        classId,
        result.id,
        "POST",
        {
          score: 0,
          comment: "零分也锁定",
          revision: 0,
          submissionRevision: 1,
          requestId: randomUUID(),
        },
        true,
      );
      expect(
        (await read(peer)).works.find((w) => w.id === result.id)?.canEdit,
      ).toBe(false);
      await expect(visibility(true, 3)).rejects.toMatchObject({
        code: "WORK_GRADED",
      });
      await expect(edit(peer, 3, randomUUID())).rejects.toMatchObject({
        code: "WORK_GRADED",
      });
      await expect(edit(peer, 3)).resolves.toBeDefined(); // Replaying a successful request cannot modify content.
      const blocked = await handleShowcaseCloud(
        new Request("https://classroom.test/", { method: "GET" }),
        runtime,
        peer,
        classId,
        `works/${result.id}/content`,
        client as never,
      );
      expect(await blocked.json()).toMatchObject({ locked: true });
      await expect(
        handleShowcaseCloud(
          new Request("https://classroom.test/", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ description: "绕过修改", revision: 3 }),
          }),
          runtime,
          peer,
          classId,
          `works/${result.id}/description`,
          client as never,
        ),
      ).rejects.toMatchObject({ code: "WORK_GRADED" });
    } finally {
      vi.unstubAllGlobals();
      const graded = (
        await sql.query(
          "SELECT 1 FROM colorverse.showcase_reviews WHERE work_id IN (SELECT id FROM colorverse.showcase_works WHERE planet_id=$1)",
          [targetPlanet],
        )
      ).rows.length;
      if (!graded) {
        await sql.query(
          "DELETE FROM colorverse.showcase_works WHERE planet_id=$1",
          [targetPlanet],
        );
        await sql.query("DELETE FROM colorverse.planets WHERE id=$1", [
          targetPlanet,
        ]);
        await sql.query(
          "DELETE FROM colorverse.classroom_recipients WHERE publication_id=$1",
          [publicationId],
        );
        await sql.query(
          "DELETE FROM colorverse.classroom_publications WHERE id=$1",
          [publicationId],
        );
      }
    }
  });
});
