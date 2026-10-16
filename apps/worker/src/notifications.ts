import {
  AssignmentCatalog,
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
      "SELECT task_id,revision,updated_at FROM colorverse.learning_task_settings WHERE class_id=$1 AND published=true",
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
      title: `老师发布了作业：${AssignmentCatalog.find((t) => t.id === r.task_id)?.title ?? r.task_id}`,
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
  return {
    notifications: notifications.sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    ),
  };
}
