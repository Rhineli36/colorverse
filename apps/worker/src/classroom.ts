import { z } from "zod";
import type { VerifiedIdentity } from "./auth";
import type { EnrollmentSql } from "./enrollment";

export class ClassroomFailure extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export async function classroomActor(
  sql: EnrollmentSql,
  identity: VerifiedIdentity,
  classId: string,
) {
  if (!z.uuid().safeParse(classId).success)
    throw new ClassroomFailure(400, "INVALID_CLASS", "班级编号无效");
  const result = await sql.query(
    `SELECT e.id, e.user_id, e.role, c.title, c.timezone FROM colorverse.enrollments e JOIN colorverse.users u ON u.id=e.user_id JOIN colorverse.classes c ON c.id=e.class_id WHERE u.auth_issuer=$1 AND u.auth_subject=$2 AND u.status='active' AND e.status='active' AND c.archived_at IS NULL AND c.id=$3`,
    [identity.issuer, identity.subject, classId],
  );
  const actor = result.rows[0];
  if (!actor)
    throw new ClassroomFailure(
      403,
      "CLASS_FORBIDDEN",
      "你没有这个班级的访问权限",
    );
  return actor;
}
export async function classroomOverview(
  sql: EnrollmentSql,
  identity: VerifiedIdentity,
  classId: string,
) {
  const actor = await classroomActor(sql, identity, classId);
  if (actor.role !== "teacher" && actor.role !== "assistant")
    throw new ClassroomFailure(
      403,
      "TEACHER_REQUIRED",
      "仅教师和助教可以查看班级统计",
    );
  // Aggregate each source before joining: multiple works and reactions must not multiply counts.
  const result = await sql.query(
    `WITH week AS (SELECT date_trunc('week', now() AT TIME ZONE $2) AT TIME ZONE $2 AS start),
    latest_reviews AS (SELECT DISTINCT ON(work_id) work_id,source,score FROM colorverse.showcase_reviews ORDER BY work_id,revision DESC),
    works AS (SELECT w.planet_id,count(*)::int total,count(*) FILTER(WHERE w.created_at >= (SELECT start FROM week))::int weekly,max(w.created_at) latest,
      count(*) FILTER(WHERE r.source='teacher')::int reviewed,count(*) FILTER(WHERE r.source='demo')::int suggested,
      (round(avg(r.score) FILTER(WHERE r.source='teacher'),2))::float8 average_score
      FROM colorverse.showcase_works w LEFT JOIN latest_reviews r ON r.work_id=w.id WHERE w.withdrawn_at IS NULL GROUP BY w.planet_id),
    submissions AS (SELECT s.enrollment_id,count(v.id)::int total FROM colorverse.submissions s JOIN colorverse.submission_versions v ON v.submission_id=s.id GROUP BY s.enrollment_id),
    sent AS (SELECT actor_enrollment_id,count(*)::int total,count(*) FILTER(WHERE i.created_at >= (SELECT start FROM week))::int weekly FROM colorverse.classroom_interactions i LEFT JOIN colorverse.showcase_works w ON w.id=i.work_id WHERE i.work_id IS NULL OR w.withdrawn_at IS NULL GROUP BY actor_enrollment_id),
    received AS (SELECT i.planet_id,count(*)::int total,count(*) FILTER(WHERE i.created_at >= (SELECT start FROM week))::int weekly FROM colorverse.classroom_interactions i LEFT JOIN colorverse.showcase_works w ON w.id=i.work_id WHERE i.work_id IS NULL OR w.withdrawn_at IS NULL GROUP BY i.planet_id)
    SELECT e.id enrollment_id,u.display_name,u.status account_status,e.status enrollment_status,p.id planet_id,p.document->'metadata'->>'name' planet_name,
      COALESCE(w.total,0)::int showcase_count,COALESCE(w.weekly,0)::int weekly_showcase_count,COALESCE(sub.total,0)::int course_submission_count,
      COALESCE(w.reviewed,0)::int reviewed_showcase_count,COALESCE(w.suggested,0)::int suggested_review_count,w.average_score average_showcase_score,
      COALESCE(s.total,0)::int sent_count,COALESCE(s.weekly,0)::int weekly_sent_count,COALESCE(r.total,0)::int received_count,COALESCE(r.weekly,0)::int weekly_received_count,w.latest last_submission
    FROM colorverse.enrollments e JOIN colorverse.users u ON u.id=e.user_id LEFT JOIN colorverse.planets p ON p.owner_enrollment_id=e.id
    LEFT JOIN works w ON w.planet_id=p.id LEFT JOIN submissions sub ON sub.enrollment_id=e.id LEFT JOIN sent s ON s.actor_enrollment_id=e.id LEFT JOIN received r ON r.planet_id=p.id
    WHERE e.class_id=$1 AND e.role='student' ORDER BY u.display_name,e.id`,
    [classId, String(actor.timezone)],
  );
  return {
    classId,
    title: actor.title,
    timezone: actor.timezone,
    generatedAt: new Date().toISOString(),
    students: result.rows,
  };
}
