import type { CloudMembership, CloudSession } from "@colorverse/contracts";
import type { VerifiedIdentity } from "./auth";

export interface EnrollmentAccess {
  access: CloudSession["access"];
  memberships: CloudMembership[];
}
export interface EnrollmentSql {
  query(
    sql: string,
    params: unknown[],
  ): Promise<{ rows: Record<string, unknown>[] }>;
}
export async function queryEnrollment(
  sql: EnrollmentSql,
  identity: VerifiedIdentity,
  schema = "colorverse",
): Promise<EnrollmentAccess> {
  // The schema is server-owned. Only isolated test schemas may override it.
  if (!/^(colorverse|test_course_[a-z0-9_]+)$/.test(schema))
    throw new Error("Invalid enrollment schema");
  const { rows } = await sql.query(
    `SELECT u.status AS user_status, e.id AS enrollment_id,
      c.id AS class_id, c.title, c.timezone, e.role
     FROM ${schema}.users u
     LEFT JOIN ${schema}.enrollments e ON e.user_id=u.id AND e.status='active'
     LEFT JOIN ${schema}.classes c ON c.id=e.class_id AND c.archived_at IS NULL
     WHERE u.auth_issuer=$1 AND u.auth_subject=$2
     ORDER BY c.title, c.id`,
    [identity.issuer, identity.subject],
  );
  if (!rows.length) return { access: "pending-enrollment", memberships: [] };
  if (rows[0].user_status !== "active")
    return { access: "blocked", memberships: [] };
  const memberships: CloudMembership[] = rows
    .filter((row) => row.class_id !== null)
    .map((row) => ({
      enrollmentId: String(row.enrollment_id),
      classId: String(row.class_id),
      title: String(row.title),
      timezone: String(row.timezone),
      role: row.role as CloudMembership["role"],
    }));
  return {
    access: memberships.length ? "active" : "pending-enrollment",
    memberships,
  };
}
