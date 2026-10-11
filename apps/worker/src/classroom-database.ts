import { Client } from "pg";
import type { VerifiedIdentity } from "./auth";
import type { EnrollmentEnvironment } from "./enrollment-database";
import { classroomOverview, ClassroomFailure } from "./classroom";
export async function resolveClassroomOverview(
  identity: VerifiedIdentity,
  env: EnrollmentEnvironment,
  classId: string,
) {
  if (!env.HYPERDRIVE)
    throw new ClassroomFailure(
      503,
      "CLASSROOM_UNAVAILABLE",
      "班级连接暂不可用",
    );
  const client = new Client({
    connectionString: env.HYPERDRIVE.connectionString,
    connectionTimeoutMillis: 4000,
    query_timeout: 6000,
  });
  try {
    await client.connect();
    return await classroomOverview(client, identity, classId);
  } finally {
    await client.end();
  }
}
