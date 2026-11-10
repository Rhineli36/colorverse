import {
  LearningTaskIds,
  AssignmentCatalog,
  LearningTaskSettingSchema,
  WorkLearningInput,
  WorkLearningSchema,
  AssignmentDefinitionSchema,
  CustomAssignmentFields,
} from "@colorverse/contracts";
import { z } from "zod";
import { ClassroomFailure } from "./classroom";
import type { EnrollmentSql } from "./enrollment";
export function assignmentReferenceMedia(
  classId: string,
  taskId: string,
  keys: string[],
) {
  const route = `private:classes/${classId}/learning-tasks/${taskId}/image`;
  return {
    image: keys.length ? route : "",
    images: keys.map((_, index) => `${route}?index=${index}`),
  };
}
export async function learningTasks(
  sql: EnrollmentSql,
  actor: Record<string, unknown>,
  classId: string,
  method: string,
  body?: unknown,
  media?: {
    append?: (remaining: number) => Promise<string[]>;
    removed: string[];
  },
) {
  if (method === "PATCH") {
    if (!["teacher", "assistant"].includes(String(actor.role)))
      throw new ClassroomFailure(
        403,
        "TEACHER_REQUIRED",
        "只有本班教师可以编辑作业草稿",
      );
    const v = z
      .strictObject({
        taskId: z.string().regex(/^custom-[a-f0-9-]{36}$/),
        revision: z.number().int().nonnegative(),
        definition: CustomAssignmentFields,
        keepImageIndices: z
          .array(z.number().int().min(0).max(5))
          .max(6)
          .refine((indices) =>
            indices.every((index, i) => i === 0 || indices[i - 1] < index),
          )
          .optional(),
      })
      .parse(body);
    await sql.query(
      "SELECT pg_advisory_xact_lock(hashtextextended($1,7301948))",
      [classId],
    );
    const draft = (
      await sql.query(
        `SELECT s.definition,s.published,s.revision,s.image_storage_keys,s.image_storage_key,
       EXISTS(SELECT 1 FROM colorverse.classroom_publications p WHERE p.class_id=s.class_id AND p.task_id=s.task_id) AS previously_published
       FROM colorverse.learning_task_settings s WHERE s.class_id=$1 AND s.task_id=$2`,
        [classId, v.taskId],
      )
    ).rows[0];
    if (!draft?.definition)
      throw new ClassroomFailure(404, "TASK_NOT_FOUND", "找不到这份作业草稿。");
    if (draft.published || draft.previously_published)
      throw new ClassroomFailure(
        409,
        "TASK_PUBLISHED",
        "这份作业已经发布，不能改写发布记录。",
      );
    if (draft.revision !== v.revision)
      throw new ClassroomFailure(
        409,
        "TASK_CONFLICT",
        "草稿已在其他页面更新，请重新打开后编辑。",
      );
    const keys = draft.image_storage_keys as string[];
    const saved = keys?.length
      ? keys
      : draft.image_storage_key
        ? [String(draft.image_storage_key)]
        : [];
    if (v.keepImageIndices?.some((index) => index >= saved.length))
      throw new ClassroomFailure(
        400,
        "INVALID_UPLOAD",
        "参考图片已变化，请重新打开草稿。",
      );
    const kept = v.keepImageIndices
      ? v.keepImageIndices.map((index) => saved[index])
      : saved;
    const appended = media?.append ? await media.append(6 - kept.length) : [];
    const images = [...kept, ...appended];
    const mediaChanged = appended.length > 0 || kept.length !== saved.length;
    const definition = AssignmentDefinitionSchema.parse({
      ...AssignmentDefinitionSchema.parse(draft.definition),
      ...v.definition,
      formatting: v.definition.formatting,
      ...(mediaChanged
        ? assignmentReferenceMedia(classId, v.taskId, images)
        : {}),
    });
    await sql.query(
      `UPDATE colorverse.learning_task_settings SET definition=$3,revision=revision+1,updated_at=now()
       ${mediaChanged ? ",image_storage_key=$4,image_storage_keys=$5" : ""}
       WHERE class_id=$1 AND task_id=$2`,
      [
        classId,
        v.taskId,
        JSON.stringify(definition),
        ...(mediaChanged ? [images[0] ?? null, JSON.stringify(images)] : []),
      ],
    );
    if (media)
      media.removed.push(...saved.filter((key) => !kept.includes(key)));
  } else if (method === "PUT") {
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
      `SELECT task_id "taskId",published,require_explanation "requireExplanation",allow_peer_review "allowPeerReview",show_intent_to_peers "showIntentToPeers",revision,definition FROM colorverse.learning_task_settings WHERE class_id=$1`,
      [classId],
    )
  ).rows;
  return {
    tasks: [
      ...LearningTaskIds,
      ...rows
        .filter((r) => String(r.taskId).startsWith("custom-"))
        .map((r) => String(r.taskId)),
    ]
      .filter((taskId) => {
        const row = rows.find((r) => r.taskId === taskId);
        return (
          !taskId.startsWith("custom-") ||
          Boolean(row?.published) ||
          ["teacher", "assistant"].includes(String(actor.role))
        );
      })
      .map((taskId) => {
        const row = rows.find((r) => r.taskId === taskId);
        return LearningTaskSettingSchema.parse(
          row
            ? { ...row, definition: row.definition ?? undefined }
            : {
                taskId,
                published: false,
                requireExplanation: true,
                allowPeerReview: true,
                showIntentToPeers: true,
                revision: 0,
              },
        );
      }),
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
  let taskTitle: string | undefined;
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
    taskTitle =
      task.definition?.title ??
      AssignmentCatalog.find((t) => t.id === v.taskId)?.title;
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
  return { ...v, policy, ...(taskTitle ? { taskTitle } : {}) };
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
