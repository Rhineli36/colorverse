import {
  AssignmentCatalog,
  AssignmentDefinitionSchema,
  type ClassroomNotification,
} from "@colorverse/contracts";
import type { EnrollmentSql } from "./enrollment";
export async function classroomNotifications(
  sql: EnrollmentSql,
  actor: Record<string, unknown>,
  classId: string,
) {
  const tasks = (
    await sql.query(
      "SELECT task_id,revision,updated_at,definition FROM colorverse.learning_task_settings WHERE class_id=$1 AND published=true",
      [classId],
    )
  ).rows;
  const reactions = (
    await sql.query(
      `SELECT i.id,i.kind,i.content,i.created_at,p.id planet_id,i.work_id,u.display_name,w.title,p.document->'metadata'->>'name' planet_name FROM colorverse.classroom_interactions i JOIN colorverse.planets p ON p.id=i.planet_id JOIN colorverse.enrollments owner ON owner.id=p.owner_enrollment_id JOIN colorverse.enrollments sender ON sender.id=i.actor_enrollment_id JOIN colorverse.users u ON u.id=sender.user_id LEFT JOIN colorverse.showcase_works w ON w.id=i.work_id WHERE owner.class_id=$1 AND owner.id=$2 AND i.actor_enrollment_id<>$2 AND sender.status='active' AND (i.work_id IS NULL OR w.withdrawn_at IS NULL) ORDER BY i.created_at DESC LIMIT 100`,
      [classId, actor.id],
    )
  ).rows;
  const notifications: ClassroomNotification[] = [
    ...tasks.map((r) => ({
      id: `assignment:${classId}:${r.task_id}:${r.revision}`,
      kind: "assignment" as const,
      taskId: String(r.task_id),
      assignment: r.definition
        ? AssignmentDefinitionSchema.parse(r.definition)
        : undefined,
      title: `老师发布了作业：${(r.definition as { title?: string } | null)?.title ?? AssignmentCatalog.find((t) => t.id === r.task_id)?.title ?? r.task_id}`,
      createdAt: new Date(r.updated_at as string).toISOString(),
    })),
    ...reactions.map((r) => ({
      id: String(r.id),
      kind: r.kind as "like" | "emoji" | "comment",
      title: `${r.display_name}${r.kind === "like" ? "点赞了" : r.kind === "emoji" ? "回应了" : "留言于"}你的${r.work_id ? "作品" : "星球"}「${r.title ?? r.planet_name}」`,
      content: r.kind === "like" ? "" : String(r.content),
      createdAt: new Date(r.created_at as string).toISOString(),
      planetId: String(r.planet_id),
      workId: r.work_id ? String(r.work_id) : null,
    })),
  ];
  if (["teacher", "assistant"].includes(String(actor.role))) {
    const planets = (
      await sql.query(
        `SELECT p.id,p.document,u.display_name,c.title FROM colorverse.planets p JOIN colorverse.enrollments e ON e.id=p.owner_enrollment_id JOIN colorverse.users u ON u.id=e.user_id JOIN colorverse.classes c ON c.id=e.class_id WHERE e.class_id=$1 AND e.status='active' AND u.status='active' AND p.document->>'createdAt' IS NOT NULL`,
        [classId],
      )
    ).rows;
    for (const p of planets) {
      const doc = p.document as {
        createdAt: string;
        metadata: { name: string };
      };
      notifications.push({
        id: `planet-created:${p.id}`,
        kind: "planet-created",
        title: `${p.display_name}创建了「${doc.metadata.name}」`,
        content: String(p.title),
        createdAt: doc.createdAt,
        planetId: String(p.id),
      });
    }
    const submissions = (
      await sql.query(
        `SELECT w.id,w.title,w.created_at,p.id planet_id,u.display_name,c.title class_title,r.score,r.comment FROM colorverse.showcase_works w JOIN colorverse.planets p ON p.id=w.planet_id JOIN colorverse.enrollments e ON e.id=p.owner_enrollment_id JOIN colorverse.users u ON u.id=e.user_id JOIN colorverse.classes c ON c.id=e.class_id LEFT JOIN LATERAL (SELECT score,comment FROM colorverse.showcase_reviews WHERE work_id=w.id AND source='teacher' ORDER BY revision DESC LIMIT 1) r ON true WHERE e.class_id=$1 AND e.status='active' AND u.status='active' AND w.withdrawn_at IS NULL ORDER BY w.created_at DESC`,
        [classId],
      )
    ).rows;
    for (const w of submissions)
      notifications.push({
        id: `submission:${w.id}`,
        kind: "submission",
        title: `${w.display_name} · ${w.title}`,
        content: String(w.class_title),
        createdAt: new Date(w.created_at as string).toISOString(),
        planetId: String(w.planet_id),
        workId: String(w.id),
        pending: w.score == null && !String(w.comment ?? "").trim(),
      });
  }
  const read = (
    await sql.query(
      "SELECT notice_id FROM colorverse.classroom_notice_reads WHERE enrollment_id=$1",
      [actor.id],
    )
  ).rows;
  return {
    readIds: read.map((r) => String(r.notice_id)),
    notifications: notifications.sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    ),
  };
}
