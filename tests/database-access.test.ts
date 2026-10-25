import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";

let db: PGlite;
const grantSql = () =>
  readFile("apps/api/migrations/011-explicit-runtime-grants.sql", "utf8");
beforeAll(async () => {
  db = await PGlite.create();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE ROLE colorverse_identity_reader NOINHERIT NOBYPASSRLS;
    CREATE ROLE colorverse_classroom_writer NOINHERIT NOBYPASSRLS;
    CREATE SCHEMA colorverse; SET search_path=colorverse,pg_catalog;
    CREATE TABLE course_migrations(version integer PRIMARY KEY,sha256 text);`);
  for (const file of [
    "001-course",
    "002-classroom-showcase",
    "003-showcase-originals",
    "004-showcase-withdrawal",
    "005-showcase-reviews",
    "006-learning-context",
    "007-custom-assignments",
    "008-precompetition",
    "009-student-import",
    "010-import-account-scope",
  ])
    await db.exec(await readFile(`apps/api/migrations/${file}.sql`, "utf8"));
}, 30000);
afterAll(async () => db?.close());

describe("explicit grants without Supabase automatic exposure", () => {
  it("starts closed and grants only the actual backend capabilities", async () => {
    expect(
      (
        await db.query<{ allowed: boolean }>(
          `SELECT has_table_privilege('colorverse_classroom_writer','colorverse.planets','INSERT') allowed`,
        )
      ).rows[0].allowed,
    ).toBe(false);
    await db.exec(await grantSql());
    await db.exec("SET ROLE colorverse_classroom_writer");
    for (const table of [
      "users",
      "classes",
      "enrollments",
      "planets",
      "showcase_works",
      "classroom_interactions",
      "showcase_reviews",
      "learning_task_settings",
      "classroom_notice_reads",
      "student_accounts",
      "student_import_batches",
      "classroom_login_aliases",
      "isolated_account_courses",
    ])
      await db.query(`SELECT * FROM colorverse.${table} LIMIT 0`);
    const rights = await db.query<{ allowed: boolean; denied: boolean }>(`SELECT
      has_column_privilege(current_user,'colorverse.users','real_name','UPDATE') allowed,
      has_column_privilege(current_user,'colorverse.users','auth_subject','UPDATE') denied`);
    expect(rights.rows[0]).toEqual({ allowed: true, denied: false });
    await expect(
      db.exec("DELETE FROM colorverse.showcase_reviews"),
    ).rejects.toThrow(/permission denied/);
    await expect(
      db.exec("UPDATE colorverse.users SET status='inactive'"),
    ).rejects.toThrow(/permission denied/);
    await db.exec("RESET ROLE; SET ROLE colorverse_identity_reader");
    await db.query("SELECT * FROM colorverse.submissions LIMIT 0");
    await expect(db.exec("DELETE FROM colorverse.planets")).rejects.toThrow(
      /permission denied/,
    );
    await expect(
      db.query("SELECT * FROM colorverse.student_accounts"),
    ).rejects.toThrow(/permission denied/);
    await db.exec("RESET ROLE");
    for (const role of ["anon", "authenticated", "service_role"]) {
      await db.exec(`SET ROLE ${role}`);
      await expect(
        db.query("SELECT * FROM colorverse.planets"),
      ).rejects.toThrow(/permission denied/);
      await db.exec("RESET ROLE");
    }
  });
  it("preserves existing RLS policies, row data and append-only triggers when replayed", async () => {
    await db.exec(`CREATE TABLE colorverse.rls_probe(id int PRIMARY KEY);
      INSERT INTO colorverse.rls_probe VALUES(1);
      ALTER TABLE colorverse.rls_probe ENABLE ROW LEVEL SECURITY;
      CREATE POLICY probe_denied ON colorverse.rls_probe FOR SELECT TO colorverse_classroom_writer USING(false);
      GRANT SELECT ON colorverse.rls_probe TO colorverse_classroom_writer;`);
    await db.exec(await grantSql());
    expect(
      (
        await db.query<{ rls: boolean }>(
          `SELECT relrowsecurity rls FROM pg_class WHERE oid='colorverse.rls_probe'::regclass`,
        )
      ).rows[0].rls,
    ).toBe(true);
    expect(
      (
        await db.query(
          `SELECT policyname FROM pg_policies WHERE schemaname='colorverse' AND tablename='rls_probe'`,
        )
      ).rows,
    ).toEqual([{ policyname: "probe_denied" }]);
    expect((await db.query("SELECT * FROM colorverse.rls_probe")).rows).toEqual(
      [{ id: 1 }],
    );
    await db.exec("SET ROLE colorverse_classroom_writer");
    expect((await db.query("SELECT * FROM colorverse.rls_probe")).rows).toEqual(
      [],
    );
    await db.exec("RESET ROLE");
    expect(
      (
        await db.query(
          `SELECT tgname FROM pg_trigger WHERE tgrelid='colorverse.showcase_reviews'::regclass AND NOT tgisinternal`,
        )
      ).rows,
    ).toEqual([{ tgname: "showcase_review_history" }]);
  });
});
