import { z } from "zod";
import {
  AssignmentDefinitionSchema,
  CustomAssignmentFields,
} from "@colorverse/contracts";
import type { VerifiedIdentity } from "./auth";
import type { EnrollmentSql } from "./enrollment";
import { classroomActor, ClassroomFailure } from "./classroom";
import {
  readAssignmentUpload,
  uploadAssignmentImages,
  storage,
  classroomThumbnail,
  type ShowcaseCloudEnvironment,
} from "./showcase-cloud";

const Edit = z.strictObject({
  revision: z.number().int().nonnegative(),
  definition: CustomAssignmentFields,
  keepImageIndices: z
    .array(z.number().int().min(0).max(5))
    .max(6)
    .refine((v) => v.every((n, i) => i === 0 || v[i - 1] < n))
    .optional(),
});
async function readRow(sql: EnrollmentSql, classId: string, id: string) {
  const row = (
    await sql.query(
      `SELECT p.*,s.image_storage_keys legacy_keys,s.image_storage_key legacy_key
    FROM colorverse.classroom_publications p
    LEFT JOIN colorverse.learning_task_settings s ON s.class_id=p.class_id AND s.task_id=p.task_id
    WHERE p.class_id=$1 AND p.id=$2`,
      [classId, id],
    )
  ).rows[0];
  if (!row)
    throw new ClassroomFailure(404, "TASK_NOT_FOUND", "找不到这份已发布作业。");
  return row;
}
function mediaKeys(row: Record<string, unknown>) {
  return (row.image_storage_keys ??
    ((row.legacy_keys as unknown[])?.length
      ? row.legacy_keys
      : row.legacy_key
        ? [String(row.legacy_key)]
        : [])) as (string | null)[];
}
/** Runs inside the caller's transaction; publishes no notifications or recipients. */
export async function editPublishedAssignment(
  sql: EnrollmentSql,
  identity: VerifiedIdentity,
  classId: string,
  id: string,
  body: unknown,
  append?: (remaining: number) => Promise<string[]>,
) {
  const actor = await classroomActor(sql, identity, classId);
  if (!["teacher", "assistant"].includes(String(actor.role)))
    throw new ClassroomFailure(
      403,
      "TEACHER_REQUIRED",
      "只有本班教师可以修改已发布作业。",
    );
  const input = Edit.parse(body);
  await sql.query(
    "SELECT pg_advisory_xact_lock(hashtextextended($1,7301948))",
    [classId],
  );
  const row = await readRow(sql, classId, id);
  if (row.content_revision !== input.revision)
    throw new ClassroomFailure(
      409,
      "TASK_CONFLICT",
      "作业已在其他页面更新。当前修改已保留，请关闭后重新打开并核对。",
    );
  const old = AssignmentDefinitionSchema.parse(row.definition);
  const oldKeys = mediaKeys(row);
  const sources = old.images?.length
    ? old.images
    : old.image
      ? [old.image]
      : [];
  if (input.keepImageIndices?.some((i) => i >= sources.length))
    throw new ClassroomFailure(
      409,
      "TASK_CONFLICT",
      "参考图片已变化，请重新打开后核对。",
    );
  const keep = input.keepImageIndices ?? sources.map((_, i) => i);
  const appended = append ? await append(6 - keep.length) : [];
  if (appended.length + keep.length > 6)
    throw new ClassroomFailure(
      400,
      "INVALID_UPLOAD",
      "每份作业最多保留6张参考图片。",
    );
  const keys = [...keep.map((i) => oldKeys[i] ?? null), ...appended];
  const revision = input.revision + 1;
  const retained = keep.map((i) => sources[i]);
  const images = keys.map((key, index) =>
    key
      ? `private:classes/${classId}/publications/${id}/image?revision=${revision}&index=${index}`
      : retained[index],
  );
  const definition = AssignmentDefinitionSchema.parse({
    ...old,
    ...input.definition,
    formatting: input.definition.formatting,
    stepLayout: input.definition.stepLayout ?? old.stepLayout,
    image: images[0] ?? "",
    images,
  });
  await sql.query(
    `UPDATE colorverse.classroom_publications SET definition=$3,content_revision=content_revision+1,image_storage_keys=$4,
    content_history=content_history||jsonb_build_array(jsonb_build_object('revision',content_revision,'definition',definition,'imageStorageKeys',$5::jsonb,'savedAt',now()))
    WHERE class_id=$1 AND id=$2`,
    [
      classId,
      id,
      JSON.stringify(definition),
      JSON.stringify(keys),
      JSON.stringify(oldKeys),
    ],
  );
  // Preserve originals referenced by prior versions and other publications/templates.
  return { id, definition, revision };
}
export async function publishedAssignmentRequest(
  request: Request,
  env: ShowcaseCloudEnvironment,
  identity: VerifiedIdentity,
  classId: string,
  id: string,
  kind: string,
  sql: EnrollmentSql,
  uploaded: string[],
) {
  const actor = await classroomActor(sql, identity, classId);
  const staff = ["teacher", "assistant"].includes(String(actor.role));
  if (kind === "image" && request.method === "GET") {
    const row = await readRow(sql, classId, id);
    if (
      !staff &&
      !(
        await sql.query(
          "SELECT 1 FROM colorverse.classroom_recipients WHERE publication_id=$1 AND enrollment_id=$2",
          [id, actor.id],
        )
      ).rows.length
    )
      throw new ClassroomFailure(404, "NOT_FOUND", "作业参考图暂不可查看。");
    const url = new URL(request.url);
    const index = z.coerce
      .number()
      .int()
      .min(0)
      .max(5)
      .parse(url.searchParams.get("index") ?? 0);
    if (url.searchParams.get("revision") !== String(row.content_revision))
      throw new ClassroomFailure(
        409,
        "TASK_CONFLICT",
        "作业参考图已更新，请刷新作业后查看。",
      );
    const key = mediaKeys(row)[index];
    if (!key)
      throw new ClassroomFailure(404, "NOT_FOUND", "这张参考图不存在。");
    const image = await classroomThumbnail(
      request,
      env,
      await storage(env, `colorverse-classroom/${key}`),
    );
    return new Response(image.body, {
      headers: { "Content-Type": "image/webp" },
    });
  }
  if (!staff)
    throw new ClassroomFailure(
      403,
      "TEACHER_REQUIRED",
      "只有本班教师可以修改已发布作业。",
    );
  if (kind === "content" && request.method === "GET") {
    const row = await readRow(sql, classId, id);
    return Response.json({
      id,
      definition: AssignmentDefinitionSchema.parse(row.definition),
      revision: row.content_revision,
    });
  }
  if (kind === "content" && request.method === "PATCH") {
    const { metadata, files } = await readAssignmentUpload(request, true);
    const value = await editPublishedAssignment(
      sql,
      identity,
      classId,
      id,
      metadata,
      async (remaining) => {
        if (files.length > remaining)
          throw new ClassroomFailure(
            400,
            "INVALID_UPLOAD",
            "每份作业最多保留6张参考图片。",
          );
        return uploadAssignmentImages(
          env,
          identity,
          crypto.randomUUID(),
          files,
          uploaded,
        );
      },
    );
    return Response.json(value);
  }
  throw new ClassroomFailure(405, "METHOD_NOT_ALLOWED", "请求方式无效。");
}
