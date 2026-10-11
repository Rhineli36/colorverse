import { Client } from "pg";
import type { VerifiedIdentity } from "./auth";
import { queryEnrollment } from "./enrollment";

export interface EnrollmentEnvironment {
  HYPERDRIVE?: { connectionString: string };
}
export async function resolveEnrollment(
  identity: VerifiedIdentity,
  env: EnrollmentEnvironment,
) {
  if (!env.HYPERDRIVE) return null;
  // Each request owns its client; Hyperdrive owns the connection pool. Never cache identities.
  const client = new Client({
    connectionString: env.HYPERDRIVE.connectionString,
    connectionTimeoutMillis: 4000,
    query_timeout: 4000,
  });
  try {
    await client.connect();
    return await queryEnrollment(client, identity);
  } finally {
    await client.end();
  }
}
