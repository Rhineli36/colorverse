import { awardCountSkins, skinCountProgress } from "./classroom-skin-counts";
import { z } from "zod";
import { classroomActor, ClassroomFailure } from "./classroom";
import type { EnrollmentSql } from "./enrollment";
import type { VerifiedIdentity } from "./auth";

const input = z.strictObject({
  frameId: z
    .enum([
      "silver",
      "gold",
      "sapphire",
      "emerald",
      "glass",
      "floral",
      "winter",
    ])
    .nullable(),
  placement: z.strictObject({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    amplitude: z.enum(["still", "gentle", "expressive"]),
  }),
  options: z.strictObject({
    palette: z.enum(["gold", "moon", "rose"]).optional(),
    particles: z.boolean(),
    lantern: z.boolean(),
  }),
  revision: z.number().int().nonnegative(),
});

export async function classroomDecorations(
  sql: EnrollmentSql,
  identity: VerifiedIdentity,
  classId: string,
  method: string,
  planetId: string | null,
  body?: unknown,
) {
  const actor = await classroomActor(sql, identity, classId);
  if (!["GET", "PUT"].includes(method))
    throw new ClassroomFailure(405, "METHOD_NOT_ALLOWED", "请求方式无效");
  const planet = (
    await sql.query(
      `SELECT p.id,p.owner_enrollment_id,p.document->>'visible' visible FROM colorverse.planets p JOIN colorverse.enrollments e ON e.id=p.owner_enrollment_id WHERE e.class_id=$1 AND e.status='active' AND ${planetId ? "p.id=$2::uuid" : "p.owner_enrollment_id=$2::uuid"}`,
      [classId, planetId ?? actor.id],
    )
  ).rows[0];
  if (!planet)
    throw new ClassroomFailure(
      404,
      "PLANET_NOT_FOUND",
      "请先创建星球，或该星球已不可访问",
    );
  const own = planet.owner_enrollment_id === actor.id;
  if (
    !own &&
    planet.visible === "false" &&
    !["teacher", "assistant"].includes(String(actor.role))
  )
    throw new ClassroomFailure(404, "PLANET_NOT_FOUND", "星球不可访问");
  if (method === "PUT" && (!own || actor.role !== "student"))
    throw new ClassroomFailure(
      403,
      "OWNER_REQUIRED",
      "只能为自己的星球保存装扮",
    );
  const countEvidence =
    own && actor.role === "student"
      ? (await awardCountSkins(sql, classId, [String(actor.id)])).get(
          String(actor.id),
        )
      : undefined;
  // A stable class/task binding, never a title match. Current-version numerical
  // teacher grades (including zero) qualify; comments alone and stale grades do not.
  if (own && actor.role === "student")
    await sql.query(
      `
    INSERT INTO colorverse.classroom_skin_unlocks(enrollment_id,skin_id,proof_work_id)
    SELECT $1,b.skin_id,w.id FROM colorverse.classroom_skin_bindings b
    JOIN colorverse.classroom_publications pub ON pub.class_id=b.class_id AND pub.task_id=b.task_id
    JOIN colorverse.classroom_recipients recipient ON recipient.publication_id=pub.id AND recipient.enrollment_id=$1
    JOIN colorverse.showcase_works w ON w.publication_id=pub.id AND w.planet_id=$2 AND w.withdrawn_at IS NULL
    JOIN colorverse.showcase_reviews r ON r.work_id=w.id AND r.source='teacher' AND r.score IS NOT NULL AND r.submission_revision=w.submission_revision
    WHERE b.class_id=$3 AND b.skin_id='winter'
    ON CONFLICT(enrollment_id,skin_id) DO NOTHING`,
      [actor.id, planet.id, classId],
    );
  const unlocked = own
    ? (
        await sql.query(
          "SELECT skin_id FROM colorverse.classroom_skin_unlocks WHERE enrollment_id=$1",
          [actor.id],
        )
      ).rows.map((r) => String(r.skin_id))
    : [];
  if (method === "PUT") {
    const v = input.parse(body);
    if (v.frameId && !unlocked.includes(v.frameId))
      throw new ClassroomFailure(
        403,
        "SKIN_LOCKED",
        "这款装扮尚未解锁，可以先试戴",
      );
    await sql.query(
      "SELECT pg_advisory_xact_lock(hashtextextended($1,7301960))",
      [planet.id],
    );
    const current = (
      await sql.query(
        "SELECT revision FROM colorverse.classroom_skin_settings WHERE planet_id=$1",
        [planet.id],
      )
    ).rows[0];
    if (Number(current?.revision ?? 0) !== v.revision)
      throw new ClassroomFailure(
        409,
        "SKIN_CONFLICT",
        "装扮已在其他页面更新，请重新读取后保存",
      );
    await sql.query(
      `INSERT INTO colorverse.classroom_skin_settings(planet_id,frame_id,placement,options,revision) VALUES($1,$2,$3,$4,1)
      ON CONFLICT(planet_id) DO UPDATE SET frame_id=EXCLUDED.frame_id,placement=EXCLUDED.placement,options=EXCLUDED.options,revision=classroom_skin_settings.revision+1,updated_at=now()`,
      [
        planet.id,
        v.frameId,
        JSON.stringify(v.placement),
        JSON.stringify(v.options),
      ],
    );
  }
  const settings = (
    await sql.query(
      "SELECT frame_id,placement,options,revision FROM colorverse.classroom_skin_settings WHERE planet_id=$1",
      [planet.id],
    )
  ).rows[0];
  const bindings = own
    ? (
        await sql.query(
          "SELECT b.skin_id,b.task_id,t.definition->>'title' title FROM colorverse.classroom_skin_bindings b JOIN colorverse.learning_task_settings t ON t.class_id=b.class_id AND t.task_id=b.task_id WHERE b.class_id=$1",
          [classId],
        )
      ).rows
    : [];
  return {
    planetId: String(planet.id),
    unlocked,
    bindings,
    progress: skinCountProgress(countEvidence),
    settings: {
      frameId: settings?.frame_id ?? null,
      placement: settings?.placement ?? {
        x: 0.85,
        y: 0.35,
        amplitude: "gentle",
      },
      options: settings?.options ?? { particles: true, lantern: true },
      revision: Number(settings?.revision ?? 0),
    },
  };
}
