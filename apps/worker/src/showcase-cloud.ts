import { studentProfile } from "./student-profile";
import {
  nextGrowthPlacement,
  growthElementColor,
  clampPlanetPosition,
} from "@colorverse/domain";
import { Client } from "pg";
import { databaseClient, type DatabaseBinding } from "./database-client";
import { z } from "zod";
import {
  GrowthPresetIds,
  CloudPlanetAppearanceInput,
  CloudPlanetPresets,
  cloudPlanetFromPreset,
  CloudPlanetPositionInput,
  CloudPlanetVisibilityInput,
  DefaultCloudMotion,
  PeerObservationSchema,
  CustomAssignmentFields,
  AssignmentDefinitionSchema,
} from "@colorverse/contracts";
import {
  learningTasks,
  validateWorkLearning,
  visibleLearning,
} from "./learning";
import { imageInfo } from "@colorverse/package-io";
import type { VerifiedIdentity } from "./auth";
import type { AuthEnvironment } from "./auth";
import { classroomActor, ClassroomFailure } from "./classroom";
import { showcaseReview } from "./showcase-review";
import { classroomNotifications } from "./notifications";
interface ImagesBinding {
  input(stream: ReadableStream<Uint8Array>): {
    transform(options: Record<string, unknown>): {
      output(
        options: Record<string, unknown>,
      ): Promise<{ response(): Response }>;
    };
  };
}
export interface ShowcaseCloudEnvironment extends AuthEnvironment {
  HYPERDRIVE_WRITER?: DatabaseBinding;
  SUPABASE_SECRET_KEY?: string;
  IMAGES?: ImagesBinding;
}
const planetInput = z.union([
  CloudPlanetAppearanceInput,
  z.strictObject({ random: z.literal(true) }),
]);
const appearanceInput = CloudPlanetAppearanceInput.extend({
  revision: z.number().int().nonnegative(),
});
const elementInput = z.strictObject({
  presetId: z.enum(GrowthPresetIds),
  color: z.string().regex(/^#[a-f0-9]{6}$/i),
  x: z.number().min(0.05).max(0.95),
  y: z.number().min(0.1).max(0.9),
  size: z.number().min(0.3).max(1.5),
  motion: z.enum(["still", "float", "breathe", "rotate"]),
  revision: z.number().int().nonnegative(),
});
export function cloudUploadsReady(env: ShowcaseCloudEnvironment) {
  return Boolean(
    env.HYPERDRIVE_WRITER && env.SUPABASE_SECRET_KEY && env.IMAGES,
  );
}
async function storage(
  env: ShowcaseCloudEnvironment,
  path: string,
  method = "GET",
  body?: Uint8Array,
  mime?: string,
) {
  const response = await fetch(
    `${env.SUPABASE_URL}/storage/v1/object/${path}`,
    {
      method,
      headers: {
        apikey: env.SUPABASE_SECRET_KEY!,
        Authorization: `Bearer ${env.SUPABASE_SECRET_KEY!}`,
        ...(mime ? { "Content-Type": mime } : {}),
      },
      body: body ? (body as BodyInit) : undefined,
      redirect: "manual",
      signal: AbortSignal.timeout(20000),
    },
  );
  if (!response.ok)
    throw new ClassroomFailure(
      503,
      "STORAGE_UNAVAILABLE",
      "图片存储暂不可用，请重试",
    );
  return response;
}
async function readLimited(request: Request, max: number) {
  if (Number(request.headers.get("Content-Length")) > max)
    throw new ClassroomFailure(413, "TOO_LARGE", "图片最多 8 MB");
  const reader = request.body?.getReader();
  if (!reader) throw new ClassroomFailure(400, "EMPTY_BODY", "缺少上传内容");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > max) {
      await reader.cancel();
      throw new ClassroomFailure(413, "TOO_LARGE", "图片最多 8 MB");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) {
    bytes.set(c, offset);
    offset += c.length;
  }
  return bytes;
}
async function removeStoredImages(
  env: ShowcaseCloudEnvironment,
  keys: string[],
) {
  const response = await fetch(
    `${env.SUPABASE_URL}/storage/v1/object/colorverse-classroom`,
    {
      method: "DELETE",
      headers: {
        apikey: env.SUPABASE_SECRET_KEY!,
        Authorization: `Bearer ${env.SUPABASE_SECRET_KEY!}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ prefixes: keys }),
      signal: AbortSignal.timeout(10000),
      redirect: "manual",
    },
  );
  if (!response.ok)
    throw new ClassroomFailure(
      503,
      "STORAGE_UNAVAILABLE",
      "旧图片清理暂未完成",
    );
}
export async function handleShowcaseCloud(
  request: Request,
  env: ShowcaseCloudEnvironment,
  identity: VerifiedIdentity,
  classId: string,
  resource: string,
  clientFactory: () => Pick<Client, "connect" | "query" | "end"> = () =>
    databaseClient(env.HYPERDRIVE_WRITER!),
) {
  if (!cloudUploadsReady(env))
    throw new ClassroomFailure(
      503,
      "UPLOADS_NOT_READY",
      "云端作品连接正在准备",
    );
  const client = clientFactory();
  const uploadedKeys: string[] = [];
  let commitAttempted = false;
  try {
    await client.connect();
    await client.query("BEGIN");
    const actor = await classroomActor(client, identity, classId);
    if (resource === "profile") {
      const body =
        request.method === "PUT"
          ? JSON.parse(
              new TextDecoder().decode(await readLimited(request, 4096)),
            )
          : undefined;
      const value = await studentProfile(client, actor, request.method, body);
      await client.query("COMMIT");
      return Response.json(value);
    }
    if (resource === "notification-read") {
      if (request.method !== "POST")
        throw new ClassroomFailure(405, "METHOD_NOT_ALLOWED", "请求方式无效");
      const body = z
        .object({ id: z.string().min(1).max(250) })
        .parse(
          JSON.parse(
            new TextDecoder().decode(await readLimited(request, 4096)),
          ),
        );
      const available = await classroomNotifications(
        client,
        actor,
        classId,
        env.CLASSROOM_NEXT === "true",
      );
      if (!available.notifications.some((n) => n.id === body.id))
        throw new ClassroomFailure(404, "NOT_FOUND", "消息不存在或已不可查看");
      await client.query(
        "INSERT INTO colorverse.classroom_notice_reads(enrollment_id,notice_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
        [actor.id, body.id],
      );
      await client.query("COMMIT");
      return Response.json({ saved: true });
    }
    // Hiding a planet protects direct media/review/interaction URLs too, not
    // just its entry in the universe. The author can still maintain their work.
    if (actor.role === "student") {
      let planetId: string | undefined = /^planets\/([a-f0-9-]{36})\//.exec(
        resource,
      )?.[1];
      const workId = /^works\/([a-f0-9-]{36})\//.exec(resource)?.[1];
      if (workId)
        planetId = (
          await client.query(
            "SELECT w.planet_id FROM colorverse.showcase_works w JOIN colorverse.planets p ON p.id=w.planet_id JOIN colorverse.enrollments e ON e.id=p.owner_enrollment_id WHERE w.id=$1 AND e.class_id=$2",
            [workId, classId],
          )
        ).rows[0]?.planet_id;
      if (resource === "interactions" && request.method === "GET")
        planetId =
          new URL(request.url).searchParams.get("planetId") ?? undefined;
      if (
        (resource === "interactions" || resource === "guide") &&
        request.method === "POST"
      ) {
        const input = JSON.parse(
          new TextDecoder().decode(await readLimited(request.clone(), 12000)),
        );
        planetId = input.planetId;
      }
      if (planetId && z.uuid().safeParse(planetId).success) {
        const planet = (
          await client.query(
            "SELECT p.owner_enrollment_id,p.document->>'visible' AS visible FROM colorverse.planets p JOIN colorverse.enrollments e ON e.id=p.owner_enrollment_id WHERE p.id=$1 AND e.class_id=$2",
            [planetId, classId],
          )
        ).rows[0];
        if (
          planet?.visible === "false" &&
          planet.owner_enrollment_id !== actor.id
        )
          throw new ClassroomFailure(404, "NOT_FOUND", "星球暂不可查看");
      }
    }
    const assignmentImage =
      /^learning-tasks\/(custom-[a-f0-9-]{36})\/image$/.exec(resource);
    if (assignmentImage && request.method === "GET") {
      const row = (
        await client.query(
          "SELECT image_storage_key,published FROM colorverse.learning_task_settings WHERE class_id=$1 AND task_id=$2",
          [classId, assignmentImage[1]],
        )
      ).rows[0];
      if (
        !row?.image_storage_key ||
        (!row.published &&
          !["teacher", "assistant"].includes(String(actor.role)))
      )
        throw new ClassroomFailure(404, "NOT_FOUND", "作业示范图片不存在");
      await client.query("COMMIT");
      const image = await storage(
        env,
        `colorverse-classroom/${row.image_storage_key}`,
      );
      return new Response(image.body, {
        headers: {
          "Content-Type": "image/webp",
          "Cache-Control": "private, no-store",
        },
      });
    }
    if (resource === "learning-tasks" && request.method === "POST") {
      if (!["teacher", "assistant"].includes(String(actor.role)))
        throw new ClassroomFailure(
          403,
          "TEACHER_REQUIRED",
          "只有本班教师可以新增作业",
        );
      if (
        !request.headers.get("Content-Type")?.startsWith("multipart/form-data")
      )
        throw new ClassroomFailure(
          400,
          "INVALID_UPLOAD",
          "请上传作业说明与示范图片",
        );
      const envelope = await readLimited(request, 8388608 + 50000);
      const form = await new Request("https://upload.invalid", {
        method: "POST",
        headers: { "Content-Type": request.headers.get("Content-Type") ?? "" },
        body: envelope as BodyInit,
      }).formData();
      if (
        [...form.keys()].some((k) => !["metadata", "image"].includes(k)) ||
        form.getAll("metadata").length !== 1 ||
        form.getAll("image").length > 1
      )
        throw new ClassroomFailure(
          400,
          "INVALID_UPLOAD",
          "请提交作业说明与一张示范图片",
        );
      const metadata = form.get("metadata");
      if (
        typeof metadata !== "string" ||
        new TextEncoder().encode(metadata).length > 42000
      )
        throw new ClassroomFailure(400, "INVALID_INPUT", "作业说明过长");
      const input = z
        .strictObject({
          requestId: z.uuid(),
          definition: CustomAssignmentFields,
        })
        .parse(JSON.parse(metadata));
      const taskId = `custom-${input.requestId}`;
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1,7301948))",
        [classId],
      );
      const existing = (
        await client.query(
          "SELECT task_id FROM colorverse.learning_task_settings WHERE class_id=$1 AND task_id=$2",
          [classId, taskId],
        )
      ).rows[0];
      if (existing) {
        const result = await learningTasks(client, actor, classId, "GET");
        await client.query("COMMIT");
        return Response.json({ ...result, taskId });
      }
      const count = (
        await client.query(
          "SELECT count(*)::int count FROM colorverse.learning_task_settings WHERE class_id=$1 AND definition IS NOT NULL",
          [classId],
        )
      ).rows[0];
      if (Number(count.count) >= 50)
        throw new ClassroomFailure(
          409,
          "TASK_LIMIT",
          "当前班级最多新增50份作业",
        );
      let imageKey: string | null = null;
      const file = form.get("image");
      if (file !== null) {
        if (!(file instanceof Blob) || file.size > 8388608)
          throw new ClassroomFailure(
            400,
            "INVALID_IMAGE",
            "请选择8MB以内的示范图片",
          );
        const bytes = new Uint8Array(await file.arrayBuffer());
        let info;
        try {
          info = imageInfo(bytes);
        } catch {
          throw new ClassroomFailure(
            400,
            "INVALID_IMAGE",
            "请选择有效的PNG、JPEG或WebP图片",
          );
        }
        if (info.width * info.height > 16000000)
          throw new ClassroomFailure(
            400,
            "IMAGE_DIMENSIONS",
            "图片请控制在1600万像素以内",
          );
        let display: Uint8Array;
        try {
          const output = await env
            .IMAGES!.input(new Blob([bytes as BlobPart]).stream())
            .transform({ width: 2048, height: 2048, fit: "scale-down" })
            .output({ format: "image/webp", quality: 88, anim: false });
          display = new Uint8Array(await output.response().arrayBuffer());
        } catch {
          throw new ClassroomFailure(
            400,
            "IMAGE_DECODE_FAILED",
            "示范图片无法完整读取，请重新选择",
          );
        }
        if (display.length > 2097152)
          throw new ClassroomFailure(
            400,
            "IMAGE_TOO_LARGE",
            "请缩小示范图片后重试",
          );
        imageKey = `${identity.subject}/assignment-${input.requestId}.webp`;
        uploadedKeys.push(imageKey);
        await storage(
          env,
          `colorverse-classroom/${imageKey}`,
          "POST",
          display,
          "image/webp",
        );
      }
      const definition = AssignmentDefinitionSchema.parse({
        ...input.definition,
        id: taskId,
        image: imageKey
          ? `private:classes/${classId}/learning-tasks/${taskId}/image`
          : "",
      });
      await client.query(
        "INSERT INTO colorverse.learning_task_settings(class_id,task_id,published,require_explanation,allow_peer_review,show_intent_to_peers,revision,definition,image_storage_key) VALUES($1,$2,true,true,true,true,1,$3,$4)",
        [classId, taskId, JSON.stringify(definition), imageKey],
      );
      const result = await learningTasks(client, actor, classId, "GET");
      commitAttempted = true;
      await client.query("COMMIT");
      uploadedKeys.length = 0;
      return Response.json({ ...result, taskId }, { status: 201 });
    }
    if (resource === "notifications") {
      if (request.method !== "GET")
        throw new ClassroomFailure(405, "METHOD_NOT_ALLOWED", "请求方式无效");
      const result = await classroomNotifications(
        client,
        actor,
        classId,
        env.CLASSROOM_NEXT === "true",
      );
      await client.query("COMMIT");
      return Response.json(result);
    }
    if (resource === "learning-tasks") {
      const result = await learningTasks(
        client,
        actor,
        classId,
        request.method,
        request.method === "PUT"
          ? JSON.parse(
              new TextDecoder().decode(await readLimited(request, 48000)),
            )
          : undefined,
      );
      await client.query("COMMIT");
      return Response.json(result);
    }
    const review = /^works\/([a-f0-9-]+)\/review$/.exec(resource);
    if (review) {
      const body =
        request.method === "POST"
          ? JSON.parse(
              new TextDecoder().decode(await readLimited(request, 16000)),
            )
          : undefined;
      const result = await showcaseReview(
        client,
        actor,
        classId,
        review[1],
        request.method,
        body,
        env.CLASSROOM_NEXT === "true",
      );
      await client.query("COMMIT");
      return Response.json(result);
    }
    if (resource === "guide") {
      if (actor.role !== "student")
        throw new ClassroomFailure(
          403,
          "STUDENT_REQUIRED",
          "新手任务仅用于学生账户",
        );
      if (request.method === "POST") {
        const input = z
          .strictObject({ planetId: z.uuid() })
          .parse(
            JSON.parse(
              new TextDecoder().decode(await readLimited(request, 2048)),
            ),
          );
        const peer = await client.query(
          "SELECT p.id FROM colorverse.planets p JOIN colorverse.enrollments e ON e.id=p.owner_enrollment_id JOIN colorverse.users u ON u.id=e.user_id WHERE p.id=$1 AND e.class_id=$2 AND e.role='student' AND e.status='active' AND u.status='active' AND e.id<>$3",
          [input.planetId, classId, actor.id],
        );
        if (!peer.rows.length)
          throw new ClassroomFailure(
            404,
            "PEER_NOT_FOUND",
            "请选择本班其他同学的星球",
          );
        await client.query(
          "SELECT pg_advisory_xact_lock(hashtextextended($1,7301942))",
          [actor.id],
        );
        const own = await client.query(
          "SELECT id,document FROM colorverse.planets WHERE owner_enrollment_id=$1",
          [actor.id],
        );
        if (!own.rows.length)
          throw new ClassroomFailure(
            409,
            "PLANET_REQUIRED",
            "请先创建自己的星球",
          );
        const document = own.rows[0].document;
        await client.query(
          "UPDATE colorverse.planets SET document=$1 WHERE id=$2",
          [
            JSON.stringify({
              ...document,
              guide: { ...document.guide, visited: true },
            }),
            own.rows[0].id,
          ],
        );
        await client.query("COMMIT");
        return Response.json({ saved: true });
      }
      if (request.method === "GET") {
        const own = (
          await client.query(
            "SELECT id,document FROM colorverse.planets WHERE owner_enrollment_id=$1",
            [actor.id],
          )
        ).rows[0];
        const facts = (
          await client.query(
            `SELECT EXISTS(SELECT 1 FROM colorverse.planets p JOIN colorverse.enrollments e ON e.id=p.owner_enrollment_id JOIN colorverse.users u ON u.id=e.user_id WHERE e.class_id=$1 AND e.id<>$2 AND e.role='student' AND e.status='active' AND u.status='active') peers,
          EXISTS(SELECT 1 FROM colorverse.showcase_works WHERE planet_id=$3 AND withdrawn_at IS NULL) work,
          EXISTS(SELECT 1 FROM colorverse.showcase_works WHERE planet_id=$3 AND element_edited AND withdrawn_at IS NULL) element,
          EXISTS(SELECT 1 FROM colorverse.classroom_interactions i JOIN colorverse.planets p ON p.id=i.planet_id JOIN colorverse.enrollments e ON e.id=p.owner_enrollment_id LEFT JOIN colorverse.showcase_works w ON w.id=i.work_id WHERE (i.work_id IS NULL OR w.withdrawn_at IS NULL) AND i.actor_enrollment_id=$2 AND e.class_id=$1 AND e.id<>$2 AND i.kind IN ('like','emoji')) reaction,
          EXISTS(SELECT 1 FROM colorverse.classroom_interactions i JOIN colorverse.planets p ON p.id=i.planet_id JOIN colorverse.enrollments e ON e.id=p.owner_enrollment_id LEFT JOIN colorverse.showcase_works w ON w.id=i.work_id WHERE (i.work_id IS NULL OR w.withdrawn_at IS NULL) AND i.actor_enrollment_id=$2 AND e.class_id=$1 AND e.id<>$2 AND i.kind='comment' AND length(trim(i.content))>0) comment`,
            [classId, actor.id, own?.id ?? null],
          )
        ).rows[0];
        const d = own?.document;
        const completed = Object.entries({
          exterior: Boolean(d?.media?.exterior),
          atmosphere: Boolean(
            (d?.atmosphere && d.atmosphere !== "none") ||
            (d?.halo && d.halo !== "none") ||
            (d?.motion && d.motion.mode !== "stationary"),
          ),
          interior: Boolean(d?.media?.interior),
          tone: Boolean(d?.guide?.tone),
          summary: Boolean(d?.metadata?.summary?.trim()),
          work: facts.work,
          element: facts.element,
          visit: Boolean(d?.guide?.visited),
          reaction: facts.reaction,
          comment: facts.comment,
        })
          .filter(([, done]) => done)
          .map(([id]) => id);
        await client.query("COMMIT");
        return Response.json({ completed, hasPeers: facts.peers });
      }
    }
    if (resource === "planets" && request.method === "GET") {
      const rows = await client.query(
        `SELECT p.id,p.owner_enrollment_id,u.display_name,p.document, (SELECT jsonb_build_object('likes', count(*) FILTER(WHERE i.kind='like'), 'emojis', count(*) FILTER(WHERE i.kind='emoji'), 'comments', count(*) FILTER(WHERE i.kind='comment')) FROM colorverse.classroom_interactions i LEFT JOIN colorverse.showcase_works iw ON iw.id=i.work_id WHERE i.planet_id=p.id AND (i.work_id IS NULL OR iw.withdrawn_at IS NULL)) stats, COALESCE((SELECT jsonb_agg(jsonb_build_object('id',w.id,'title',w.title,'description',w.description,'presetId',w.preset_id,'color',w.color,'createdAt',w.created_at,'params',w.element_params,'revision',w.revision${env.CLASSROOM_NEXT === "true" ? " ,'imageCount',1+jsonb_array_length(w.gallery_images)" : ""},'learning',w.learning_context,'withdrawn',w.withdrawn_at IS NOT NULL,'canRestore',(w.withdrawn_at IS NULL OR w.withdrawn_by=p.owner_enrollment_id OR $3::boolean)) ORDER BY w.created_at) FROM colorverse.showcase_works w WHERE w.planet_id=p.id AND (w.withdrawn_at IS NULL OR p.owner_enrollment_id=$2::uuid OR $3::boolean)),'[]'::jsonb) works FROM colorverse.planets p JOIN colorverse.enrollments e ON e.id=p.owner_enrollment_id JOIN colorverse.users u ON u.id=e.user_id WHERE e.class_id=$1 AND e.status='active' AND u.status='active' AND ($3::boolean OR p.owner_enrollment_id=$2::uuid OR COALESCE(p.document->>'visible','true')<>'false') ORDER BY u.display_name`,
        [
          classId,
          actor.id,
          actor.role === "teacher" || actor.role === "assistant",
        ],
      );
      const reviews = await client.query(
        `SELECT DISTINCT ON(r.work_id) r.work_id,r.score::float8 score,r.comment FROM colorverse.showcase_reviews r JOIN colorverse.showcase_works w ON w.id=r.work_id JOIN colorverse.planets p ON p.id=w.planet_id JOIN colorverse.enrollments e ON e.id=p.owner_enrollment_id WHERE e.class_id=$1 AND (p.owner_enrollment_id=$2 OR $3::boolean) ${env.CLASSROOM_NEXT === "true" ? "AND r.submission_revision=w.submission_revision" : ""} ORDER BY r.work_id,r.revision DESC`,
        [
          classId,
          actor.id,
          ["teacher", "assistant"].includes(String(actor.role)),
        ],
      );
      await client.query("COMMIT");
      for (const p of rows.rows) {
        for (const w of p.works) {
          const r = reviews.rows.find((r) => r.work_id === w.id);
          if (r) {
            w.score = r.score;
            w.comment = r.comment;
          }
        }
        for (const w of p.works)
          w.learning = visibleLearning(
            w.learning,
            p.owner_enrollment_id === actor.id ||
              ["teacher", "assistant"].includes(String(actor.role)),
          );
      }
      return Response.json({ actorId: actor.id, planets: rows.rows });
    }
    if (resource === "planets" && request.method === "POST") {
      if (actor.role !== "student")
        throw new ClassroomFailure(
          403,
          "STUDENT_REQUIRED",
          "请使用学生账户创建自己的星球",
        );
      const input = planetInput.parse(
        JSON.parse(new TextDecoder().decode(await readLimited(request, 16000))),
      );
      const skin =
        "random" in input
          ? crypto.getRandomValues(new Uint32Array(1))[0] %
            CloudPlanetPresets.length
          : input.skin;
      const appearance = "random" in input ? CloudPlanetPresets[skin] : input;
      const starter = cloudPlanetFromPreset(skin);
      const result = await client.query(
        "INSERT INTO colorverse.planets(id,owner_enrollment_id,document) VALUES($1,$2,$3) ON CONFLICT(owner_enrollment_id) DO NOTHING RETURNING id",
        [
          crypto.randomUUID(),
          actor.id,
          JSON.stringify({
            ...starter,
            createdAt: new Date().toISOString(),
            metadata: {
              ...starter.metadata,
              name: appearance.name,
              ...(!("random" in input) && input.summary !== undefined
                ? { summary: input.summary }
                : {}),
              ...(!("random" in input) && input.reflection !== undefined
                ? { reflection: input.reflection }
                : {}),
            },
            color: appearance.color,
            ...(!("random" in input) && input.learningIntent !== undefined
              ? { learningIntent: input.learningIntent }
              : {}),
            skin,
            revision: 0,
          }),
        ],
      );
      const id =
        result.rows[0]?.id ??
        (
          await client.query(
            "SELECT id FROM colorverse.planets WHERE owner_enrollment_id=$1",
            [actor.id],
          )
        ).rows[0]?.id;
      await client.query("COMMIT");
      return Response.json({ created: result.rows.length > 0, id });
    }
    const planetMatch =
      /^planets\/([a-f0-9-]+)\/(appearance|exterior|interior|position|visibility)$/.exec(
        resource,
      );
    if (planetMatch) {
      const id = z.uuid().parse(planetMatch[1]),
        kind = planetMatch[2];
      const mutation = request.method === "PUT" || request.method === "POST";
      if (mutation)
        await client.query(
          "SELECT pg_advisory_xact_lock(hashtextextended($1,7301942))",
          [actor.id],
        );
      const row = (
        await client.query(
          "SELECT p.owner_enrollment_id,p.document FROM colorverse.planets p JOIN colorverse.enrollments e ON e.id=p.owner_enrollment_id JOIN colorverse.users u ON u.id=e.user_id WHERE p.id=$1 AND e.class_id=$2 AND e.status='active' AND u.status='active'" +
            (mutation ? " FOR UPDATE OF p" : ""),
          [id, classId],
        )
      ).rows[0];
      if (!row) throw new ClassroomFailure(404, "NOT_FOUND", "星球不存在");
      if (
        mutation &&
        !(actor.role === "teacher" || actor.role === "assistant") &&
        (actor.role !== "student" || row.owner_enrollment_id !== actor.id)
      )
        throw new ClassroomFailure(403, "OWNER_REQUIRED", "只能修改自己的星球");
      const document = row.document,
        revision = document.revision ?? 0;
      if (kind === "visibility") {
        if (request.method !== "PUT")
          throw new ClassroomFailure(405, "METHOD_NOT_ALLOWED", "不支持此操作");
        if (actor.role !== "teacher" && actor.role !== "assistant")
          throw new ClassroomFailure(
            403,
            "TEACHER_REQUIRED",
            "只有本班教师可以设置星球可见性",
          );
        const input = CloudPlanetVisibilityInput.parse(
          JSON.parse(
            new TextDecoder().decode(await readLimited(request, 4096)),
          ),
        );
        if (input.revision !== revision)
          throw new ClassroomFailure(
            409,
            "PLANET_CONFLICT",
            "星球已更新，请刷新后再试",
          );
        await client.query(
          "UPDATE colorverse.planets SET document=$1 WHERE id=$2",
          [
            JSON.stringify({
              ...document,
              visible: input.visible,
              revision: revision + 1,
            }),
            id,
          ],
        );
        await client.query("COMMIT");
        return Response.json({
          saved: true,
          visible: input.visible,
          revision: revision + 1,
        });
      }
      if (kind === "position") {
        if (request.method !== "PUT")
          throw new ClassroomFailure(405, "METHOD_NOT_ALLOWED", "不支持此操作");
        const input = CloudPlanetPositionInput.parse(
          JSON.parse(
            new TextDecoder().decode(await readLimited(request, 4096)),
          ),
        );
        if (input.revision !== revision)
          throw new ClassroomFailure(
            409,
            "PLANET_CONFLICT",
            "星球已更新，请刷新后再移动",
          );
        const position = clampPlanetPosition(
          {
            planetId: id,
            position: input.position,
            scale: 1,
            motion: document.motion ?? DefaultCloudMotion,
          },
          42,
          input.position,
        );
        await client.query(
          "UPDATE colorverse.planets SET document=$1 WHERE id=$2",
          [
            JSON.stringify({ ...document, position, revision: revision + 1 }),
            id,
          ],
        );
        await client.query("COMMIT");
        return Response.json({ saved: true, position, revision: revision + 1 });
      }
      if (kind === "appearance" && request.method === "PUT") {
        const input = appearanceInput.parse(
          JSON.parse(
            new TextDecoder().decode(await readLimited(request, 24576)),
          ),
        );
        if (input.revision !== revision)
          throw new ClassroomFailure(
            409,
            "PLANET_CONFLICT",
            "星球已更新，请刷新后再修改",
          );
        await client.query(
          "UPDATE colorverse.planets SET document=$1 WHERE id=$2",
          [
            JSON.stringify({
              ...document,
              metadata: {
                ...document.metadata,
                name: input.name,
                ...(input.summary !== undefined
                  ? { summary: input.summary }
                  : {}),
                ...(input.reflection !== undefined
                  ? { reflection: input.reflection }
                  : {}),
                ...(input.courseNotes !== undefined
                  ? { courseNotes: input.courseNotes }
                  : {}),
                ...(input.demoWriting !== undefined
                  ? { demoWriting: input.demoWriting }
                  : {}),
              },
              color: input.color,
              ...(input.useDefaultExterior !== undefined
                ? { useDefaultExterior: input.useDefaultExterior }
                : {}),
              ...(input.haloIntensity !== undefined
                ? { haloIntensity: input.haloIntensity }
                : {}),
              ...(input.interiorView !== undefined
                ? { interiorView: input.interiorView }
                : {}),
              skin: input.skin,
              ...(input.atmosphere !== undefined
                ? { atmosphere: input.atmosphere }
                : {}),
              ...(input.halo !== undefined ? { halo: input.halo } : {}),
              ...(input.motion !== undefined ? { motion: input.motion } : {}),
              ...(input.brightness !== undefined
                ? { brightness: input.brightness }
                : {}),
              ...(input.saturation !== undefined
                ? { saturation: input.saturation }
                : {}),
              ...(input.imagePlacement !== undefined
                ? { imagePlacement: input.imagePlacement }
                : {}),
              ...(input.learningIntent !== undefined
                ? { learningIntent: input.learningIntent }
                : {}),
              ...(input.practice === "tone"
                ? { guide: { ...document.guide, tone: true } }
                : {}),
              revision: revision + 1,
            }),
            id,
          ],
        );
        await client.query("COMMIT");
        return Response.json({ saved: true });
      }
      if (kind !== "appearance" && request.method === "GET") {
        const media = document.media?.[kind];
        if (!media)
          throw new ClassroomFailure(404, "NOT_FOUND", "尚未上传这张图片");
        await client.query("COMMIT");
        const image = await storage(env, `colorverse-classroom/${media.key}`);
        return new Response(image.body, {
          headers: { "Content-Type": "image/webp" },
        });
      }
      if (kind !== "appearance" && request.method === "POST") {
        const url = new URL(request.url),
          requestId = z.uuid().parse(url.searchParams.get("requestId"));
        const previous = document.media?.[kind];
        if (previous?.requestId === requestId) {
          await client.query("COMMIT");
          return Response.json({ saved: true, id: previous.id });
        }
        if (
          z.coerce
            .number()
            .int()
            .nonnegative()
            .parse(
              z.string().regex(/^\d+$/).parse(url.searchParams.get("revision")),
            ) !== revision
        )
          throw new ClassroomFailure(
            409,
            "PLANET_CONFLICT",
            "星球已更新，请刷新后重新上传",
          );
        const bytes = await readLimited(request, 8388608);
        let info;
        try {
          info = imageInfo(bytes);
        } catch {
          throw new ClassroomFailure(
            400,
            "INVALID_IMAGE",
            "请选择有效的 PNG、JPEG 或 WebP 图片",
          );
        }
        if (info.width * info.height > 16000000)
          throw new ClassroomFailure(
            400,
            "IMAGE_DIMENSIONS",
            "图片像素过大，请缩小到 1600 万像素以内",
          );
        let display: Uint8Array;
        try {
          const output = await env
            .IMAGES!.input(new Blob([bytes as BlobPart]).stream())
            .transform({
              width: kind === "exterior" ? 1024 : 2048,
              height: kind === "exterior" ? 1024 : 2048,
              fit: "scale-down",
            })
            .output({ format: "image/webp", quality: 90, anim: false });
          display = new Uint8Array(await output.response().arrayBuffer());
        } catch {
          throw new ClassroomFailure(
            400,
            "IMAGE_DECODE_FAILED",
            "图片无法完整读取，请换一张有效图片",
          );
        }
        const quota = (
          await client.query(
            "SELECT COALESCE(sum(byte_size+original_byte_size),0)::int bytes FROM colorverse.showcase_works WHERE planet_id=$1",
            [id],
          )
        ).rows[0].bytes;
        const other =
          document.media?.[kind === "exterior" ? "interior" : "exterior"]
            ?.bytes ?? 0;
        if (
          display.length > 8388608 ||
          quota + other + display.length > 104857600
        )
          throw new ClassroomFailure(
            409,
            "QUOTA_EXCEEDED",
            "图片或星球存储空间超过试用上限",
          );
        const mediaId = crypto.randomUUID(),
          key = `${identity.subject}/${mediaId}-${kind}.webp`;
        uploadedKeys.push(key);
        await storage(
          env,
          `colorverse-classroom/${key}`,
          "POST",
          display,
          "image/webp",
        );
        await client.query(
          "UPDATE colorverse.planets SET document=$1 WHERE id=$2",
          [
            JSON.stringify({
              ...document,
              revision: revision + 1,
              media: {
                ...document.media,
                [kind]: { id: mediaId, key, bytes: display.length, requestId },
              },
            }),
            id,
          ],
        );
        commitAttempted = true;
        await client.query("COMMIT");
        uploadedKeys.length = 0;
        if (previous?.key) {
          try {
            await removeStoredImages(env, [previous.key]);
          } catch {
            console.warn("planet_media_cleanup_pending");
          }
        }
        return Response.json({ saved: true, id: mediaId });
      }
    }
    const fileMatch = /^works\/([a-f0-9-]+)\/(image|original)$/.exec(resource);
    if (fileMatch && request.method === "GET") {
      if (!z.uuid().safeParse(fileMatch[1]).success)
        throw new ClassroomFailure(404, "NOT_FOUND", "作品不存在");
      const result = await client.query(
        `SELECT w.storage_key,w.original_storage_key,w.original_mime${env.CLASSROOM_NEXT === "true" ? ",w.gallery_images" : ""} FROM colorverse.showcase_works w JOIN colorverse.planets p ON p.id=w.planet_id JOIN colorverse.enrollments e ON e.id=p.owner_enrollment_id JOIN colorverse.users u ON u.id=e.user_id WHERE w.id=$1 AND e.class_id=$2 AND e.status='active' AND u.status='active' AND (w.withdrawn_at IS NULL OR p.owner_enrollment_id=$3::uuid OR $4::boolean)`,
        [
          fileMatch[1],
          classId,
          actor.id,
          actor.role === "teacher" || actor.role === "assistant",
        ],
      );
      if (!result.rows.length)
        throw new ClassroomFailure(404, "NOT_FOUND", "作品不存在");
      const row = result.rows[0],
        original = fileMatch[2] === "original";
      const imageIndex = Number(
        new URL(request.url).searchParams.get("index") ?? 0,
      );
      if (!Number.isInteger(imageIndex) || imageIndex < 0 || imageIndex > 5)
        throw new ClassroomFailure(404, "NOT_FOUND", "图片不存在");
      if (imageIndex > 0) {
        const extra =
          env.CLASSROOM_NEXT === "true"
            ? row.gallery_images?.[imageIndex - 1]
            : null;
        if (!extra) throw new ClassroomFailure(404, "NOT_FOUND", "图片不存在");
        row.storage_key = extra.displayKey;
        row.original_storage_key = extra.originalKey;
        row.original_mime = extra.mime;
      }
      if (original && !row.original_storage_key)
        throw new ClassroomFailure(404, "NOT_FOUND", "原图暂不可用");
      await client.query("COMMIT");
      const image = await storage(
        env,
        `colorverse-classroom/${original ? row.original_storage_key : row.storage_key}`,
      );
      return new Response(image.body, {
        headers: {
          "Content-Type": original ? row.original_mime : "image/webp",
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
          "Content-Disposition": original
            ? 'attachment; filename="artwork-original"'
            : 'inline; filename="artwork.webp"',
        },
      });
    }
    if (resource === "works" && request.method === "POST") {
      if (actor.role !== "student")
        throw new ClassroomFailure(
          403,
          "STUDENT_REQUIRED",
          "请使用学生账户提交展示作品",
        );
      // Serialize this student's writes and quotas, including simultaneous browser tabs.
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1,7301942))",
        [String(actor.id)],
      );
      const planet = (
        await client.query(
          "SELECT id,document FROM colorverse.planets WHERE owner_enrollment_id=$1",
          [actor.id],
        )
      ).rows[0];
      if (!planet)
        throw new ClassroomFailure(
          409,
          "PLANET_REQUIRED",
          "请先创建你的云端星球",
        );
      const url = new URL(request.url);
      const requestId = z.uuid().parse(url.searchParams.get("requestId"));
      const saved = await client.query(
        "SELECT id,preset_id FROM colorverse.showcase_works WHERE planet_id=$1 AND request_id=$2",
        [planet.id, requestId],
      );
      if (saved.rows.length) {
        await client.query("COMMIT");
        return Response.json({
          id: saved.rows[0].id,
          presetId: saved.rows[0].preset_id,
          created: false,
        });
      }
      let extraImages: Blob[] = [];
      let uploadBytes: Uint8Array | undefined,
        uploadMetadata:
          | { title: string; description: string; learning?: unknown }
          | undefined;
      if (
        request.headers.get("Content-Type")?.startsWith("multipart/form-data")
      ) {
        const envelope = await readLimited(request, 8388608 + 16384);
        const form = await new Request("https://upload.invalid", {
          method: "POST",
          headers: { "Content-Type": request.headers.get("Content-Type")! },
          body: envelope as BodyInit,
        }).formData();
        if (
          [...form.keys()].some(
            (k) =>
              ![
                "image",
                "metadata",
                ...(env.CLASSROOM_NEXT === "true" ? ["images"] : []),
              ].includes(k),
          ) ||
          form.getAll("image").length !== 1 ||
          form.getAll("metadata").length !== 1
        )
          throw new ClassroomFailure(
            400,
            "INVALID_UPLOAD",
            "请提交一张图片及说明",
          );
        if (env.CLASSROOM_NEXT === "true") {
          const extras = form.getAll("images");
          if (extras.length > 5 || extras.some((f) => !(f instanceof Blob)))
            throw new ClassroomFailure(
              400,
              "INVALID_UPLOAD",
              "每次最多提交六张作品图片。",
            );
          extraImages = extras as Blob[];
        }
        const image = form.get("image"),
          metadata = form.get("metadata");
        if (
          !(image instanceof Blob) ||
          image.size > 8388608 ||
          typeof metadata !== "string" ||
          new TextEncoder().encode(metadata).length > 12288
        )
          throw new ClassroomFailure(
            400,
            "INVALID_UPLOAD",
            "图片或说明超出限制",
          );
        uploadBytes = new Uint8Array(await image.arrayBuffer());
        uploadMetadata = z
          .strictObject({
            title: z.string(),
            description: z.string().default(""),
            learning: z.unknown().optional(),
          })
          .parse(JSON.parse(metadata));
      }
      const learning = await validateWorkLearning(
        client,
        actor,
        classId,
        uploadMetadata?.learning,
      );
      if (env.CLASSROOM_NEXT === "true" && learning?.taskId) {
        if (
          !learning.publicationId ||
          !(
            await client.query(
              "SELECT 1 FROM colorverse.classroom_publications p JOIN colorverse.classroom_recipients r ON r.publication_id=p.id WHERE p.id=$1 AND p.class_id=$2 AND p.task_id=$3 AND r.enrollment_id=$4",
              [learning.publicationId, classId, learning.taskId, actor.id],
            )
          ).rows.length
        )
          throw new ClassroomFailure(
            400,
            "ASSIGNMENT_REQUIRED",
            "请选择本次布置给你的作业；自由创作请选择自由展示。",
          );
      }
      const title = z
        .string()
        .trim()
        .min(1)
        .max(120)
        .parse(uploadMetadata?.title ?? url.searchParams.get("title"));
      const description = z
        .string()
        .max(2000)
        .parse(
          uploadMetadata?.description ??
            url.searchParams.get("description") ??
            "",
        );
      const quota = (
        await client.query(
          `SELECT count(*)::int count,COALESCE(sum(byte_size+original_byte_size${env.CLASSROOM_NEXT === "true" ? "+gallery_byte_size" : ""}),0)::int bytes FROM colorverse.showcase_works WHERE planet_id=$1`,
          [planet.id],
        )
      ).rows[0];
      quota.bytes +=
        (planet.document?.media?.exterior?.bytes ?? 0) +
        (planet.document?.media?.interior?.bytes ?? 0);
      if (quota.count >= 100 || quota.bytes >= 104857600)
        throw new ClassroomFailure(
          409,
          "QUOTA_EXCEEDED",
          "试用期每颗星球最多 100 件作品、100 MB",
        );
      const bytes = uploadBytes ?? (await readLimited(request, 8388608));
      let info;
      try {
        info = imageInfo(bytes);
      } catch {
        throw new ClassroomFailure(
          400,
          "INVALID_IMAGE",
          "请选择有效的 PNG、JPEG 或 WebP 图片",
        );
      }
      if (info.width * info.height > 16000000)
        throw new ClassroomFailure(
          400,
          "IMAGE_DIMENSIONS",
          "图片像素过大，请缩小到 1600 万像素以内",
        );
      let display: Uint8Array;
      try {
        const output = await env
          .IMAGES!.input(new Blob([bytes as BlobPart]).stream())
          .transform({ width: 2048, height: 2048, fit: "scale-down" })
          .output({ format: "image/webp", quality: 90, anim: false });
        display = new Uint8Array(await output.response().arrayBuffer());
      } catch {
        throw new ClassroomFailure(
          400,
          "IMAGE_DECODE_FAILED",
          "图片无法完整读取，请换一张有效图片",
        );
      }
      if (
        display.length > 8388608 ||
        quota.bytes + display.length + bytes.length > 104857600
      )
        throw new ClassroomFailure(
          409,
          "QUOTA_EXCEEDED",
          "图片或星球存储空间超过试用上限",
        );
      const id = crypto.randomUUID(),
        preset =
          GrowthPresetIds[
            crypto.getRandomValues(new Uint32Array(1))[0] %
              GrowthPresetIds.length
          ];
      const displayKey = `${identity.subject}/${id}.webp`,
        originalKey = `${identity.subject}/${id}-original.${info.mimeType.split("/")[1]}`;
      uploadedKeys.push(displayKey, originalKey);
      await storage(
        env,
        `colorverse-classroom/${originalKey}`,
        "POST",
        bytes,
        info.mimeType,
      );
      await storage(
        env,
        `colorverse-classroom/${displayKey}`,
        "POST",
        display,
        "image/webp",
      );
      const occupied = (
        await client.query(
          "SELECT element_params FROM colorverse.showcase_works WHERE planet_id=$1",
          [planet.id],
        )
      ).rows.map((r) => r.element_params as { x: number; y: number });
      const placement = nextGrowthPlacement(occupied);
      const digest = Array.from(
        new Uint8Array(
          await crypto.subtle.digest("SHA-256", bytes as BufferSource),
        ),
        (b) => b.toString(16).padStart(2, "0"),
      ).join("");
      await client.query(
        "INSERT INTO colorverse.showcase_works(id,planet_id,title,description,storage_key,byte_size,preset_id,request_id,original_storage_key,original_byte_size,original_mime,original_sha256,element_params,learning_context,color) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)",
        [
          id,
          planet.id,
          title,
          description,
          displayKey,
          display.length,
          preset,
          requestId,
          originalKey,
          bytes.length,
          info.mimeType,
          digest,
          JSON.stringify(placement),
          learning ? JSON.stringify(learning) : null,
          growthElementColor(planet.document.color, occupied.length),
        ],
      );
      if (extraImages.length) {
        const gallery: {
          displayKey: string;
          originalKey: string;
          mime: string;
        }[] = [];
        let galleryBytes = 0;
        for (let i = 0; i < extraImages.length; i++) {
          const raw = new Uint8Array(await extraImages[i].arrayBuffer());
          let infoExtra;
          try {
            infoExtra = imageInfo(raw);
          } catch {
            throw new ClassroomFailure(
              400,
              "INVALID_IMAGE",
              "附加图片不是有效的 PNG、JPEG 或 WebP。",
            );
          }
          if (infoExtra.width * infoExtra.height > 16000000)
            throw new ClassroomFailure(
              400,
              "IMAGE_DIMENSIONS",
              "每张图片最多1600万像素。",
            );
          const output = await env
            .IMAGES!.input(new Blob([raw as BlobPart]).stream())
            .transform({ width: 2048, height: 2048, fit: "scale-down" })
            .output({ format: "image/webp", quality: 90, anim: false });
          const decoded = new Uint8Array(await output.response().arrayBuffer());
          galleryBytes += raw.length + decoded.length;
          if (
            quota.bytes + bytes.length + display.length + galleryBytes >
            104857600
          )
            throw new ClassroomFailure(
              409,
              "QUOTA_EXCEEDED",
              "星球素材空间已达上限。",
            );
          const displayKey = `${identity.subject}/${id}-gallery-${i + 1}.webp`,
            originalKey = `${identity.subject}/${id}-gallery-${i + 1}-original.${infoExtra.mimeType.split("/")[1]}`;
          uploadedKeys.push(displayKey, originalKey);
          await storage(
            env,
            `colorverse-classroom/${originalKey}`,
            "POST",
            raw,
            infoExtra.mimeType,
          );
          await storage(
            env,
            `colorverse-classroom/${displayKey}`,
            "POST",
            decoded,
            "image/webp",
          );
          gallery.push({ displayKey, originalKey, mime: infoExtra.mimeType });
        }
        await client.query(
          "UPDATE colorverse.showcase_works SET gallery_images=$1,gallery_byte_size=$2 WHERE id=$3",
          [JSON.stringify(gallery), galleryBytes, id],
        );
      }
      if (env.CLASSROOM_NEXT === "true" && learning?.publicationId)
        await client.query(
          "UPDATE colorverse.showcase_works SET publication_id=$1 WHERE id=$2",
          [learning.publicationId, id],
        );
      commitAttempted = true;
      await client.query("COMMIT");
      uploadedKeys.length = 0;
      return Response.json({ id, presetId: preset, created: true });
    }
    const description = /^works\/([a-f0-9-]+)\/description$/.exec(resource);
    if (description && request.method === "PUT") {
      const input = z
        .strictObject({
          description: z.string().trim().max(2000),
          revision: z.number().int().nonnegative(),
        })
        .parse(
          JSON.parse(
            new TextDecoder().decode(await readLimited(request, 12288)),
          ),
        );
      const result = await client.query(
        `UPDATE colorverse.showcase_works w SET description=$1,revision=w.revision+1${env.CLASSROOM_NEXT === "true" ? ",submission_revision=w.submission_revision+CASE WHEN w.description IS DISTINCT FROM $1 THEN 1 ELSE 0 END,submission_history=w.submission_history||CASE WHEN w.description IS DISTINCT FROM $1 THEN jsonb_build_array(jsonb_build_object('revision',w.submission_revision,'description',w.description,'title',w.title,'savedAt',now())) ELSE '[]'::jsonb END" : ""}
         FROM colorverse.planets p JOIN colorverse.enrollments e ON e.id=p.owner_enrollment_id
         WHERE w.id=$2 AND w.planet_id=p.id AND e.id=$3 AND e.class_id=$4
           AND w.revision=$5 AND w.withdrawn_at IS NULL RETURNING w.id,w.revision`,
        [
          input.description,
          z.uuid().parse(description[1]),
          actor.id,
          classId,
          input.revision,
        ],
      );
      if (!result.rows.length)
        throw new ClassroomFailure(
          409,
          "WORK_CONFLICT",
          "作品已更新或不属于你，请刷新后再试",
        );
      await client.query("COMMIT");
      return Response.json({ saved: true, revision: result.rows[0].revision });
    }
    const element = /^works\/([a-f0-9-]+)\/element$/.exec(resource);
    if (element && request.method === "PUT") {
      const id = z.uuid().parse(element[1]),
        input = elementInput.parse(
          JSON.parse(
            new TextDecoder().decode(await readLimited(request, 2048)),
          ),
        );
      const result = await client.query(
        "UPDATE colorverse.showcase_works w SET preset_id=$1,color=$2,element_params=$5,element_edited=true,revision=revision+1 FROM colorverse.planets p JOIN colorverse.enrollments e ON e.id=p.owner_enrollment_id WHERE w.planet_id=p.id AND w.id=$3 AND (p.owner_enrollment_id=$4 OR $8::boolean) AND e.class_id=$7 AND e.status='active' AND w.revision=$6 AND w.withdrawn_at IS NULL RETURNING w.id",
        [
          input.presetId,
          input.color,
          id,
          actor.id,
          JSON.stringify({
            x: input.x,
            y: input.y,
            size: input.size,
            motion: input.motion,
          }),
          input.revision,
          classId,
          actor.role === "teacher" || actor.role === "assistant",
        ],
      );
      if (!result.rows.length)
        throw new ClassroomFailure(
          409,
          "ELEMENT_CONFLICT",
          "元素已更新或不属于你，请刷新后再试",
        );
      await client.query("COMMIT");
      return Response.json({ saved: true });
    }
    const visibility = /^works\/([a-f0-9-]+)\/visibility$/.exec(resource);
    if (visibility && request.method === "PUT") {
      const input = z
        .strictObject({
          withdrawn: z.boolean(),
          revision: z.number().int().nonnegative(),
        })
        .safeParse(await request.json().catch(() => null));
      if (!input.success)
        throw new ClassroomFailure(400, "INVALID_VISIBILITY", "作品状态无效");
      const staff = actor.role === "teacher" || actor.role === "assistant";
      const result = await client.query(
        `UPDATE colorverse.showcase_works w SET withdrawn_at=CASE WHEN $1 THEN now() ELSE NULL END,withdrawn_by=CASE WHEN $1 THEN $2::uuid ELSE NULL END,revision=w.revision+1
         FROM colorverse.planets p JOIN colorverse.enrollments e ON e.id=p.owner_enrollment_id JOIN colorverse.users u ON u.id=e.user_id
         WHERE w.planet_id=p.id AND w.id=$3 AND e.class_id=$4 AND e.status='active' AND u.status='active'
           AND (p.owner_enrollment_id=$2 OR $5::boolean) AND w.revision=$6
           AND (w.withdrawn_at IS NOT NULL)<>$1
           AND ($1 OR w.withdrawn_by=p.owner_enrollment_id OR $5::boolean)
         RETURNING w.id,w.revision`,
        [
          input.data.withdrawn,
          actor.id,
          visibility[1],
          classId,
          staff,
          input.data.revision,
        ],
      );
      if (!result.rows.length)
        throw new ClassroomFailure(
          409,
          "VISIBILITY_CONFLICT",
          "状态已变化或你无权操作，请关闭作品并刷新；教师撤下的作品需由教师恢复",
        );
      await client.query("COMMIT");
      return Response.json({ saved: true, ...result.rows[0] });
    }
    const removal = /^interactions\/([a-f0-9-]+)$/.exec(resource);
    if (removal && request.method === "DELETE") {
      const result = await client.query(
        `DELETE FROM colorverse.classroom_interactions i USING colorverse.planets p,colorverse.enrollments e
         WHERE i.id=$1 AND i.planet_id=p.id AND e.id=p.owner_enrollment_id AND e.class_id=$2
           AND e.status='active' AND (i.actor_enrollment_id=$3 OR ($4::boolean AND i.kind='comment')) RETURNING i.id`,
        [
          removal[1],
          classId,
          actor.id,
          actor.role === "teacher" || actor.role === "assistant",
        ],
      );
      if (!result.rows.length)
        throw new ClassroomFailure(
          404,
          "INTERACTION_NOT_FOUND",
          "互动已移除或你无权操作",
        );
      await client.query("COMMIT");
      return Response.json({ removed: true });
    }
    if (resource === "interactions" && request.method === "POST") {
      const input = z
        .strictObject({
          planetId: z.uuid(),
          workId: z.uuid().nullable(),
          kind: z.enum(["like", "emoji", "comment"]),
          content: z.string().trim().max(500),
          requestId: z.uuid(),
          observation: PeerObservationSchema.optional(),
        })
        .parse(
          JSON.parse(
            new TextDecoder().decode(await readLimited(request, 12288)),
          ),
        );
      if (input.kind === "comment" && !input.content)
        throw new ClassroomFailure(400, "EMPTY_COMMENT", "留言不能为空");
      if (
        input.kind === "emoji" &&
        !["✨", "💙", "👏", "🔥", "🌈"].includes(input.content)
      )
        throw new ClassroomFailure(400, "INVALID_EMOJI", "请选择提供的表情");
      const target = (
        await client.query(
          "SELECT p.id,p.owner_enrollment_id FROM colorverse.planets p JOIN colorverse.enrollments e ON e.id=p.owner_enrollment_id JOIN colorverse.users u ON u.id=e.user_id WHERE p.id=$1 AND e.class_id=$2 AND e.status='active' AND u.status='active' AND (p.owner_enrollment_id<>$3 OR $4::boolean)",
          [input.planetId, classId, actor.id, input.kind === "comment"],
        )
      ).rows[0];
      if (!target)
        throw new ClassroomFailure(
          403,
          "OTHER_PLANET_REQUIRED",
          "请选择本班其他同学的星球",
        );
      if (input.observation && target.owner_enrollment_id === actor.id)
        throw new ClassroomFailure(
          403,
          "OTHER_PLANET_REQUIRED",
          "教学观察用于其他同学的课堂作品",
        );
      if (
        input.workId &&
        !(
          await client.query(
            "SELECT id FROM colorverse.showcase_works WHERE id=$1 AND planet_id=$2 AND withdrawn_at IS NULL FOR UPDATE",
            [input.workId, input.planetId],
          )
        ).rows.length
      )
        throw new ClassroomFailure(404, "NOT_FOUND", "作品不存在");
      if (input.observation) {
        if (
          input.kind !== "comment" ||
          !input.workId ||
          actor.role !== "student"
        )
          throw new ClassroomFailure(
            400,
            "OBSERVATION_TARGET_REQUIRED",
            "教学观察用于其他同学的课堂作品",
          );
        const learningRow = (
          await client.query(
            "SELECT learning_context FROM colorverse.showcase_works WHERE id=$1",
            [input.workId],
          )
        ).rows[0];
        if (learningRow?.learning_context?.policy.allowPeerReview === false)
          throw new ClassroomFailure(
            403,
            "OBSERVATION_DISABLED",
            "此作品没有开放教学观察",
          );
      }
      const duplicate = await client.query(
        "SELECT id FROM colorverse.classroom_interactions WHERE actor_enrollment_id=$1 AND request_id=$2",
        [actor.id, input.requestId],
      );
      if (!duplicate.rows.length)
        await client.query(
          "INSERT INTO colorverse.classroom_interactions(id,actor_enrollment_id,planet_id,work_id,kind,content,request_id,learning_feedback) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT DO NOTHING",
          [
            crypto.randomUUID(),
            actor.id,
            input.planetId,
            input.workId,
            input.kind,
            input.kind === "like" ? "" : input.content,
            input.requestId,
            input.observation ? JSON.stringify(input.observation) : null,
          ],
        );
      await client.query("COMMIT");
      return Response.json({ saved: true });
    }
    if (resource === "interactions" && request.method === "GET") {
      const planetId = z
        .uuid()
        .parse(new URL(request.url).searchParams.get("planetId"));
      const result = await client.query(
        `WITH visible AS (
          SELECT i.id,i.kind,i.content,i.work_id,i.learning_feedback,i.created_at,u.display_name,(i.actor_enrollment_id=$3::uuid) own,(i.actor_enrollment_id=$3::uuid OR ($4::boolean AND i.kind='comment')) can_remove FROM colorverse.classroom_interactions i JOIN colorverse.enrollments actor ON actor.id=i.actor_enrollment_id JOIN colorverse.users u ON u.id=actor.user_id JOIN colorverse.planets p ON p.id=i.planet_id JOIN colorverse.enrollments owner ON owner.id=p.owner_enrollment_id LEFT JOIN colorverse.showcase_works w ON w.id=i.work_id WHERE p.id=$1 AND owner.class_id=$2 AND owner.status='active' AND (i.work_id IS NULL OR w.withdrawn_at IS NULL)
        ) SELECT * FROM visible WHERE id IN (SELECT id FROM visible ORDER BY created_at DESC,id DESC LIMIT 200) OR (own AND kind IN ('like','emoji')) ORDER BY created_at DESC,id DESC`,
        [
          planetId,
          classId,
          actor.id,
          actor.role === "teacher" || actor.role === "assistant",
        ],
      );
      const counts = (
        await client.query(
          `SELECT i.work_id "workId",count(*) FILTER(WHERE i.kind='like')::int likes FROM colorverse.classroom_interactions i JOIN colorverse.planets p ON p.id=i.planet_id JOIN colorverse.enrollments e ON e.id=p.owner_enrollment_id LEFT JOIN colorverse.showcase_works w ON w.id=i.work_id WHERE i.planet_id=$1 AND e.class_id=$2 AND e.status='active' AND (i.work_id IS NULL OR w.withdrawn_at IS NULL) GROUP BY i.work_id`,
          [planetId, classId],
        )
      ).rows;
      await client.query("COMMIT");
      return Response.json({ interactions: result.rows, counts });
    }
    throw new ClassroomFailure(405, "METHOD_NOT_ALLOWED", "请求方式无效");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    if (uploadedKeys.length && !commitAttempted)
      await removeStoredImages(env, uploadedKeys).catch(() => {});
    if (error instanceof z.ZodError || error instanceof SyntaxError)
      throw new ClassroomFailure(
        400,
        "INVALID_INPUT",
        "填写内容无效，请检查后重试",
      );
    throw error;
  } finally {
    await client.end();
  }
}
