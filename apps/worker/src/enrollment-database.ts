import { databaseClient, type DatabaseBinding } from "./database-client";
import type { VerifiedIdentity } from "./auth";
import { queryEnrollment } from "./enrollment";

export interface EnrollmentEnvironment {
  HYPERDRIVE?: DatabaseBinding;
}
export async function resolveEnrollment(
  identity: VerifiedIdentity,
  env: EnrollmentEnvironment,
) {
  if (!env.HYPERDRIVE) return null;
  // Each request owns its client; Hyperdrive owns the connection pool. Never cache identities.
  const client = databaseClient(env.HYPERDRIVE, 4000);
  try {
    await client.connect();
    return await queryEnrollment(client, identity);
  } finally {
    await client.end();
  }
}
