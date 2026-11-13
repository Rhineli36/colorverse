import { ClassroomFailure } from "./classroom";
import type { EnrollmentSql } from "./enrollment";
/** Use the same work row lock as grading, then check all saved teacher scores. */
export async function studentWorkLock(
  sql: EnrollmentSql,
  actor: Record<string, unknown>,
  classId: string,
  workId: string,
  inspect = false,
) {
  const row = (
    await sql.query(
      `SELECT w.* FROM colorverse.showcase_works w JOIN colorverse.planets p ON p.id=w.planet_id JOIN colorverse.enrollments e ON e.id=p.owner_enrollment_id WHERE w.id=$1 AND e.class_id=$2 AND e.id=$3 AND e.role='student' AND e.status='active' FOR UPDATE OF w`,
      [workId, classId, actor.id],
    )
  ).rows[0];
  if (!row || actor.role !== "student")
    throw new ClassroomFailure(
      403,
      "WORK_FORBIDDEN",
      "只能修改或撤回自己的作业",
    );
  const scored = Boolean(
    (
      await sql.query(
        "SELECT 1 FROM colorverse.showcase_reviews WHERE work_id=$1 AND source='teacher' AND score IS NOT NULL LIMIT 1",
        [workId],
      )
    ).rows.length,
  );
  if (!inspect && scored)
    throw new ClassroomFailure(
      409,
      "WORK_GRADED",
      "教师已评分，不能再修改或撤回这份作业",
    );
  return { ...row, scored } as Record<string, unknown> & { scored: boolean };
}
