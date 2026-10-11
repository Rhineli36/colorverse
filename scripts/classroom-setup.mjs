import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { readDatabaseConfig, connectDatabase } from "./supabase-database.mjs";
let client;
try {
  const config = await readDatabaseConfig();
  client = await connectDatabase(config);
  const migration = await readFile(
      "apps/api/migrations/002-classroom-showcase.sql",
      "utf8",
    ),
    hash = createHash("sha256").update(migration).digest("hex");
  await client.query("BEGIN");
  await client.query("SELECT pg_advisory_xact_lock(7301941)");
  await client.query("SET LOCAL search_path=colorverse,pg_catalog");
  const applied = await client.query(
    "SELECT sha256 FROM course_migrations WHERE version=2",
  );
  if (applied.rows.length && applied.rows[0].sha256 !== hash)
    throw new Error("MIGRATION_HASH_MISMATCH");
  if (!applied.rows.length) {
    await client.query(migration);
    await client.query(
      "INSERT INTO course_migrations(version,sha256) VALUES(2,$1)",
      [hash],
    );
  }
  await client.query(
    "REVOKE ALL ON ALL TABLES IN SCHEMA colorverse FROM PUBLIC,anon,authenticated",
  );
  await client.query(
    "GRANT SELECT ON colorverse.planets,colorverse.showcase_works,colorverse.classroom_interactions,colorverse.submissions,colorverse.submission_versions TO colorverse_identity_reader",
  );
  await client.query("COMMIT");
  const extra = await readFile(
    "apps/api/migrations/003-showcase-originals.sql",
    "utf8",
  );
  const extraHash = createHash("sha256").update(extra).digest("hex");
  await client.query("BEGIN");
  await client.query("SELECT pg_advisory_xact_lock(7301941)");
  await client.query("SET LOCAL search_path=colorverse,pg_catalog");
  const extraApplied = await client.query(
    "SELECT sha256 FROM course_migrations WHERE version=3",
  );
  if (extraApplied.rows.length && extraApplied.rows[0].sha256 !== extraHash)
    throw new Error("MIGRATION_HASH_MISMATCH");
  if (!extraApplied.rows.length) {
    await client.query(extra);
    await client.query(
      "INSERT INTO course_migrations(version,sha256) VALUES(3,$1)",
      [extraHash],
    );
  }
  await client.query("COMMIT");
  const counts = await client.query(
    "SELECT count(*)::int AS students FROM colorverse.enrollments WHERE role='student' AND status='active'",
  );
  await writeFile(
    "outputs/classroom-setup.json",
    JSON.stringify(
      { status: "classroom_statistics_ready", ...counts.rows[0] },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify({ status: "classroom_statistics_ready", ...counts.rows[0] }),
  );
} catch (error) {
  if (client) await client.query("ROLLBACK").catch(() => {});
  console.error(
    JSON.stringify({
      status: "failed",
      code: /^[A-Z0-9_]{1,50}$/.test(error.code ?? error.message)
        ? (error.code ?? error.message)
        : "CLASSROOM_SETUP_FAILED",
    }),
  );
  process.exitCode = 1;
} finally {
  await client?.end();
}
