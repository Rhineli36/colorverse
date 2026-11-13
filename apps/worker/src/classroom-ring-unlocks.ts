import type { EnrollmentSql } from "./enrollment";

export function gradeRingRules(e: {
  graded: number;
  ninety: number;
  highest: number;
  week: number;
  configured: number;
  jellyfish: boolean;
}) {
  const ids: string[] = [];
  if (e.graded >= 1) ids.push("ring:silver");
  if (e.configured === 3 && e.week === 3) ids.push("ring:gold");
  if (e.ninety >= 1) ids.push("ring:gem");
  if (e.ninety >= 3 || e.highest >= 95) ids.push("ring:enamel");
  if (e.jellyfish) ids.push("ring:jellyfish");
  return ids;
}
/** Current-version latest numerical teacher scores, scoped to active class members. */
export async function awardGradeRings(
  sql: EnrollmentSql,
  classId: string,
  enrollmentId: string | null = null,
) {
  const bindings = (
    await sql.query(
      "SELECT skin_id,task_id FROM colorverse.classroom_skin_bindings WHERE class_id=$1 AND skin_id LIKE 'ring:%'",
      [classId],
    )
  ).rows;
  const week = new Set(
    bindings
      .filter((b) => String(b.skin_id).startsWith("ring:gold:"))
      .map((b) => String(b.task_id)),
  );
  const jelly = bindings.find((b) => b.skin_id === "ring:jellyfish")?.task_id;
  const rows = (
    await sql.query(
      `SELECT e.id enrollment_id,w.id,w.publication_id,pub.task_id,r.score::float8 score
    FROM colorverse.enrollments e JOIN colorverse.users u ON u.id=e.user_id JOIN colorverse.classes c ON c.id=e.class_id
    LEFT JOIN colorverse.planets p ON p.owner_enrollment_id=e.id
    LEFT JOIN colorverse.showcase_works w ON w.planet_id=p.id AND w.withdrawn_at IS NULL
    LEFT JOIN colorverse.classroom_publications pub ON pub.id=w.publication_id AND pub.class_id=e.class_id
    LEFT JOIN LATERAL(SELECT score FROM colorverse.showcase_reviews WHERE work_id=w.id AND source='teacher' AND submission_revision=w.submission_revision ORDER BY revision DESC LIMIT 1) r ON true
    WHERE e.class_id=$1 AND ($2::uuid IS NULL OR e.id=$2) AND e.role='student' AND e.status='active' AND u.status='active' AND c.archived_at IS NULL
    AND (w.publication_id IS NULL OR EXISTS(SELECT 1 FROM colorverse.classroom_recipients cr WHERE cr.publication_id=w.publication_id AND cr.enrollment_id=e.id))`,
      [classId, enrollmentId],
    )
  ).rows;
  const groups = new Map<string, typeof rows>();
  for (const row of rows) {
    const id = String(row.enrollment_id);
    groups.set(id, [...(groups.get(id) ?? []), row]);
  }
  const progress: Record<
    string,
    Record<string, { current: number; target: number; detail: string }>
  > = {};
  for (const [id, works] of groups) {
    const scores = new Map<string, number>(),
      done = new Set<string>();
    let jellyDone = false;
    for (const w of works) {
      if (w.score == null) continue;
      const key = String(w.publication_id ?? w.id);
      scores.set(key, Math.max(scores.get(key) ?? -1, Number(w.score)));
      if (week.has(String(w.task_id))) done.add(String(w.task_id));
      if (jelly && w.task_id === jelly) jellyDone = true;
    }
    const evidence = {
      graded: scores.size,
      ninety: [...scores.values()].filter((n) => n >= 90).length,
      highest: Math.max(0, ...scores.values()),
      week: done.size,
      configured: week.size,
      jellyfish: jellyDone,
    };
    for (const skin of gradeRingRules(evidence))
      await sql.query(
        "INSERT INTO colorverse.classroom_skin_unlocks(enrollment_id,skin_id,evidence) VALUES($1,$2,$3) ON CONFLICT(enrollment_id,skin_id) DO NOTHING",
        [id, skin, JSON.stringify(evidence)],
      );
    const p = (current: number, target: number, detail: string) => ({
      current,
      target,
      detail,
    });
    progress[id] = {
      "ring:silver": p(evidence.graded, 1, "已提交并获教师评分的不同作业"),
      "ring:gold": p(
        evidence.week,
        3,
        week.size === 3
          ? "第二周三份指定作业，均需教师评分"
          : "第二周指定作业尚未完成绑定",
      ),
      "ring:gem": p(evidence.ninety, 1, "不同作业达到90分"),
      "ring:enamel": p(
        evidence.highest >= 95 ? 3 : evidence.ninety,
        3,
        `90分作业 ${evidence.ninety}/3 · 单次最高 ${evidence.highest}/95分`,
      ),
      "ring:jellyfish": p(
        Number(jellyDone),
        1,
        jelly ? "第二周深海水母作业已提交并获教师评分" : "指定水母作业尚未绑定",
      ),
    };
  }
  return progress;
}
