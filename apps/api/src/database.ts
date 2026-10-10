import { Pool } from "pg";
import { PGlite } from "@electric-sql/pglite";
import { readFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { createHash } from "node:crypto";
export type Row = Record<string, unknown>;
export interface SqlConnection {
  query<R extends Row = Row>(
    sql: string,
    params?: unknown[],
  ): Promise<{ rows: R[] }>;
  exec(sql: string): Promise<unknown>;
}
export interface CourseDatabase extends SqlConnection {
  transaction<T>(fn: (sql: SqlConnection) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}
export async function createCourseDatabase(
  options: {
    connectionString?: string;
    dataDir?: string;
    schema?: string;
  } = {},
): Promise<CourseDatabase> {
  if (options.connectionString) {
    if (options.schema && !/^test_course_[a-z0-9_]+$/.test(options.schema))
      throw new Error("Invalid test schema");
    const pool = new Pool({
      connectionString: options.connectionString,
      options: options.schema ? `-c search_path=${options.schema}` : undefined,
    });
    if (options.schema) await pool.query(`CREATE SCHEMA ${options.schema}`);
    return {
      query: (sql, params) => pool.query(sql, params),
      exec: (sql) => pool.query(sql),
      transaction: async (fn) => {
        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          const value = await fn({
            query: (sql, params) => client.query(sql, params),
            exec: (sql) => client.query(sql),
          });
          await client.query("COMMIT");
          return value;
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        } finally {
          client.release();
        }
      },
      close: async () => {
        if (options.schema)
          await pool.query(`DROP SCHEMA ${options.schema} CASCADE`);
        await pool.end();
      },
    };
  }
  if (options.dataDir)
    await mkdir(dirname(options.dataDir), { recursive: true });
  const db = await PGlite.create(options.dataDir);
  return {
    query: (sql, params) => db.query(sql, params),
    exec: (sql) => db.exec(sql),
    transaction: (fn) =>
      db.transaction((tx) =>
        fn({
          query: (sql, params) => tx.query(sql, params),
          exec: (sql) => tx.exec(sql),
        }),
      ),
    close: () => db.close(),
  };
}
export async function migrateCourses(db: CourseDatabase) {
  const sql = await readFile(
    new URL("../migrations/001-course.sql", import.meta.url),
    "utf8",
  );
  const hash = createHash("sha256").update(sql).digest("hex");
  await db.transaction(async (tx) => {
    await tx.query("SELECT pg_advisory_xact_lock(7301941)");
    await tx.exec(
      "CREATE TABLE IF NOT EXISTS course_migrations (version integer PRIMARY KEY, sha256 char(64) NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())",
    );
    const { rows } = await tx.query(
      "SELECT sha256 FROM course_migrations WHERE version=1",
    );
    if (rows.length) {
      if (rows[0].sha256 !== hash)
        throw new Error("Applied course migration has changed");
      return;
    }
    await tx.exec(sql);
    await tx.query(
      "INSERT INTO course_migrations(version,sha256) VALUES(1,$1)",
      [hash],
    );
  });
}
