import { readFile, mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { readDatabaseConfig, connectDatabase } from "./supabase-database.mjs";

export const runtimeGrantsFile = new URL(
  "../apps/api/migrations/011-explicit-runtime-grants.sql",
  import.meta.url,
);
export async function applyRuntimeGrants(client) {
  const sql = await readFile(runtimeGrantsFile, "utf8");
  const hash = createHash("sha256").update(sql).digest("hex");
  await client.query("BEGIN");
  try {
    await client.query("SELECT pg_advisory_xact_lock(7301941)");
    const previous = await client.query(
      "SELECT sha256 FROM colorverse.course_migrations WHERE version=11",
    );
    if (previous.rows.length && previous.rows[0].sha256 !== hash)
      throw Error("MIGRATION_HASH_MISMATCH");
    if (!previous.rows.length) {
      await client.query(sql);
      await client.query(
        "INSERT INTO colorverse.course_migrations(version,sha256) VALUES(11,$1)",
        [hash],
      );
    }
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  }
}

export async function auditDatabaseAccess(client) {
  const rows = async (sql) => (await client.query(sql)).rows;
  const tables =
    await rows(`SELECT n.nspname AS schema,c.relname AS name,c.relrowsecurity AS rls,c.relforcerowsecurity AS force_rls
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname IN ('colorverse','public') AND c.relkind IN ('r','p','v','m') ORDER BY 1,2`);
  const grants =
    await rows(`SELECT grantee,table_name,privilege_type FROM information_schema.role_table_grants
    WHERE table_schema='colorverse' AND grantee IN ('colorverse_identity_reader','colorverse_classroom_writer') ORDER BY 1,2,3`);
  const columns =
    await rows(`SELECT grantee,table_name,column_name,privilege_type FROM information_schema.role_column_grants
    WHERE table_schema='colorverse' AND table_name='users' AND grantee='colorverse_classroom_writer' AND privilege_type='UPDATE' ORDER BY 3`);
  const apiAccess =
    await rows(`SELECT r.rolname,c.relname,has_schema_privilege(r.oid,n.oid,'USAGE') AS schema_usage,
    has_table_privilege(r.oid,c.oid,'SELECT,INSERT,UPDATE,DELETE') AS table_access
    FROM pg_roles r CROSS JOIN pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='colorverse' AND c.relkind IN ('r','p','v','m') AND r.rolname IN ('anon','authenticated','service_role') ORDER BY 1,2`);
  const roles =
    await rows(`SELECT rolname,rolsuper,rolcreaterole,rolcreatedb,rolbypassrls,rolinherit,
      has_schema_privilege(oid,'colorverse','USAGE') AS schema_usage FROM pg_roles
    WHERE rolname IN ('colorverse_identity_reader','colorverse_classroom_writer') ORDER BY 1`);
  const policies =
    await rows(`SELECT schemaname,tablename,policyname,roles,cmd,qual,with_check FROM pg_policies
    WHERE schemaname IN ('colorverse','public','storage') ORDER BY 1,2,3`);
  const has = (role, table, privilege) =>
    grants.some(
      (g) =>
        g.grantee === role &&
        g.table_name === table &&
        g.privilege_type === privilege,
    );
  const failures = [];
  for (const table of [
    "users",
    "classes",
    "enrollments",
    "planets",
    "showcase_works",
    "classroom_interactions",
    "submissions",
    "submission_versions",
    "showcase_reviews",
    "learning_task_settings",
  ])
    if (!has("colorverse_identity_reader", table, "SELECT"))
      failures.push(`reader:${table}:SELECT`);
  const writer = {
    users: ["SELECT", "INSERT"],
    classes: ["SELECT"],
    enrollments: ["SELECT", "INSERT"],
    planets: ["SELECT", "INSERT", "UPDATE"],
    showcase_works: ["SELECT", "INSERT", "UPDATE"],
    classroom_interactions: ["SELECT", "INSERT", "DELETE"],
    showcase_reviews: ["SELECT", "INSERT"],
    learning_task_settings: ["SELECT", "INSERT", "UPDATE"],
    classroom_notice_reads: ["SELECT", "INSERT"],
    student_accounts: ["SELECT", "INSERT", "UPDATE"],
    student_import_batches: ["SELECT", "INSERT", "UPDATE"],
    classroom_login_aliases: ["SELECT"],
    isolated_account_courses: ["SELECT"],
  };
  const rolloutTables = Object.fromEntries(
    [
      "classroom_publications",
      "classroom_recipients",
      "classroom_login_history",
      "classroom_activation_challenges",
      "classroom_security_attempts",
    ].map((t) => [t, ["SELECT", "INSERT", "UPDATE"]]),
  );
  for (const [table, privileges] of Object.entries(writer))
    for (const p of privileges)
      if (!has("colorverse_classroom_writer", table, p))
        failures.push(`writer:${table}:${p}`);
  for (const name of ["display_name", "student_number", "real_name"])
    if (!columns.some((c) => c.column_name === name))
      failures.push(`writer:users:${name}:UPDATE`);
  if (
    columns.some(
      (c) =>
        !["display_name", "student_number", "real_name"].includes(
          c.column_name,
        ),
    )
  )
    failures.push("profile_update_too_broad");
  if (
    grants.some(
      (g) =>
        g.grantee === "colorverse_identity_reader" &&
        g.privilege_type !== "SELECT",
    )
  )
    failures.push("reader_not_read_only");
  if (
    grants.some(
      (g) =>
        g.grantee === "colorverse_classroom_writer" &&
        !(writer[g.table_name] ?? rolloutTables[g.table_name])?.includes(
          g.privilege_type,
        ),
    )
  )
    failures.push("writer_unexpected_table_privilege");
  if (apiAccess.some((g) => g.schema_usage && g.table_access))
    failures.push("private_schema_accessible_to_data_api_role");
  if (
    roles.length !== 2 ||
    roles.some(
      (r) =>
        r.rolsuper ||
        r.rolcreaterole ||
        r.rolcreatedb ||
        r.rolbypassrls ||
        r.rolinherit ||
        !r.schema_usage,
    )
  )
    failures.push("restricted_backend_roles_required");
  return {
    checkedAt: new Date().toISOString(),
    status: failures.length ? "failed" : "passed",
    tables,
    roles,
    grants,
    columns,
    policies,
    failures,
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  let client;
  try {
    const command = process.argv[2] ?? "check";
    if (!["check", "apply"].includes(command))
      throw Error("USE_CHECK_OR_APPLY");
    client = await connectDatabase(await readDatabaseConfig());
    if (command === "apply") await applyRuntimeGrants(client);
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const report = await auditDatabaseAccess(client);
    await client.query("ROLLBACK");
    await mkdir("outputs/data-api-audit", { recursive: true });
    await writeFile(
      "outputs/data-api-audit/runtime-access.json",
      JSON.stringify(report, null, 2) + "\n",
    );
    console.log(
      JSON.stringify({
        status: report.status,
        command,
        businessTables: report.tables.filter((t) => t.schema === "colorverse")
          .length,
        failures: report.failures,
      }),
    );
    if (report.failures.length) process.exitCode = 1;
  } catch (e) {
    console.error(
      JSON.stringify({
        status: "failed",
        code: /^[A-Z0-9_]{1,50}$/.test(e.code ?? e.message)
          ? (e.code ?? e.message)
          : "DATABASE_ACCESS_CHECK_FAILED",
      }),
    );
    process.exitCode = 1;
  } finally {
    await client?.end();
  }
}
