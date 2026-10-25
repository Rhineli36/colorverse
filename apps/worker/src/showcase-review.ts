import { z } from "zod";
import { ShowcaseReviewInput } from "@colorverse/contracts";
import { ClassroomFailure } from "./classroom";
import type { EnrollmentSql } from "./enrollment";

export async function showcaseReview(
  sql: EnrollmentSql,
  actor: Record<string, unknown>,
  classId: string,
  workId: string,
  method: string,
  body?: unknown,
  versioned = false,
) {
  z.uuid().parse(workId);
  const staff = actor.role === "teacher" || actor.role === "assistant";
  if (method !== "GET" && method !== "POST")
    throw new ClassroomFailure(405, "METHOD_NOT_ALLOWED", "请求方式无效");
  if (method === "POST" && !staff)
    throw new ClassroomFailure(
      403,
      "TEACHER_REQUIRED",
      "只有教师和助教可以保存点评与评分",
    );
  const work = await sql.query(
    `SELECT w.id,w.withdrawn_at${versioned ? ",w.submission_revision,w.submission_history" : ""} FROM colorverse.showcase_works w JOIN colorverse.planets p ON p.id=w.planet_id JOIN colorverse.enrollments e ON e.id=p.owner_enrollment_id JOIN colorverse.users u ON u.id=e.user_id
     WHERE w.id=$1 AND e.class_id=$2 AND e.status='active' AND u.status='active' AND (w.withdrawn_at IS NULL OR e.id=$3::uuid OR $4::boolean) ${method === "POST" ? "FOR UPDATE OF w" : ""}`,
    [workId, classId, actor.id, staff],
  );
  if (!work.rows.length)
    throw new ClassroomFailure(404, "NOT_FOUND", "作品不存在或无权查看");
  const select = `SELECT r.id,r.revision,r.score::float8 score,r.comment,r.source,r.created_at, u.display_name reviewer_name${versioned ? ",r.submission_revision" : ""}
    FROM colorverse.showcase_reviews r JOIN colorverse.enrollments e ON e.id=r.reviewer_enrollment_id JOIN colorverse.users u ON u.id=e.user_id WHERE r.work_id=$1`;
  if (method === "POST") {
    if (work.rows[0].withdrawn_at)
      throw new ClassroomFailure(
        409,
        "WORK_WITHDRAWN",
        "请先恢复作品展示，再保存点评",
      );
    const input = ShowcaseReviewInput.parse(body);
    const duplicate = await sql.query(
      "SELECT work_id,score::float8 score,comment,base_revision,source FROM colorverse.showcase_reviews WHERE reviewer_enrollment_id=$1 AND request_id=$2",
      [actor.id, input.requestId],
    );
    if (duplicate.rows.length) {
      const previous = duplicate.rows[0];
      if (
        previous.work_id !== workId ||
        previous.source !== "teacher" ||
        previous.score !== input.score ||
        previous.comment !== input.comment ||
        previous.base_revision !== input.revision
      )
        throw new ClassroomFailure(
          409,
          "REQUEST_CONFLICT",
          "重复请求的内容已改变，请刷新后再保存",
        );
    } else {
      if (
        versioned &&
        input.submissionRevision !== work.rows[0].submission_revision
      )
        throw new ClassroomFailure(
          409,
          "SUBMISSION_CHANGED",
          "作品内容已更新。评分草稿已保留，请重新读取作品并核对后保存。",
        );
      const current = await sql.query(
        "SELECT COALESCE(max(revision),0)::int revision FROM colorverse.showcase_reviews WHERE work_id=$1",
        [workId],
      );
      if (current.rows[0].revision !== input.revision)
        throw new ClassroomFailure(
          409,
          "REVIEW_CONFLICT",
          "点评已被其他教师更新。你的草稿已保留，请重新读取后核对再保存",
        );
      await sql.query(
        `INSERT INTO colorverse.showcase_reviews(id,work_id,reviewer_enrollment_id,revision,base_revision,score,comment,source,request_id${versioned ? ",submission_revision" : ""}) VALUES($1,$2,$3,$4,$5,$6,$7,'teacher',$8${versioned ? ",$9" : ""})`,
        [
          crypto.randomUUID(),
          workId,
          actor.id,
          input.revision + 1,
          input.revision,
          input.score,
          input.comment,
          input.requestId,
          ...(versioned ? [work.rows[0].submission_revision] : []),
        ],
      );
    }
  }
  const result = await sql.query(select + " ORDER BY r.revision DESC LIMIT 1", [
    workId,
  ]);
  if (versioned) {
    const latest = result.rows[0];
    const history = (
      await sql.query(select + " ORDER BY r.revision DESC", [workId])
    ).rows;
    const clean = (r: Record<string, unknown>) =>
      Object.fromEntries(
        Object.entries(r).filter(([k]) => k !== "submission_revision"),
      );
    return {
      submissionRevision: Number(work.rows[0].submission_revision),
      review:
        latest &&
        latest.submission_revision === work.rows[0].submission_revision
          ? clean(latest)
          : null,
      latestRevision: Number(latest?.revision ?? 0),
      history: history
        .filter(
          (r) => r.submission_revision !== work.rows[0].submission_revision,
        )
        .map((r) => ({
          ...clean(r),
          submissionRevision: Number(r.submission_revision),
          description:
            (
              (work.rows[0].submission_history ?? []) as {
                revision: number;
                description: string;
              }[]
            ).find((v) => v.revision === r.submission_revision)?.description ??
            null,
        })),
    };
  }
  return { review: result.rows[0] ?? null };
}
