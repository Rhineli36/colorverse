import { z } from "zod";
import {
  AssignmentCatalog,
  AssignmentDefinitionSchema,
  PublicationInput,
  type SubmissionRow,
  type Publication,
  type RosterStudent,
} from "@colorverse/contracts";
import { classroomActor, ClassroomFailure } from "./classroom";
import type { EnrollmentSql } from "./enrollment";
import type { VerifiedIdentity } from "./auth";
import { learningTasks } from "./learning";

export async function classroomScope(sql: EnrollmentSql, classId: string) {
  z.uuid().parse(classId);
  if (
    (
      await sql.query(
        `SELECT 1 FROM colorverse.classes c JOIN colorverse.isolated_account_courses i ON i.course_id=c.course_id WHERE c.id=$1`,
        [classId],
      )
    ).rows.length
  )
    throw new ClassroomFailure(
      403,
      "REVIEW_FROZEN",
      "参赛评审班级请使用原评审入口。",
    );
}
export async function publicationRows(
  sql: EnrollmentSql,
  classId: string,
  publicationId: string,
): Promise<SubmissionRow[]> {
  const rows = (
    await sql.query(
      `SELECT e.id enrollment_id,u.id user_id,
    coalesce(nullif(a.real_name,''),nullif(u.real_name,''),u.display_name) name,
    coalesce(a.student_number,u.student_number,'') student_number,p.id planet_id,
    w.id work_id,w.title,w.created_at,r.score::float8 score,r.comment,r.revision,
    EXISTS(SELECT 1 FROM colorverse.showcase_works old JOIN colorverse.showcase_reviews oldr ON oldr.work_id=old.id AND oldr.source='teacher'
      WHERE old.publication_id=$1 AND old.planet_id=p.id AND ((old.id<>w.id AND old.created_at<=w.created_at) OR (old.id=w.id AND oldr.submission_revision<>w.submission_revision))) updated
    FROM colorverse.classroom_recipients cr JOIN colorverse.enrollments e ON e.id=cr.enrollment_id
    JOIN colorverse.users u ON u.id=e.user_id JOIN colorverse.classes c ON c.id=e.class_id
    LEFT JOIN colorverse.student_accounts a ON a.user_id=u.id AND a.course_id=c.course_id
    LEFT JOIN colorverse.planets p ON p.owner_enrollment_id=e.id
    LEFT JOIN LATERAL(SELECT * FROM colorverse.showcase_works WHERE publication_id=$1 AND planet_id=p.id AND withdrawn_at IS NULL ORDER BY created_at DESC,id DESC LIMIT 1) w ON true
    LEFT JOIN LATERAL(SELECT * FROM colorverse.showcase_reviews WHERE work_id=w.id AND source='teacher' AND submission_revision=w.submission_revision ORDER BY revision DESC LIMIT 1) r ON true
    WHERE cr.publication_id=$1 AND e.class_id=$2 ORDER BY coalesce(a.student_number,u.student_number,''),u.id`,
      [publicationId, classId],
    )
  ).rows;
  return rows.map((r) => ({
    enrollmentId: String(r.enrollment_id),
    userId: String(r.user_id),
    name: String(r.name),
    studentNumber: String(r.student_number),
    planetId: r.planet_id ? String(r.planet_id) : null,
    workId: r.work_id ? String(r.work_id) : null,
    title: r.title ? String(r.title) : null,
    submittedAt: r.created_at
      ? new Date(r.created_at as string).toISOString()
      : null,
    score: r.score == null ? null : Number(r.score),
    comment: String(r.comment ?? ""),
    reviewRevision: Number(r.revision ?? 0),
    status: !r.work_id ? "missing" : r.revision ? "reviewed" : "pending",
    updated: Boolean(r.updated) && !r.revision,
  }));
}
export async function publications(
  sql: EnrollmentSql,
  classId: string,
): Promise<Publication[]> {
  const rows = (
    await sql.query(
      `SELECT * FROM colorverse.classroom_publications WHERE class_id=$1 ORDER BY published_at DESC,id DESC`,
      [classId],
    )
  ).rows;
  return Promise.all(
    rows.map(async (p) => {
      const all = await publicationRows(sql, classId, String(p.id));
      const submitted = all.filter((s) => s.status !== "missing").length,
        reviewed = all.filter((s) => s.status === "reviewed").length;
      return {
        id: String(p.id),
        taskId: String(p.task_id),
        definition: AssignmentDefinitionSchema.parse(p.definition),
        targetLabel: String(p.target_label),
        dueAt: p.due_at ? new Date(p.due_at as string).toISOString() : null,
        publishedAt: new Date(p.published_at as string).toISOString(),
        expected: all.length,
        submitted,
        missing: all.length - submitted,
        pending: submitted - reviewed,
        reviewed,
      };
    }),
  );
}
export async function classroomRoster(
  sql: EnrollmentSql,
  classId: string,
): Promise<RosterStudent[]> {
  const students = (
    await sql.query(
      `SELECT e.id,u.id user_id,coalesce(nullif(a.real_name,''),nullif(u.real_name,''),u.display_name) name,
    coalesce(a.student_number,u.student_number,'') student_number,p.id planet_id,p.document->'metadata'->>'name' planet_name,
    l.user_id IS NOT NULL logged_in,coalesce(a.activated_at IS NOT NULL,true) activated,coalesce(a.must_change_password,false) must_change_password
    FROM colorverse.enrollments e JOIN colorverse.users u ON u.id=e.user_id JOIN colorverse.classes c ON c.id=e.class_id
    LEFT JOIN colorverse.student_accounts a ON a.user_id=u.id AND a.course_id=c.course_id
    LEFT JOIN colorverse.classroom_login_history l ON l.user_id=u.id LEFT JOIN colorverse.planets p ON p.owner_enrollment_id=e.id
    WHERE e.class_id=$1 AND e.role='student' AND e.status='active' ORDER BY coalesce(a.student_number,u.student_number,''),u.id`,
      [classId],
    )
  ).rows;
  const counts = (
    await sql.query(
      `SELECT cr.enrollment_id,cp.id FROM colorverse.classroom_recipients cr JOIN colorverse.classroom_publications cp ON cp.id=cr.publication_id WHERE cp.class_id=$1`,
      [classId],
    )
  ).rows;
  const submissions = (
    await Promise.all(
      [...new Set(counts.map((r) => String(r.id)))].map((id) =>
        publicationRows(sql, classId, id),
      ),
    )
  ).flat();
  return students.map((s) => ({
    enrollmentId: String(s.id),
    userId: String(s.user_id),
    name: String(s.name),
    studentNumber: String(s.student_number),
    planetId: s.planet_id ? String(s.planet_id) : null,
    planetName: s.planet_name ? String(s.planet_name) : null,
    loggedIn: Boolean(s.logged_in),
    activated: Boolean(s.activated),
    mustChangePassword: Boolean(s.must_change_password),
    expected: counts.filter((r) => r.enrollment_id === s.id).length,
    submitted: submissions.filter(
      (r) => r.enrollmentId === s.id && r.status !== "missing",
    ).length,
    pending: submissions.filter(
      (r) => r.enrollmentId === s.id && r.status === "pending",
    ).length,
  }));
}
export async function publishToRoster(
  sql: EnrollmentSql,
  actor: Record<string, unknown>,
  classId: string,
  body: unknown,
) {
  const v = PublicationInput.parse(body);
  const old = (
    await sql.query(
      "SELECT id FROM colorverse.classroom_publications WHERE class_id=$1 AND request_id=$2",
      [classId, v.requestId],
    )
  ).rows[0];
  if (old) return { id: String(old.id), created: false };
  const targets = [...new Set(v.enrollmentIds)];
  const eligible = (
    await sql.query(
      `SELECT id FROM colorverse.enrollments WHERE class_id=$1 AND role='student' AND status='active' AND id=ANY($2::uuid[])`,
      [classId, targets],
    )
  ).rows;
  if (eligible.length !== targets.length)
    throw new ClassroomFailure(
      400,
      "INVALID_RECIPIENTS",
      "发布对象包含不属于本班的学生。",
    );
  const task = (await learningTasks(sql, actor, classId, "GET")).tasks.find(
    (t) => t.taskId === v.taskId,
  );
  if (!task) throw new ClassroomFailure(404, "TASK_NOT_FOUND", "作业不存在。");
  const definition =
    task.definition ?? AssignmentCatalog.find((t) => t.id === v.taskId);
  if (!definition)
    throw new ClassroomFailure(404, "TASK_NOT_FOUND", "作业说明不存在。");
  await learningTasks(sql, actor, classId, "PUT", { ...task, published: true });
  const id = crypto.randomUUID();
  await sql.query(
    "INSERT INTO colorverse.classroom_publications(id,class_id,task_id,definition,target_label,due_at,publisher_enrollment_id,request_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
    [
      id,
      classId,
      v.taskId,
      JSON.stringify(definition),
      `${actor.title} · ${targets.length} 人`,
      v.dueAt,
      actor.id,
      v.requestId,
    ],
  );
  for (const eid of targets)
    await sql.query(
      "INSERT INTO colorverse.classroom_recipients(publication_id,enrollment_id) VALUES($1,$2)",
      [id, eid],
    );
  return { id, created: true };
}
export async function managementAction(
  sql: EnrollmentSql,
  identity: VerifiedIdentity,
  classId: string,
  resource: string,
  method: string,
  body?: unknown,
) {
  await classroomScope(sql, classId);
  const actor = await classroomActor(sql, identity, classId);
  const staff = ["teacher", "assistant"].includes(String(actor.role));
  if (resource === "publications" && method === "GET") {
    const all = await publications(sql, classId);
    if (staff) return { publications: all };
    const mine = (
      await sql.query(
        "SELECT publication_id FROM colorverse.classroom_recipients WHERE enrollment_id=$1",
        [actor.id],
      )
    ).rows.map((r) => r.publication_id);
    return {
      publications: all
        .filter((p) => mine.includes(p.id))
        .map((p) => ({
          id: p.id,
          taskId: p.taskId,
          definition: p.definition,
          dueAt: p.dueAt,
          publishedAt: p.publishedAt,
        })),
    };
  }
  if (!staff)
    throw new ClassroomFailure(
      403,
      "TEACHER_REQUIRED",
      "仅本班教师可查看和管理名单与提交。",
    );
  if (resource === "publications" && method === "POST")
    return publishToRoster(sql, actor, classId, body);
  if (resource === "roster" && method === "GET")
    return { students: await classroomRoster(sql, classId) };
  const match = /^publications\/([a-f0-9-]{36})(?:\/(recipients|link))?$/.exec(
    resource,
  );
  if (match) {
    const p = (await publications(sql, classId)).find((p) => p.id === match[1]);
    if (!p)
      throw new ClassroomFailure(
        404,
        "PUBLICATION_NOT_FOUND",
        "作业不存在或已不可访问。",
      );
    if (method === "GET" && !match[2])
      return {
        publication: p,
        students: await publicationRows(sql, classId, p.id),
      };
    if (method === "POST" && match[2] === "recipients") {
      const { enrollmentIds } = z
        .object({ enrollmentIds: z.array(z.uuid()).max(1000) })
        .parse(body);
      for (const id of [...new Set(enrollmentIds)]) {
        const eligible = (
          await sql.query(
            "SELECT id FROM colorverse.enrollments WHERE id=$1 AND class_id=$2 AND role='student' AND status='active'",
            [id, classId],
          )
        ).rows;
        if (!eligible.length)
          throw new ClassroomFailure(
            400,
            "INVALID_RECIPIENTS",
            "补发对象不属于本班。",
          );
        await sql.query(
          "INSERT INTO colorverse.classroom_recipients(publication_id,enrollment_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
          [p.id, id],
        );
      }
      return { saved: true };
    }
    if (method === "POST" && match[2] === "link") {
      const { workId } = z.object({ workId: z.uuid() }).parse(body);
      const result = await sql.query(
        `UPDATE colorverse.showcase_works w SET publication_id=$1,learning_context=coalesce(w.learning_context,'{}'::jsonb)||jsonb_build_object('publicationId',$1::text,'taskId',$3::text) FROM colorverse.planets p JOIN colorverse.classroom_recipients cr ON cr.enrollment_id=p.owner_enrollment_id AND cr.publication_id=$1 WHERE w.id=$2 AND w.planet_id=p.id AND w.publication_id IS NULL RETURNING w.id`,
        [p.id, workId, p.taskId],
      );
      if (!result.rows.length)
        throw new ClassroomFailure(
          409,
          "LINK_CONFLICT",
          "作品不在应交名单内，或已有作业关联。",
        );
      return { saved: true };
    }
  }
  if (resource === "unlinked" && method === "GET")
    return {
      works: (
        await sql.query(
          `SELECT w.id,w.title,w.learning_context,u.display_name,p.owner_enrollment_id FROM colorverse.showcase_works w JOIN colorverse.planets p ON p.id=w.planet_id JOIN colorverse.enrollments e ON e.id=p.owner_enrollment_id JOIN colorverse.users u ON u.id=e.user_id WHERE e.class_id=$1 AND w.publication_id IS NULL AND w.learning_context->>'taskId' IS NOT NULL AND w.withdrawn_at IS NULL ORDER BY w.created_at DESC`,
          [classId],
        )
      ).rows,
    };
  throw new ClassroomFailure(405, "METHOD_NOT_ALLOWED", "请求方式无效。");
}
