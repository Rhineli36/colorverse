import {
  LearningTaskIds,
  LearningTaskSettingSchema,
  WorkLearningInput,
  WorkLearningSchema,
} from "@colorverse/contracts";
import { ClassroomFailure } from "./classroom";
import type { EnrollmentSql } from "./enrollment";
export async function learningTasks(
  sql: EnrollmentSql,
  actor: Record<string, unknown>,
  classId: string,
  method: string,
  body?: unknown,
) {
  if (method === "PUT") {
    if (!["teacher", "assistant"].includes(String(actor.role)))
      throw new ClassroomFailure(
        403,
        "TEACHER_REQUIRED",
        "只有本班教师可以设置教学模板",
      );
    const v = LearningTaskSettingSchema.parse(body);
    await sql.query(
      "SELECT pg_advisory_xact_lock(hashtextextended($1,7301948))",
      [classId],
    );
    const row = (
      await sql.query(
        "SELECT revision FROM colorverse.learning_task_settings WHERE class_id=$1 AND task_id=$2",
        [classId, v.taskId],
      )
    ).rows[0];
    if ((row?.revision ?? 0) !== v.revision)
      throw new ClassroomFailure(
        409,
        "TASK_CONFLICT",
        "任务设置已经变化，请刷新后修改",
      );
    await sql.query(
      `INSERT INTO colorverse.learning_task_settings(class_id,task_id,published,require_explanation,allow_peer_review,show_intent_to_peers,revision) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(class_id,task_id) DO UPDATE SET published=EXCLUDED.published,require_explanation=EXCLUDED.require_explanation,allow_peer_review=EXCLUDED.allow_peer_review,show_intent_to_peers=EXCLUDED.show_intent_to_peers,revision=EXCLUDED.revision,updated_at=now()`,
      [
        classId,
        v.taskId,
        v.published,
        v.requireExplanation,
        v.allowPeerReview,
        v.showIntentToPeers,
        v.revision + 1,
      ],
    );
  } else if (method !== "GET")
    throw new ClassroomFailure(405, "METHOD_NOT_ALLOWED", "请求方式无效");
  const rows = (
    await sql.query(
      `SELECT task_id "taskId",published,require_explanation "requireExplanation",allow_peer_review "allowPeerReview",show_intent_to_peers "showIntentToPeers",revision FROM colorverse.learning_task_settings WHERE class_id=$1`,
      [classId],
    )
  ).rows;
  return {
    tasks: LearningTaskIds.map(
      (taskId) =>
        rows.find((r) => r.taskId === taskId) ?? {
          taskId,
          published: false,
          requireExplanation: true,
          allowPeerReview: true,
          showIntentToPeers: true,
          revision: 0,
        },
    ),
  };
}
export async function validateWorkLearning(
  sql: EnrollmentSql,
  actor: Record<string, unknown>,
  classId: string,
  input: unknown,
) {
  if (input == null) return null;
  const v = WorkLearningInput.parse(input);
  let policy = {
    requireExplanation: false,
    allowPeerReview: true,
    showIntentToPeers: true,
  };
  if (v.taskId) {
    const task = (await learningTasks(sql, actor, classId, "GET")).tasks.find(
      (t) => t.taskId === v.taskId,
    );
    if (!task?.published)
      throw new ClassroomFailure(
        409,
        "TASK_UNAVAILABLE",
        "此教学模板尚未启用或已关闭，请重新选择",
      );
    policy = {
      requireExplanation: task.requireExplanation as boolean,
      allowPeerReview: task.allowPeerReview as boolean,
      showIntentToPeers: task.showIntentToPeers as boolean,
    };
    if (
      policy.requireExplanation &&
      (!(v.intendedMoods.length || v.customMood) || !v.colorRationale)
    )
      throw new ClassroomFailure(
        400,
        "LEARNING_EXPLANATION_REQUIRED",
        "请填写目标氛围和配色理由，再提交课堂任务",
      );
  }
  if (v.comparisonGroupId) {
    await sql.query(
      "SELECT pg_advisory_xact_lock(hashtextextended($1,7301949))",
      [v.comparisonGroupId],
    );
    const others = (
      await sql.query(
        `SELECT p.owner_enrollment_id,w.learning_context->>'taskId' task FROM colorverse.showcase_works w JOIN colorverse.planets p ON p.id=w.planet_id WHERE w.learning_context->>'comparisonGroupId'=$1`,
        [v.comparisonGroupId],
      )
    ).rows;
    if (
      others.some(
        (r) => r.owner_enrollment_id !== actor.id || r.task !== v.taskId,
      )
    )
      throw new ClassroomFailure(
        403,
        "COMPARISON_GROUP_FORBIDDEN",
        "比较组只能关联自己的同一任务作品",
      );
  }
  return { ...v, policy };
}
export function visibleLearning(input: unknown, canSeeIntent: boolean) {
  if (input == null) return null;
  const v = WorkLearningSchema.parse(input);
  if (canSeeIntent || v.policy.showIntentToPeers) return v;
  return {
    ...v,
    intendedMoods: [],
    customMood: "",
    paletteColors: [],
    colorRationale: "",
    intentHidden: true,
  };
}
