import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import {
  createCourseDatabase,
  type CourseDatabase,
} from "../apps/api/src/database";
import {
  handleShowcaseCloud,
  type ShowcaseCloudEnvironment,
} from "../apps/worker/src/showcase-cloud";
import type { Client } from "pg";
let db: CourseDatabase;
const [cls, other, owner, peer, teacher, planet, work] = Array.from(
  { length: 7 },
  () => randomUUID(),
);
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
const call = (
  actor: string,
  resource: string,
  body?: unknown,
  routeClass = cls,
  method = body ? "POST" : "GET",
) =>
  handleShowcaseCloud(
    new Request("https://test.invalid?planetId=" + planet, {
      method,
      ...(body ? { body: JSON.stringify(body) } : {}),
    }),
    env,
    {
      issuer: "https://test.invalid/auth/v1",
      subject: actor,
      email: "test@example.test",
    },
    routeClass,
    resource,
    client,
  );
beforeAll(async () => {
  db = await createCourseDatabase();
  await db.exec(`CREATE SCHEMA colorverse;
 CREATE TABLE colorverse.users(id uuid PRIMARY KEY,auth_issuer text,auth_subject text,status text,display_name text);
 CREATE TABLE colorverse.classes(id uuid PRIMARY KEY,title text,timezone text,archived_at timestamptz);
 CREATE TABLE colorverse.enrollments(id uuid PRIMARY KEY,user_id uuid,class_id uuid,role text,status text);
 CREATE TABLE colorverse.planets(id uuid PRIMARY KEY,owner_enrollment_id uuid,document jsonb);
 CREATE TABLE colorverse.showcase_works(id uuid PRIMARY KEY,planet_id uuid,title text,withdrawn_at timestamptz,preset_id text,color text,element_params jsonb,element_edited boolean,revision int);
 CREATE TABLE colorverse.classroom_interactions(id uuid PRIMARY KEY,actor_enrollment_id uuid,planet_id uuid,work_id uuid,kind text,content text,request_id uuid,learning_feedback jsonb,created_at timestamptz DEFAULT now(),UNIQUE(actor_enrollment_id,request_id));`);
  for (const id of [cls, other])
    await db.query(
      "INSERT INTO colorverse.classes VALUES($1,'测试班','Asia/Shanghai',NULL)",
      [id],
    );
  for (const [id, role] of [
    [owner, "student"],
    [peer, "student"],
    [teacher, "teacher"],
  ]) {
    await db.query(
      "INSERT INTO colorverse.users VALUES($1::uuid,'https://test.invalid/auth/v1',$1::text,'active','同学')",
      [id],
    );
    await db.query(
      "INSERT INTO colorverse.enrollments VALUES($1,$1,$2,$3,'active')",
      [id, cls, role],
    );
  }
  await db.query("INSERT INTO colorverse.planets VALUES($1,$2,'{}')", [
    planet,
    owner,
  ]);
  await db.query(
    "INSERT INTO colorverse.showcase_works VALUES($1,$2,'测试作品',NULL,'crystal','#123456','{}',false,0)",
    [work, planet],
  );
});
afterAll(async () => db?.close());
describe("cloud discussion recipients, totals and teacher editing", () => {
  it("allows an author reply, denies self-like and own peer assessment, and keeps work binding", async () => {
    const post = (kind: string, extra = {}) => ({
      planetId: planet,
      workId: work,
      kind,
      content: "谢谢来访！",
      requestId: randomUUID(),
      ...extra,
    });
    expect((await call(owner, "interactions", post("comment"))).status).toBe(
      200,
    );
    await expect(
      call(owner, "interactions", post("like")),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      call(
        owner,
        "interactions",
        post("comment", {
          observation: { customMood: "平静", visualEvidence: "蓝色占大面积" },
        }),
      ),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      call(peer, "interactions", post("comment"), other),
    ).rejects.toMatchObject({ status: 403 });
    const row = (
      await db.query("SELECT work_id FROM colorverse.classroom_interactions")
    ).rows;
    expect(row).toEqual([{ work_id: work }]);
  });
  it("counts likes beyond the 200 most recent discussion records", async () => {
    await db.query(
      "INSERT INTO colorverse.classroom_interactions(id,actor_enrollment_id,planet_id,work_id,kind,content,request_id,created_at) VALUES($1,$2,$3,$4,'like','',$5,now()-interval '2 days')",
      [randomUUID(), peer, planet, work, randomUUID()],
    );
    for (let i = 0; i < 201; i++)
      await db.query(
        "INSERT INTO colorverse.classroom_interactions(id,actor_enrollment_id,planet_id,work_id,kind,content,request_id) VALUES($1,$2,$3,$4,'comment','新的留言',$5)",
        [randomUUID(), peer, planet, work, randomUUID()],
      );
    const result = await (await call(owner, "interactions")).json();
    expect(
      result.counts.find((r: { workId: string }) => r.workId === work).likes,
    ).toBe(1);
    expect(
      result.interactions.some((r: { kind: string }) => r.kind === "like"),
    ).toBe(false);
  });
  it("lets the same-class teacher edit an element while denying peers and stale writes", async () => {
    const input = {
      presetId: "crystal",
      color: "#58BFC2",
      x: 0.3,
      y: 0.4,
      size: 0.9,
      motion: "float",
      revision: 0,
    };
    await expect(
      call(peer, `works/${work}/element`, input, cls, "PUT"),
    ).rejects.toMatchObject({ status: 409 });
    expect(
      (await call(teacher, `works/${work}/element`, input, cls, "PUT")).status,
    ).toBe(200);
    await expect(
      call(teacher, `works/${work}/element`, input, cls, "PUT"),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      call(
        teacher,
        `works/${work}/element`,
        { ...input, revision: 1 },
        other,
        "PUT",
      ),
    ).rejects.toMatchObject({ status: 403 });
    expect(
      (
        await db.query(
          "SELECT color,revision FROM colorverse.showcase_works WHERE id=$1",
          [work],
        )
      ).rows[0],
    ).toEqual({ color: "#58BFC2", revision: 1 });
  });
});
