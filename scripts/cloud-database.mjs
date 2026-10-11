import { readFile, writeFile } from "node:fs/promises";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { parseEnv } from "node:util";
import { readDatabaseConfig, connectDatabase } from "./supabase-database.mjs";

const command = process.argv[2];
if (!["apply", "check", "bootstrap"].includes(command)) {
  console.error(
    "Usage: pnpm cloud:database apply|check|bootstrap [--teacher-email=email] [--proxy]",
  );
  process.exit(1);
}
const credentialPath = ".env.cloud-database.local";
const role = "colorverse_identity_reader";
let client;
let stage = "configuration";
let teacherIdentity;
try {
  const config = await readDatabaseConfig();
  client = await connectDatabase(config);
  if (command === "apply") {
    stage = "private_schema_migration";
    let runtime;
    try {
      runtime = parseEnv(await readFile(credentialPath, "utf8"));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      const existing = await client.query(
        "SELECT 1 FROM pg_roles WHERE rolname=$1",
        [role],
      );
      if (existing.rows.length)
        throw new Error("READER_CREDENTIAL_FILE_REQUIRED");
      runtime = {
        CLOUD_DATABASE_USER: role,
        CLOUD_DATABASE_PASSWORD: randomBytes(32).toString("hex"),
      };
      // Persist before commit: a successful DB change must never lose its generated credential.
      await writeFile(
        credentialPath,
        `# Backend-only, generated identity reader. Never commit or copy to VITE variables.\nCLOUD_DATABASE_USER=${role}\nCLOUD_DATABASE_PASSWORD=${runtime.CLOUD_DATABASE_PASSWORD}\n`,
        { flag: "wx", mode: 0o600 },
      );
    }
    if (
      runtime.CLOUD_DATABASE_USER !== role ||
      !/^[a-f0-9]{64}$/.test(runtime.CLOUD_DATABASE_PASSWORD ?? "")
    )
      throw new Error("INVALID_READER_CONFIGURATION");
    const migration = await readFile(
      "apps/api/migrations/001-course.sql",
      "utf8",
    );
    const hash = createHash("sha256").update(migration).digest("hex");
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(7301941)");
    await client.query("CREATE SCHEMA IF NOT EXISTS colorverse");
    await client.query("SET LOCAL search_path = colorverse, pg_catalog");
    await client.query(
      "CREATE TABLE IF NOT EXISTS course_migrations (version integer PRIMARY KEY, sha256 char(64) NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())",
    );
    const applied = await client.query(
      "SELECT sha256 FROM course_migrations WHERE version=1",
    );
    if (applied.rows.length && applied.rows[0].sha256 !== hash)
      throw new Error("MIGRATION_HASH_MISMATCH");
    if (!applied.rows.length) {
      const existingTables = await client.query(
        "SELECT count(*)::int AS count FROM information_schema.tables WHERE table_schema='colorverse' AND table_name <> 'course_migrations'",
      );
      if (existingTables.rows[0].count)
        throw new Error("UNMANAGED_SCHEMA_REQUIRES_REVIEW");
      await client.query(migration);
      await client.query(
        "INSERT INTO course_migrations(version,sha256) VALUES(1,$1)",
        [hash],
      );
    }
    await client.query(
      "REVOKE ALL ON SCHEMA colorverse FROM PUBLIC, anon, authenticated",
    );
    await client.query(
      "REVOKE ALL ON ALL TABLES IN SCHEMA colorverse FROM PUBLIC, anon, authenticated",
    );
    await client.query(
      "REVOKE ALL ON ALL FUNCTIONS IN SCHEMA colorverse FROM PUBLIC, anon, authenticated",
    );
    await client.query(
      "ALTER DEFAULT PRIVILEGES IN SCHEMA colorverse REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated",
    );
    await client.query(
      "ALTER DEFAULT PRIVILEGES IN SCHEMA colorverse REVOKE ALL ON FUNCTIONS FROM PUBLIC, anon, authenticated",
    );
    const roles = await client.query(
      "SELECT rolsuper, rolcreaterole, rolcreatedb, rolbypassrls FROM pg_roles WHERE rolname=$1",
      [role],
    );
    if (!roles.rows.length)
      await client.query(
        `CREATE ROLE ${role} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS PASSWORD '${runtime.CLOUD_DATABASE_PASSWORD}'`,
      );
    else if (Object.values(roles.rows[0]).some(Boolean))
      throw new Error("READER_ROLE_TOO_POWERFUL");
    const inherited = await client.query(
      "SELECT 1 FROM pg_auth_members WHERE member=(SELECT oid FROM pg_roles WHERE rolname=$1)",
      [role],
    );
    if (inherited.rows.length) throw new Error("READER_ROLE_HAS_MEMBERSHIPS");
    await client.query(
      `REVOKE ALL ON ALL TABLES IN SCHEMA colorverse FROM ${role}`,
    );
    await client.query(
      `REVOKE ALL ON ALL FUNCTIONS IN SCHEMA colorverse FROM ${role}`,
    );
    await client.query(`GRANT USAGE ON SCHEMA colorverse TO ${role}`);
    await client.query(
      `GRANT SELECT ON colorverse.users, colorverse.classes, colorverse.enrollments TO ${role}`,
    );
    await client.query(
      `ALTER ROLE ${role} SET default_transaction_read_only = on`,
    );
    await client.query("COMMIT");
    console.log(
      JSON.stringify({
        status: "private_schema_ready",
        migration: 1,
        reader: "select-only",
        demoSeed: false,
      }),
    );
  }
  if (command === "bootstrap") {
    stage = "teacher_binding";
    const email = process.argv
      .find((value) => value.startsWith("--teacher-email="))
      ?.slice(16);
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      throw new Error("TEACHER_EMAIL_REQUIRED");
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(7301941)");
    const accounts = await client.query(
      "SELECT id FROM auth.users WHERE lower(email)=lower($1) AND email_confirmed_at IS NOT NULL AND deleted_at IS NULL AND (banned_until IS NULL OR banned_until < now())",
      [email],
    );
    if (accounts.rows.length !== 1)
      throw new Error("CONFIRMED_TEACHER_AUTH_ACCOUNT_REQUIRED");
    const issuer = `https://${config.SUPABASE_DB_HOST.slice(3, -12)}.supabase.co/auth/v1`;
    const subject = accounts.rows[0].id;
    teacherIdentity = { issuer, subject };
    const existing = await client.query(
      "SELECT id, status FROM colorverse.users WHERE auth_issuer=$1 AND auth_subject=$2",
      [issuer, subject],
    );
    if (existing.rows[0]?.status === "inactive")
      throw new Error("TEACHER_ACCOUNT_INACTIVE");
    const userId = existing.rows[0]?.id ?? randomUUID();
    await client.query(
      "INSERT INTO colorverse.users(id,auth_issuer,auth_subject,display_name) VALUES($1,$2,$3,'课堂教师') ON CONFLICT(auth_issuer,auth_subject) DO NOTHING",
      [userId, issuer, subject],
    );
    const members = await client.query(
      "SELECT e.class_id FROM colorverse.enrollments e JOIN colorverse.classes c ON c.id=e.class_id WHERE e.user_id=$1 AND e.role='teacher' AND e.status='active' AND c.archived_at IS NULL",
      [userId],
    );
    if (!members.rows.length) {
      const count = await client.query(
        "SELECT count(*)::int AS count FROM colorverse.classes",
      );
      if (count.rows[0].count)
        throw new Error("EXISTING_CLASS_REQUIRES_EXPLICIT_ENROLLMENT");
      const courseId = randomUUID(),
        classId = randomUUID();
      await client.query(
        "INSERT INTO colorverse.courses(id,title,created_by) VALUES($1,'设计色彩',$2)",
        [courseId, userId],
      );
      await client.query(
        "INSERT INTO colorverse.classes(id,course_id,title,term,timezone) VALUES($1,$2,'设计色彩 · 测试班','2026秋','Asia/Shanghai')",
        [classId, courseId],
      );
      await client.query(
        "INSERT INTO colorverse.enrollments(id,class_id,user_id,role) VALUES($1,$2,$3,'teacher')",
        [randomUUID(), classId, userId],
      );
    }
    await client.query("COMMIT");
    console.log(
      JSON.stringify({
        status: "teacher_bound",
        identitySource: "confirmed-auth-user-id",
        passwordsRead: false,
      }),
    );
  }
  stage = "private_access_checks";
  const { rows } = await client.query(
    `SELECT
    has_schema_privilege('anon','colorverse','USAGE') AS anonymous_access,
    has_schema_privilege('authenticated','colorverse','USAGE') AS browser_access,
    has_table_privilege($1,'colorverse.enrollments','SELECT') AS reader_select,
    has_table_privilege($1,'colorverse.enrollments','UPDATE') AS reader_write,
    has_table_privilege($1,'colorverse.assets','SELECT') AS reader_assets`,
    [role],
  );
  const access = rows[0];
  if (
    access.anonymous_access ||
    access.browser_access ||
    !access.reader_select ||
    access.reader_write ||
    access.reader_assets
  )
    throw new Error("DATABASE_ACCESS_CHECK_FAILED");
  const runtime = parseEnv(await readFile(credentialPath, "utf8"));
  const reader = await connectDatabase(config, runtime);
  try {
    await reader.query("SELECT count(*) FROM colorverse.enrollments");
    if (teacherIdentity) {
      const { queryEnrollment } =
        await import("../apps/worker/src/enrollment.ts");
      const enrollment = await queryEnrollment(reader, teacherIdentity);
      if (
        enrollment.access !== "active" ||
        !enrollment.memberships.some((item) => item.role === "teacher")
      )
        throw new Error("TEACHER_ENROLLMENT_CHECK_FAILED");
      console.log(
        JSON.stringify({
          status: "teacher_enrollment_verified",
          activeClassCount: enrollment.memberships.length,
          role: "teacher",
        }),
      );
    }
    // Read-only transaction does not substitute for missing write privileges.
    await reader.query("BEGIN READ WRITE");
    let rejected = false;
    try {
      await reader.query(
        "UPDATE colorverse.enrollments SET status=status WHERE false",
      );
    } catch (error) {
      if (error.code === "42501") rejected = true;
      else throw error;
    } finally {
      await reader.query("ROLLBACK");
    }
    if (!rejected) throw new Error("READER_WRITE_WAS_NOT_REJECTED");
    console.log(
      JSON.stringify({
        status: "access_verified",
        ...access,
        actualReaderWriteRejected: true,
        tlsVerified: true,
      }),
    );
  } finally {
    await reader.end();
  }
} catch (error) {
  await client?.query("ROLLBACK").catch(() => {});
  const safe = error.code ?? error.message;
  console.error(
    JSON.stringify({
      status: "failed",
      stage,
      code: /^[A-Z0-9_]{1,50}$/.test(safe ?? "")
        ? safe
        : "DATABASE_OPERATION_FAILED",
    }),
  );
  process.exitCode = 1;
} finally {
  await client?.end().catch(() => {});
}
