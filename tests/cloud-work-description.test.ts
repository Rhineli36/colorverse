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
const identity = (id: string = owner) => ({
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
 CREATE TABLE colorverse.planets(id uuid PRIMARY KEY,owner_enrollment_id uuid,document jsonb);
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
  await db.query(
    "INSERT INTO colorverse.planets(id,owner_enrollment_id) VALUES($1,$2)",
    [planet, owner],
  );
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
  it("lets only the same-class teacher or owner change planet appearance, with revision protection", async () => {
    await db.query("UPDATE colorverse.planets SET document=$1 WHERE id=$2", [
      JSON.stringify({
        metadata: { name: "原星球", summary: "原介绍" },
        revision: 0,
        color: "#112233",
        skin: 0,
        media: { interior: { id: randomUUID(), key: "unchanged-private-key" } },
      }),
      planet,
    ]);
    const save = (actor: string, revision = 0, targetClass = classId) =>
      handleShowcaseCloud(
        new Request("https://test.invalid", {
          method: "PUT",
          body: JSON.stringify({
            name: "教师调整",
            color: "#456789",
            revision,
          }),
        }),
        env,
        identity(actor),
        targetClass,
        `planets/${planet}/appearance`,
        client,
      );
    await expect(save(peer)).rejects.toMatchObject({ status: 403 });
    expect((await save(teacher)).status).toBe(200);
    const doc = (
      await db.query("SELECT document FROM colorverse.planets WHERE id=$1", [
        planet,
      ])
    ).rows[0].document as {
      revision: number;
      media: { interior: { key: string } };
    };
    expect(doc.revision).toBe(1);
    expect(doc.media.interior.key).toBe("unchanged-private-key");
    await expect(save(owner, 0)).rejects.toMatchObject({ status: 409 });
    await expect(save(teacher, 1, otherClass)).rejects.toMatchObject({
      status: 403,
    });
  });
  it("rejects oversized explanations and malformed input", async () => {
    await expect(request(owner, 1, "字".repeat(2001))).rejects.toMatchObject({
      status: 400,
    });
  });
});
