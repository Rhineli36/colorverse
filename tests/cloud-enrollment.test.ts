import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import {
  createCourseDatabase,
  migrateCourses,
  type CourseDatabase,
} from "../apps/api/src/database";
import { queryEnrollment } from "../apps/worker/src/enrollment";
import {
  handleRequest,
  type WorkerEnvironment,
} from "../apps/worker/src/index";
import { CloudSessionSchema } from "@colorverse/contracts";

let db: CourseDatabase;
const schema = `test_course_${randomUUID().replaceAll("-", "")}`;
const issuer = "https://example.supabase.co/auth/v1";
const ids = Array.from({ length: 10 }, () => randomUUID());
const identity = (subject = ids[0], origin = issuer) => ({
  issuer: origin,
  subject,
  email: "student@example.test",
});
beforeAll(async () => {
  db = await createCourseDatabase({
    connectionString: process.env.COURSE_TEST_DATABASE_URL,
    schema: process.env.COURSE_TEST_DATABASE_URL ? schema : undefined,
  });
  if (!process.env.COURSE_TEST_DATABASE_URL) {
    await db.exec(`CREATE SCHEMA ${schema}; SET search_path=${schema}`);
  }
  await migrateCourses(db);
  for (const [id, status] of [
    [ids[0], "active"],
    [ids[1], "active"],
    [ids[2], "inactive"],
  ])
    await db.query(
      "INSERT INTO users(id,auth_issuer,auth_subject,display_name,status) VALUES($1::uuid,$2,$1::uuid::text,'测试用户',$3)",
      [id, issuer, status],
    );
  await db.query(
    "INSERT INTO courses(id,title,created_by) VALUES($1,'测试课程',$2)",
    [ids[3], ids[1]],
  );
  for (const [id, archived] of [
    [ids[4], false],
    [ids[5], false],
    [ids[6], true],
  ])
    await db.query(
      "INSERT INTO classes(id,course_id,title,term,timezone,archived_at) VALUES($1,$2,'隔离测试班','测试','Asia/Shanghai',CASE WHEN $3 THEN now() END)",
      [id, ids[3], archived],
    );
  for (const [user, classId, role, status] of [
    [ids[0], ids[4], "student", "active"],
    [ids[0], ids[5], "teacher", "inactive"],
    [ids[0], ids[6], "teacher", "active"],
    [ids[1], ids[5], "teacher", "active"],
    [ids[2], ids[4], "teacher", "active"],
  ])
    await db.query(
      "INSERT INTO enrollments(id,user_id,class_id,role,status) VALUES($1,$2,$3,$4,$5)",
      [randomUUID(), user, classId, role, status],
    );
}, 30000);
afterAll(async () => {
  await db?.close();
});

describe("authoritative enrollment lookup", () => {
  it("returns only the verified student's active, unarchived memberships", async () => {
    const result = await queryEnrollment(db, identity(), schema);
    expect(result.access).toBe("active");
    expect(result.memberships).toHaveLength(1);
    expect(result.memberships[0]).toMatchObject({
      classId: ids[4],
      role: "student",
    });
    expect(JSON.stringify(result)).not.toContain(ids[5]);
  });
  it("keeps teacher roles scoped to the teacher's own classes", async () => {
    const result = await queryEnrollment(db, identity(ids[1]), schema);
    expect(result.memberships).toHaveLength(1);
    expect(result.memberships[0]).toMatchObject({
      classId: ids[5],
      role: "teacher",
    });
  });
  it("does not match another issuer or create a user for an unknown subject", async () => {
    for (const input of [
      identity(ids[0], "https://foreign.supabase.co/auth/v1"),
      identity(ids[9]),
    ])
      expect(await queryEnrollment(db, input, schema)).toEqual({
        access: "pending-enrollment",
        memberships: [],
      });
    expect(
      Number((await db.query("SELECT count(*) AS n FROM users")).rows[0].n),
    ).toBe(3);
  });
  it("blocks disabled users despite an active teacher enrollment", async () => {
    expect(await queryEnrollment(db, identity(ids[2]), schema)).toEqual({
      access: "blocked",
      memberships: [],
    });
  });
  it("rechecks revoked membership on the next request", async () => {
    await db.query(
      "UPDATE enrollments SET status='inactive' WHERE user_id=$1 AND class_id=$2",
      [ids[0], ids[4]],
    );
    try {
      expect(await queryEnrollment(db, identity(), schema)).toEqual({
        access: "pending-enrollment",
        memberships: [],
      });
    } finally {
      await db.query(
        "UPDATE enrollments SET status='active' WHERE user_id=$1 AND class_id=$2",
        [ids[0], ids[4]],
      );
    }
  });
  it("refuses schema injection", async () => {
    await expect(
      queryEnrollment(db, identity(), "public; SELECT 1"),
    ).rejects.toThrow("Invalid enrollment schema");
  });
});

const env: WorkerEnvironment = {
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
  ASSETS: { fetch: async () => new Response("static") },
};
const input = () =>
  new Request("https://example.test/api/v1/cloud/session", {
    headers: { Authorization: "Bearer valid.token.test", "X-Role": "teacher" },
  });
const auth = async () =>
  Response.json({
    id: ids[0],
    email: "student@example.test",
    email_confirmed_at: "2026-10-11T00:00:00Z",
    user_metadata: { role: "teacher" },
  });
describe("enrollment session boundary", () => {
  it("uses verified issuer and subject rather than client-selected role", async () => {
    const response = await handleRequest(
      input(),
      env,
      auth,
      async (verified) => {
        expect(verified).toEqual(identity());
        return queryEnrollment(db, verified, schema);
      },
    );
    const session = CloudSessionSchema.parse(await response.json());
    expect(session.access).toBe("active");
    expect(session.memberships[0].role).toBe("student");
    expect(session.cloudWrites).toBe(false);
  });
  it("withholds roles and safe errors when the database is unreachable", async () => {
    const response = await handleRequest(input(), env, auth, async () => {
      throw new Error("postgresql://secret-credential");
    });
    expect(response.status).toBe(503);
    expect(await response.text()).not.toMatch(/secret|teacher|student@example/);
  });
  it("never queries membership for a rejected Auth token", async () => {
    let queried = false;
    const response = await handleRequest(
      input(),
      env,
      async () => new Response(null, { status: 401 }),
      async () => {
        queried = true;
        return null;
      },
    );
    expect(response.status).toBe(401);
    expect(queried).toBe(false);
  });
  it("rejects an inconsistent active membership response", () => {
    expect(
      CloudSessionSchema.safeParse({
        identity: { id: ids[0], email: "test@example.test" },
        access: "active",
        database: "connected",
        memberships: [],
        cloudWrites: false,
      }).success,
    ).toBe(false);
  });
});
