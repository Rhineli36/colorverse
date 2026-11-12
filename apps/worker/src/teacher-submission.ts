import { z } from "zod";
import type { EnrollmentSql } from "./enrollment";
import { ClassroomFailure } from "./classroom";
import { classroomScope } from "./classroom-management";

/** Authorize a teacher's upload without replacing the authenticated actor. */
export async function teacherSubmissionTarget(
  sql: EnrollmentSql,
  actor: Record<string, unknown>,
  classId: string,
  url: URL,
) {
  if (actor.role !== "teacher")
    throw new ClassroomFailure(
      403,
      "TEACHER_REQUIRED",
      "只有本班教师可以代交作业",
    );
  await classroomScope(sql, classId);
  const enrollmentId = z.uuid().parse(url.searchParams.get("onBehalfOf"));
  const publicationId = z.uuid().parse(url.searchParams.get("publicationId"));
  const target = (
    await sql.query(
      `SELECT e.id,e.user_id,e.role,u.auth_subject,cp.task_id
       FROM colorverse.enrollments e JOIN colorverse.users u ON u.id=e.user_id
       JOIN colorverse.classroom_recipients cr ON cr.enrollment_id=e.id
       JOIN colorverse.classroom_publications cp ON cp.id=cr.publication_id
       WHERE e.id=$1 AND e.class_id=$2 AND cp.class_id=$2 AND cp.id=$3
       AND e.role='student' AND e.status='active' AND u.status='active'`,
      [enrollmentId, classId, publicationId],
    )
  ).rows[0];
  if (!target)
    throw new ClassroomFailure(
      403,
      "RECIPIENT_REQUIRED",
      "该学生不属于本班或不在这份作业的应交名单中",
    );
  return { ...target, publicationId } as Record<string, unknown>;
}
