import type { EnrollmentSql } from "./enrollment";
import {
  eligibleCountSkins,
  type SkinCountEvidence,
} from "./classroom-skin-rules";

async function skinEvidenceRows(
  sql: EnrollmentSql,
  classId: string,
  enrollmentId: string | null,
) {
  const row = (
    await sql.query(
      `
    SELECT e.id enrollment_id,p.document,
      (SELECT count(*)::int FROM (
        SELECT i.kind,i.planet_id,i.work_id,
          CASE WHEN i.kind='comment' THEN btrim(i.content) ELSE '' END signature
        FROM colorverse.classroom_interactions i
        JOIN colorverse.planets target ON target.id=i.planet_id
        JOIN colorverse.enrollments recipient ON recipient.id=target.owner_enrollment_id
        JOIN colorverse.users recipient_user ON recipient_user.id=recipient.user_id
        LEFT JOIN colorverse.showcase_works w ON w.id=i.work_id AND w.planet_id=i.planet_id
        WHERE i.actor_enrollment_id=e.id AND recipient.id<>e.id
          AND recipient.class_id=e.class_id AND recipient.status='active' AND recipient_user.status='active'
          AND i.kind IN ('like','emoji','comment') AND (i.kind<>'comment' OR length(btrim(i.content))>0)
          AND (i.work_id IS NULL OR (w.id IS NOT NULL AND w.withdrawn_at IS NULL))
        GROUP BY i.kind,i.planet_id,i.work_id,signature
      ) valid_sent) interactions,
      (SELECT count(*)::int FROM (
        SELECT DISTINCT i.actor_enrollment_id,i.planet_id,i.work_id
        FROM colorverse.classroom_interactions i
        JOIN colorverse.enrollments sender ON sender.id=i.actor_enrollment_id
        JOIN colorverse.users sender_user ON sender_user.id=sender.user_id
        LEFT JOIN colorverse.showcase_works w ON w.id=i.work_id AND w.planet_id=i.planet_id
        WHERE i.planet_id=p.id AND i.kind='like' AND sender.id<>e.id
          AND sender.class_id=e.class_id AND sender.status='active' AND sender_user.status='active'
          AND (i.work_id IS NULL OR (w.id IS NOT NULL AND w.withdrawn_at IS NULL))
      ) valid_likes) received_likes,
      (SELECT count(DISTINCT pub.task_id)::int FROM colorverse.showcase_works w
        JOIN colorverse.classroom_publications pub ON pub.id=w.publication_id AND pub.class_id=e.class_id
        JOIN colorverse.classroom_recipients recipient ON recipient.publication_id=pub.id AND recipient.enrollment_id=e.id
        WHERE w.planet_id=p.id AND w.withdrawn_at IS NULL) submitted_assignments
    FROM colorverse.enrollments e JOIN colorverse.users u ON u.id=e.user_id
    JOIN colorverse.classes c ON c.id=e.class_id
    LEFT JOIN colorverse.planets p ON p.owner_enrollment_id=e.id
    WHERE ($1::uuid IS NULL OR e.id=$1) AND e.class_id=$2 AND e.role='student' AND e.status='active'
      AND u.status='active' AND c.archived_at IS NULL`,
      [enrollmentId, classId],
    )
  ).rows;
  return row;
}

function decodeEvidence(row: Record<string, unknown>): SkinCountEvidence {
  const media = (
    row.document as {
      media?: Record<string, { id?: string; key?: string; bytes?: number }>;
    } | null
  )?.media;
  const uploaded = (kind: string) =>
    Boolean(
      media?.[kind]?.id && media[kind].key && Number(media[kind].bytes) > 0,
    );
  return {
    exteriorUploaded: uploaded("exterior"),
    interiorUploaded: uploaded("interior"),
    interactions: Number(row.interactions),
    receivedLikes: Number(row.received_likes),
    submittedAssignments: Number(row.submitted_assignments),
  };
}

export async function skinCountEvidence(
  sql: EnrollmentSql,
  classId: string,
  enrollmentId: string,
): Promise<SkinCountEvidence | null> {
  const row = (await skinEvidenceRows(sql, classId, enrollmentId))[0];
  return row ? decodeEvidence(row) : null;
}

/** Read-only batch for the teacher roster; qualification rules remain shared. */
export async function classroomInteractionCounts(
  sql: EnrollmentSql,
  classId: string,
) {
  const rows = await skinEvidenceRows(sql, classId, null);
  return new Map(
    rows.map((row) => [String(row.enrollment_id), Number(row.interactions)]),
  );
}

/** Caller owns a classroom transaction. Locks are sorted across affected students
 * so reciprocal likes cannot deadlock their eligibility updates. */
export async function awardCountSkins(
  sql: EnrollmentSql,
  classId: string,
  enrollmentIds: string[],
) {
  const result = new Map<string, SkinCountEvidence>();
  for (const id of [...new Set(enrollmentIds)].sort()) {
    await sql.query(
      "SELECT pg_advisory_xact_lock(hashtextextended($1,7301961))",
      [id],
    );
    const evidence = await skinCountEvidence(sql, classId, id);
    if (!evidence) continue;
    result.set(id, evidence);
    for (const skin of eligibleCountSkins(evidence))
      await sql.query(
        `
      INSERT INTO colorverse.classroom_skin_unlocks(enrollment_id,skin_id,evidence)
      VALUES($1,$2,$3) ON CONFLICT(enrollment_id,skin_id) DO NOTHING`,
        [id, skin, JSON.stringify(evidence)],
      );
  }
  return result;
}

export function skinCountProgress(
  e?: SkinCountEvidence,
): Record<string, { current: number; target: number; detail: string }> {
  if (!e) return {};
  const progress = (current: number, target: number, detail: string) => ({
    current,
    target,
    detail,
  });
  return {
    silver: progress(
      Number(e.exteriorUploaded) + Number(e.interiorUploaded),
      2,
      `外观${e.exteriorUploaded ? "已上传" : "未上传"} · 内部背景${e.interiorUploaded ? "已上传" : "未上传"}`,
    ),
    gold: progress(e.interactions, 20, "向其他同学发出的有效点赞、表情和留言"),
    sapphire: progress(
      e.receivedLikes,
      10,
      "自己的星球和有效作品收到的点赞合计",
    ),
    emerald: progress(
      e.submittedAssignments,
      5,
      "不同课程作业的有效提交，重复上传不累加",
    ),
    glass: progress(
      e.submittedAssignments,
      10,
      "不同课程作业的有效提交，重复上传不累加",
    ),
    floral: progress(
      e.interactions,
      50,
      "向其他同学发出的有效点赞、表情和留言",
    ),
  };
}
