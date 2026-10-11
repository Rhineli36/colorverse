import { Client } from "pg";
import { z } from "zod";
import { GrowthPresetIds } from "@colorverse/contracts";
import { imageInfo } from "@colorverse/package-io";
import type { VerifiedIdentity } from "./auth";
import type { AuthEnvironment } from "./auth";
import { classroomActor, ClassroomFailure } from "./classroom";
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
  HYPERDRIVE_WRITER?: { connectionString: string };
  SUPABASE_SECRET_KEY?: string;
  IMAGES?: ImagesBinding;
}
const planetInput = z.strictObject({
  name: z.string().trim().min(1).max(60),
  color: z.string().regex(/^#[a-f0-9]{6}$/i),
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
export async function handleShowcaseCloud(
  request: Request,
  env: ShowcaseCloudEnvironment,
  identity: VerifiedIdentity,
  classId: string,
  resource: string,
  clientFactory: () => Pick<Client, "connect" | "query" | "end"> = () =>
    new Client({
      connectionString: env.HYPERDRIVE_WRITER!.connectionString,
      connectionTimeoutMillis: 4000,
      query_timeout: 8000,
    }),
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
    if (resource === "planets" && request.method === "GET") {
      const rows = await client.query(
        `SELECT p.id,p.owner_enrollment_id,u.display_name,p.document, COALESCE((SELECT jsonb_agg(jsonb_build_object('id',w.id,'title',w.title,'description',w.description,'presetId',w.preset_id,'color',w.color,'createdAt',w.created_at,'params',w.element_params,'revision',w.revision) ORDER BY w.created_at) FROM colorverse.showcase_works w WHERE w.planet_id=p.id),'[]'::jsonb) works FROM colorverse.planets p JOIN colorverse.enrollments e ON e.id=p.owner_enrollment_id JOIN colorverse.users u ON u.id=e.user_id WHERE e.class_id=$1 AND e.status='active' AND u.status='active' ORDER BY u.display_name`,
        [classId],
      );
      await client.query("COMMIT");
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
        JSON.parse(new TextDecoder().decode(await readLimited(request, 2048))),
      );
      const result = await client.query(
        "INSERT INTO colorverse.planets(id,owner_enrollment_id,document) VALUES($1,$2,$3) ON CONFLICT(owner_enrollment_id) DO NOTHING RETURNING id",
        [
          crypto.randomUUID(),
          actor.id,
          JSON.stringify({
            metadata: { name: input.name },
            color: input.color,
          }),
        ],
      );
      await client.query("COMMIT");
      return Response.json({ created: result.rows.length > 0 });
    }
    const fileMatch = /^works\/([a-f0-9-]+)\/(image|original)$/.exec(resource);
    if (fileMatch && request.method === "GET") {
      if (!z.uuid().safeParse(fileMatch[1]).success)
        throw new ClassroomFailure(404, "NOT_FOUND", "作品不存在");
      const result = await client.query(
        "SELECT w.storage_key,w.original_storage_key,w.original_mime FROM colorverse.showcase_works w JOIN colorverse.planets p ON p.id=w.planet_id JOIN colorverse.enrollments e ON e.id=p.owner_enrollment_id JOIN colorverse.users u ON u.id=e.user_id WHERE w.id=$1 AND e.class_id=$2 AND e.status='active' AND u.status='active'",
        [fileMatch[1], classId],
      );
      if (!result.rows.length)
        throw new ClassroomFailure(404, "NOT_FOUND", "作品不存在");
      const row = result.rows[0],
        original = fileMatch[2] === "original";
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
          "SELECT id FROM colorverse.planets WHERE owner_enrollment_id=$1",
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
      const title = z
        .string()
        .trim()
        .min(1)
        .max(120)
        .parse(url.searchParams.get("title"));
      const description = z
        .string()
        .max(2000)
        .parse(url.searchParams.get("description") ?? "");
      const quota = (
        await client.query(
          "SELECT count(*)::int count,COALESCE(sum(byte_size+original_byte_size),0)::int bytes FROM colorverse.showcase_works WHERE planet_id=$1",
          [planet.id],
        )
      ).rows[0];
      if (quota.count >= 100 || quota.bytes >= 104857600)
        throw new ClassroomFailure(
          409,
          "QUOTA_EXCEEDED",
          "试用期每颗星球最多 100 件作品、100 MB",
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
      const digest = Array.from(
        new Uint8Array(
          await crypto.subtle.digest("SHA-256", bytes as BufferSource),
        ),
        (b) => b.toString(16).padStart(2, "0"),
      ).join("");
      await client.query(
        "INSERT INTO colorverse.showcase_works(id,planet_id,title,description,storage_key,byte_size,preset_id,request_id,original_storage_key,original_byte_size,original_mime,original_sha256,element_params) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)",
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
          JSON.stringify({
            x: 0.18 + (Number(quota.count) % 5) * 0.15,
            y: 0.55 + (Math.floor(Number(quota.count) / 5) % 3) * 0.12,
            size: 0.65,
            motion: "float",
          }),
        ],
      );
      commitAttempted = true;
      await client.query("COMMIT");
      uploadedKeys.length = 0;
      return Response.json({ id, presetId: preset, created: true });
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
        "UPDATE colorverse.showcase_works w SET preset_id=$1,color=$2,element_params=$5,revision=revision+1 FROM colorverse.planets p WHERE w.planet_id=p.id AND w.id=$3 AND p.owner_enrollment_id=$4 AND w.revision=$6 RETURNING w.id",
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
    if (resource === "interactions" && request.method === "POST") {
      const input = z
        .strictObject({
          planetId: z.uuid(),
          workId: z.uuid().nullable(),
          kind: z.enum(["like", "emoji", "comment"]),
          content: z.string().trim().max(500),
          requestId: z.uuid(),
        })
        .parse(
          JSON.parse(
            new TextDecoder().decode(await readLimited(request, 4096)),
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
          "SELECT p.id FROM colorverse.planets p JOIN colorverse.enrollments e ON e.id=p.owner_enrollment_id JOIN colorverse.users u ON u.id=e.user_id WHERE p.id=$1 AND e.class_id=$2 AND e.status='active' AND u.status='active' AND p.owner_enrollment_id<>$3",
          [input.planetId, classId, actor.id],
        )
      ).rows[0];
      if (!target)
        throw new ClassroomFailure(
          403,
          "OTHER_PLANET_REQUIRED",
          "请选择本班其他同学的星球",
        );
      if (
        input.workId &&
        !(
          await client.query(
            "SELECT id FROM colorverse.showcase_works WHERE id=$1 AND planet_id=$2",
            [input.workId, input.planetId],
          )
        ).rows.length
      )
        throw new ClassroomFailure(404, "NOT_FOUND", "作品不存在");
      const duplicate = await client.query(
        "SELECT id FROM colorverse.classroom_interactions WHERE actor_enrollment_id=$1 AND request_id=$2",
        [actor.id, input.requestId],
      );
      if (!duplicate.rows.length)
        await client.query(
          "INSERT INTO colorverse.classroom_interactions(id,actor_enrollment_id,planet_id,work_id,kind,content,request_id) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING",
          [
            crypto.randomUUID(),
            actor.id,
            input.planetId,
            input.workId,
            input.kind,
            input.kind === "like" ? "" : input.content,
            input.requestId,
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
        "SELECT i.id,i.kind,i.content,i.work_id,i.created_at,u.display_name FROM colorverse.classroom_interactions i JOIN colorverse.enrollments actor ON actor.id=i.actor_enrollment_id JOIN colorverse.users u ON u.id=actor.user_id JOIN colorverse.planets p ON p.id=i.planet_id JOIN colorverse.enrollments owner ON owner.id=p.owner_enrollment_id WHERE p.id=$1 AND owner.class_id=$2 AND owner.status='active' ORDER BY i.created_at DESC LIMIT 200",
        [planetId, classId],
      );
      await client.query("COMMIT");
      return Response.json({ interactions: result.rows });
    }
    throw new ClassroomFailure(405, "METHOD_NOT_ALLOWED", "请求方式无效");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    if (uploadedKeys.length && !commitAttempted)
      await fetch(
        `${env.SUPABASE_URL}/storage/v1/object/colorverse-classroom`,
        {
          method: "DELETE",
          headers: {
            apikey: env.SUPABASE_SECRET_KEY!,
            Authorization: `Bearer ${env.SUPABASE_SECRET_KEY!}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ prefixes: uploadedKeys }),
          signal: AbortSignal.timeout(10000),
        },
      ).catch(() => {});
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
