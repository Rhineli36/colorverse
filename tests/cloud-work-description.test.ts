import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import type { Client } from "pg";
import {
  createCourseDatabase,
  type CourseDatabase,
} from "../apps/api/src/database";
import {
  handleShowcaseCloud,
  type ShowcaseCloudEnvironment,
} from "../apps/worker/src/showcase-cloud";
let db: CourseDatabase;
const [classId, otherClass, owner, peer, teacher, planet, work] = Array.from(
  { length: 7 },
  () => randomUUID(),
);
const identity = (id = owner) => ({
  issuer: "https://test.invalid/auth/v1",
  subject: id,
  email: "test@example.test",
});
const env = {
  HYPERDRIVE_WRITER: { connectionString: "unused" },
  SUPABASE_SECRET_KEY: "test-only",
  IMAGES: {},
} as ShowcaseCloudEnvironment;
const client = () =>
  ({
    connect: async () => {},
    end: async () => {},
    query: (sql: string, values: unknown[]) => db.query(sql, values),
  }) as unknown as Pick<Client, "connect" | "query" | "end">;
const request = (
  actor = owner,
  revision = 0,
  description = "校订后的配色说明",
  routeClass = classId,
) =>
  handleShowcaseCloud(
    new Request("https://test.invalid", {
      method: "PUT",
      body: JSON.stringify({ description, revision }),
    }),
    env,
    identity(actor),
    routeClass,
    `works/${work}/description`,
    client,
  );
beforeAll(async () => {
  db = await createCourseDatabase();
  await db.exec(`CREATE SCHEMA colorverse;
 CREATE TABLE colorverse.users(id uuid PRIMARY KEY,auth_issuer text,auth_subject text,status text);
 CREATE TABLE colorverse.classes(id uuid PRIMARY KEY,title text,timezone text,archived_at timestamptz);
 CREATE TABLE colorverse.enrollments(id uuid PRIMARY KEY,user_id uuid,class_id uuid,role text,status text);
 CREATE TABLE colorverse.planets(id uuid PRIMARY KEY,owner_enrollment_id uuid);
 CREATE TABLE colorverse.showcase_works(id uuid PRIMARY KEY,planet_id uuid,description text,revision integer,withdrawn_at timestamptz);`);
  for (const id of [classId, otherClass])
    await db.query(
      "INSERT INTO colorverse.classes VALUES($1,'隔离测试班','Asia/Shanghai',NULL)",
      [id],
    );
  for (const [id, role] of [
    [owner, "student"],
    [peer, "student"],
    [teacher, "teacher"],
  ]) {
    await db.query("INSERT INTO colorverse.users VALUES($1,$2,$3,'active')", [
      id,
      identity().issuer,
      id,
    ]);
    await db.query(
      "INSERT INTO colorverse.enrollments VALUES($1,$1,$2,$3,'active')",
      [id, classId, role],
    );
  }
  await db.query(
    "INSERT INTO colorverse.enrollments VALUES($1,$2,$3,'student','active')",
    [randomUUID(), owner, otherClass],
  );
  await db.query("INSERT INTO colorverse.planets VALUES($1,$2)", [
    planet,
    owner,
  ]);
  await db.query(
    "INSERT INTO colorverse.showcase_works VALUES($1,$2,'原说明',0,NULL)",
    [work, planet],
  );
});
afterAll(async () => db?.close());
describe("cloud work description ownership and revisions", () => {
  it("rejects peers, teachers, another class and stale revisions while preserving data", async () => {
    for (const actor of [peer, teacher])
      await expect(request(actor)).rejects.toMatchObject({
        status: 409,
        code: "WORK_CONFLICT",
      });
    await expect(
      request(owner, 0, "越班写入", otherClass),
    ).rejects.toMatchObject({ status: 409 });
    expect(
      (
        await db.query(
          "SELECT description,revision FROM colorverse.showcase_works WHERE id=$1",
          [work],
        )
      ).rows[0],
    ).toEqual({ description: "原说明", revision: 0 });
    const r = await request();
    expect(await r.json()).toMatchObject({ saved: true, revision: 1 });
    await expect(request(owner, 0, "旧页面覆盖")).rejects.toMatchObject({
      status: 409,
    });
    expect(
      (
        await db.query(
          "SELECT description FROM colorverse.showcase_works WHERE id=$1",
          [work],
        )
      ).rows[0].description,
    ).toBe("校订后的配色说明");
  });
  it("rejects oversized explanations and malformed input", async () => {
    await expect(request(owner, 1, "字".repeat(2001))).rejects.toMatchObject({
      status: 400,
    });
  });
});
