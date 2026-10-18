import {
  StudentIdentitySchema,
  identityFromDisplayName,
} from "@colorverse/contracts";
import type { EnrollmentSql } from "./enrollment";
import { ClassroomFailure } from "./classroom";
export async function studentProfile(
  sql: EnrollmentSql,
  actor: Record<string, unknown>,
  method: string,
  body?: unknown,
) {
  if (actor.role !== "student")
    throw new ClassroomFailure(
      403,
      "STUDENT_REQUIRED",
      "仅学生账户需要填写身份",
    );
  if (method !== "GET" && method !== "PUT")
    throw new ClassroomFailure(405, "METHOD_NOT_ALLOWED", "请求方式无效");
  const row = (
    await sql.query(
      "SELECT display_name,student_number,real_name FROM colorverse.users WHERE id=$1" +
        (method === "PUT" ? " FOR UPDATE" : ""),
      [actor.user_id],
    )
  ).rows[0];
  const existing =
    row.student_number && row.real_name
      ? StudentIdentitySchema.parse({
          studentNumber: row.student_number,
          realName: row.real_name,
        })
      : identityFromDisplayName(String(row.display_name));
  if (method === "GET") return { profile: existing };
  const profile = StudentIdentitySchema.parse(body);
  if (existing) return { profile: existing };
  await sql.query(
    "UPDATE colorverse.users SET student_number=$1,real_name=$2,display_name=$3 WHERE id=$4",
    [
      profile.studentNumber,
      profile.realName,
      `${profile.realName} · 学号 ${profile.studentNumber}`,
      actor.user_id,
    ],
  );
  return { profile };
}
