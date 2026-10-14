import { databaseClient } from "./database-client";
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
  const client = databaseClient(env.HYPERDRIVE, 6000);
  try {
    await client.connect();
    return await classroomOverview(client, identity, classId);
  } finally {
    await client.end();
  }
}
