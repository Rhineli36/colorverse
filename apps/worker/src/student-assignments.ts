import {
  StudentAssignmentsSchema,
  type StudentWork,
} from "@colorverse/contracts";
import type { EnrollmentSql } from "./enrollment";

/** Only call after classroomActor has verified this student's active membership. */
export async function studentAssignments(
  sql: EnrollmentSql,
  classId: string,
  enrollmentId: string,
) {
  const assignments = (
    await sql.query(
      `SELECT cp.id,cp.task_id,cp.definition,cp.due_at,cp.published_at
       FROM colorverse.classroom_publications cp
       JOIN colorverse.classroom_recipients cr ON cr.publication_id=cp.id
       WHERE cp.class_id=$1 AND cr.enrollment_id=$2
       ORDER BY cp.published_at DESC,cp.id DESC`,
      [classId, enrollmentId],
    )
  ).rows;
  const rows = (
    await sql.query(
      `SELECT p.id planet_id,w.id,w.publication_id,w.learning_context->>'taskId' task_id,
       EXISTS(SELECT 1 FROM colorverse.showcase_reviews locked WHERE locked.work_id=w.id AND locked.source='teacher' AND locked.score IS NOT NULL) scored,
       w.title,w.created_at,w.submission_revision,w.withdrawn_at,r.score::float8 score,r.comment,r.revision,
       EXISTS(SELECT 1 FROM colorverse.showcase_works old
         JOIN colorverse.showcase_reviews oldr ON oldr.work_id=old.id AND oldr.source='teacher'
         WHERE old.planet_id=p.id AND
           ((old.id=w.id AND oldr.submission_revision<>w.submission_revision) OR
            (w.publication_id IS NOT NULL AND old.publication_id=w.publication_id
             AND old.id<>w.id AND old.created_at<=w.created_at))) updated
       FROM colorverse.planets p
       JOIN colorverse.enrollments e ON e.id=p.owner_enrollment_id
       LEFT JOIN colorverse.showcase_works w ON w.planet_id=p.id
       LEFT JOIN LATERAL(SELECT * FROM colorverse.showcase_reviews
         WHERE work_id=w.id AND source='teacher' AND submission_revision=w.submission_revision
         ORDER BY revision DESC LIMIT 1) r ON true
       WHERE e.class_id=$1 AND e.id=$2
       ORDER BY w.created_at DESC,w.id DESC`,
      [classId, enrollmentId],
    )
  ).rows;
  const works: StudentWork[] = rows
    .filter((r) => r.id)
    .map((r) => ({
      canEdit: !r.scored && r.withdrawn_at == null,
      id: String(r.id),
      planetId: String(r.planet_id),
      publicationId: r.publication_id ? String(r.publication_id) : null,
      taskId: r.task_id ? String(r.task_id) : null,
      title: String(r.title),
      submittedAt: new Date(r.created_at as string).toISOString(),
      status: r.revision ? "reviewed" : "pending",
      updated: Boolean(r.updated) && !r.revision,
      withdrawn: r.withdrawn_at != null,
      score: r.score == null ? null : Number(r.score),
      comment: String(r.comment ?? ""),
      submissionRevision: Number(r.submission_revision ?? 0),
    }));
  return StudentAssignmentsSchema.parse({
    planetId: rows[0]?.planet_id ?? null,
    assignments: assignments.map((a) => ({
      id: String(a.id),
      taskId: String(a.task_id),
      definition: a.definition,
      dueAt: a.due_at ? new Date(a.due_at as string).toISOString() : null,
      publishedAt: new Date(a.published_at as string).toISOString(),
      latestWorkId:
        works.find((w) => w.publicationId === a.id && !w.withdrawn)?.id ?? null,
    })),
    works,
  });
}
