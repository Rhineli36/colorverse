import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { readDatabaseConfig, connectDatabase } from "./supabase-database.mjs";
import { applyRuntimeGrants } from "./database-access.mjs";
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
  const withdrawal = await readFile(
    "apps/api/migrations/004-showcase-withdrawal.sql",
    "utf8",
  );
  const withdrawalHash = createHash("sha256").update(withdrawal).digest("hex");
  await client.query("BEGIN");
  await client.query("SELECT pg_advisory_xact_lock(7301941)");
  await client.query("SET LOCAL search_path=colorverse,pg_catalog");
  const fourth = await client.query(
    "SELECT sha256 FROM course_migrations WHERE version=4",
  );
  if (fourth.rows.length && fourth.rows[0].sha256 !== withdrawalHash)
    throw new Error("MIGRATION_HASH_MISMATCH");
  if (!fourth.rows.length) {
    await client.query(withdrawal);
    await client.query(
      "INSERT INTO course_migrations(version,sha256) VALUES(4,$1)",
      [withdrawalHash],
    );
  }
  await client.query("COMMIT");
  const reviews = await readFile(
    "apps/api/migrations/005-showcase-reviews.sql",
    "utf8",
  );
  const reviewsHash = createHash("sha256").update(reviews).digest("hex");
  await client.query("BEGIN");
  await client.query("SELECT pg_advisory_xact_lock(7301941)");
  await client.query("SET LOCAL search_path=colorverse,pg_catalog");
  const fifth = await client.query(
    "SELECT sha256 FROM course_migrations WHERE version=5",
  );
  if (fifth.rows.length && fifth.rows[0].sha256 !== reviewsHash)
    throw new Error("MIGRATION_HASH_MISMATCH");
  if (!fifth.rows.length) {
    await client.query(reviews);
    await client.query(
      "INSERT INTO course_migrations(version,sha256) VALUES(5,$1)",
      [reviewsHash],
    );
  }
  await client.query(
    "REVOKE ALL ON colorverse.showcase_reviews FROM PUBLIC,anon,authenticated",
  );
  await client.query(
    "GRANT SELECT ON colorverse.showcase_reviews TO colorverse_identity_reader",
  );
  if (
    (
      await client.query(
        "SELECT 1 FROM pg_roles WHERE rolname='colorverse_classroom_writer'",
      )
    ).rows.length
  )
    await client.query(
      "GRANT SELECT,INSERT ON colorverse.showcase_reviews TO colorverse_classroom_writer",
    );
  await client.query("COMMIT");
  const learning = await readFile(
      "apps/api/migrations/006-learning-context.sql",
      "utf8",
    ),
    learningHash = createHash("sha256").update(learning).digest("hex");
  await client.query("BEGIN");
  await client.query("SELECT pg_advisory_xact_lock(7301941)");
  await client.query("SET LOCAL search_path=colorverse,pg_catalog");
  const sixth = await client.query(
    "SELECT sha256 FROM course_migrations WHERE version=6",
  );
  if (sixth.rows.length && sixth.rows[0].sha256 !== learningHash)
    throw new Error("MIGRATION_HASH_MISMATCH");
  if (!sixth.rows.length) {
    await client.query(learning);
    await client.query(
      "INSERT INTO course_migrations(version,sha256) VALUES(6,$1)",
      [learningHash],
    );
  }
  await client.query(
    "REVOKE ALL ON colorverse.learning_task_settings FROM PUBLIC,anon,authenticated",
  );
  await client.query(
    "GRANT SELECT ON colorverse.learning_task_settings TO colorverse_identity_reader",
  );
  if (
    (
      await client.query(
        "SELECT 1 FROM pg_roles WHERE rolname='colorverse_classroom_writer'",
      )
    ).rows.length
  )
    await client.query(
      "GRANT SELECT,INSERT,UPDATE ON colorverse.learning_task_settings TO colorverse_classroom_writer",
    );
  await client.query("COMMIT");
  const customTasks = await readFile(
    "apps/api/migrations/007-custom-assignments.sql",
    "utf8",
  );
  const customHash = createHash("sha256").update(customTasks).digest("hex");
  await client.query("BEGIN");
  await client.query("SELECT pg_advisory_xact_lock(7301941)");
  await client.query("SET LOCAL search_path=colorverse,pg_catalog");
  const seventh = await client.query(
    "SELECT sha256 FROM course_migrations WHERE version=7",
  );
  if (seventh.rows.length && seventh.rows[0].sha256 !== customHash)
    throw Error("MIGRATION_HASH_MISMATCH");
  if (!seventh.rows.length) {
    await client.query(customTasks);
    await client.query(
      "INSERT INTO course_migrations(version,sha256) VALUES(7,$1)",
      [customHash],
    );
  }
  await client.query("COMMIT");
  const precompetition = await readFile(
    "apps/api/migrations/008-precompetition.sql",
    "utf8",
  );
  const eighthHash = createHash("sha256").update(precompetition).digest("hex");
  await client.query("BEGIN");
  await client.query("SELECT pg_advisory_xact_lock(7301941)");
  await client.query("SET LOCAL search_path=colorverse,pg_catalog");
  const eighth = await client.query(
    "SELECT sha256 FROM course_migrations WHERE version=8",
  );
  if (eighth.rows.length && eighth.rows[0].sha256 !== eighthHash)
    throw Error("MIGRATION_HASH_MISMATCH");
  if (!eighth.rows.length) {
    await client.query(precompetition);
    await client.query(
      "INSERT INTO course_migrations(version,sha256) VALUES(8,$1)",
      [eighthHash],
    );
  }
  await client.query(
    "REVOKE ALL ON colorverse.classroom_notice_reads FROM PUBLIC,anon,authenticated",
  );
  await client.query(
    "GRANT SELECT,INSERT ON colorverse.classroom_notice_reads TO colorverse_classroom_writer",
  );
  await client.query(
    "GRANT UPDATE(display_name,student_number,real_name) ON colorverse.users TO colorverse_classroom_writer",
  );
  await client.query("COMMIT");
  const rosterMigration = await readFile(
    "apps/api/migrations/009-student-import.sql",
    "utf8",
  );
  const rosterHash = createHash("sha256").update(rosterMigration).digest("hex");
  await client.query("BEGIN");
  await client.query("SELECT pg_advisory_xact_lock(7301941)");
  await client.query("SET LOCAL search_path=colorverse,pg_catalog");
  const ninth = await client.query(
    "SELECT sha256 FROM course_migrations WHERE version=9",
  );
  if (ninth.rows.length && ninth.rows[0].sha256 !== rosterHash)
    throw Error("MIGRATION_HASH_MISMATCH");
  if (!ninth.rows.length) {
    await client.query(rosterMigration);
    await client.query(
      "INSERT INTO course_migrations(version,sha256) VALUES(9,$1)",
      [rosterHash],
    );
  }
  await client.query(
    "REVOKE ALL ON colorverse.student_accounts,colorverse.student_import_batches,colorverse.classroom_login_aliases FROM PUBLIC,anon,authenticated",
  );
  await client.query(
    "GRANT SELECT,INSERT,UPDATE ON colorverse.student_accounts,colorverse.student_import_batches TO colorverse_classroom_writer",
  );
  await client.query(
    "GRANT SELECT ON colorverse.classroom_login_aliases TO colorverse_classroom_writer",
  );
  await client.query(
    "GRANT INSERT ON colorverse.users,colorverse.enrollments TO colorverse_classroom_writer",
  );
  await client.query("COMMIT");
  const scopeMigration = await readFile(
    "apps/api/migrations/010-import-account-scope.sql",
    "utf8",
  );
  const scopeHash = createHash("sha256").update(scopeMigration).digest("hex");
  await client.query("BEGIN");
  await client.query("SELECT pg_advisory_xact_lock(7301941)");
  await client.query("SET LOCAL search_path=colorverse,pg_catalog");
  const tenth = await client.query(
    "SELECT sha256 FROM course_migrations WHERE version=10",
  );
  if (tenth.rows.length && tenth.rows[0].sha256 !== scopeHash)
    throw Error("MIGRATION_HASH_MISMATCH");
  if (!tenth.rows.length) {
    await client.query(scopeMigration);
    await client.query(
      "INSERT INTO course_migrations(version,sha256) VALUES(10,$1)",
      [scopeHash],
    );
  }
  await client.query(
    "REVOKE ALL ON colorverse.isolated_account_courses FROM PUBLIC,anon,authenticated",
  );
  await client.query(
    "GRANT SELECT ON colorverse.isolated_account_courses TO colorverse_classroom_writer",
  );
  await client.query("COMMIT");
  await applyRuntimeGrants(client);
  const studentCounts = await client.query(
    "SELECT count(*)::int AS students FROM colorverse.enrollments WHERE role='student' AND status='active'",
  );
  await writeFile(
    "outputs/classroom-setup.json",
    JSON.stringify(
      { status: "classroom_statistics_ready", ...studentCounts.rows[0] },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify({
      status: "classroom_statistics_ready",
      ...studentCounts.rows[0],
    }),
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
