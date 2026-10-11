import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Client } from "pg";
import {
  handleShowcaseCloud,
  type ShowcaseCloudEnvironment,
} from "../apps/worker/src/showcase-cloud";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import {
  createCourseDatabase,
  migrateCourses,
  type CourseDatabase,
} from "../apps/api/src/database";
import { classroomOverview } from "../apps/worker/src/classroom";
import { GrowthPresetIds, GrowthLibrarySpec } from "@colorverse/contracts";
import { growthShapes } from "@colorverse/domain";
const schema = `test_course_${randomUUID().replaceAll("-", "")}`,
  issuer = "https://test.supabase.co/auth/v1";
const ids = Array.from({ length: 15 }, () => randomUUID());
let db: CourseDatabase;
const sql = {
  query: (query: string, params: unknown[]) =>
    db.query(query.replaceAll("colorverse.", `${schema}.`), params),
};
const identity = (id: string) => ({
  issuer,
  subject: id,
  email: "test@example.test",
});
beforeAll(async () => {
  db = await createCourseDatabase({
    connectionString: process.env.COURSE_TEST_DATABASE_URL,
    schema: process.env.COURSE_TEST_DATABASE_URL ? schema : undefined,
  });
  if (!process.env.COURSE_TEST_DATABASE_URL)
    await db.exec(`CREATE SCHEMA ${schema}; SET search_path=${schema}`);
  await migrateCourses(db);
  await db.exec(
    await readFile("apps/api/migrations/002-classroom-showcase.sql", "utf8"),
  );
  await db.exec(
    await readFile("apps/api/migrations/003-showcase-originals.sql", "utf8"),
  );
  for (const id of ids.slice(0, 4))
    await db.query(
      "INSERT INTO users VALUES($1::uuid,$2,$1::uuid::text,'测试用户','active')",
      [id, issuer],
    );
  await db.query("INSERT INTO courses VALUES($1,'课程',$2)", [ids[4], ids[0]]);
  for (const id of ids.slice(5, 7))
    await db.query(
      "INSERT INTO classes(id,course_id,title,term,timezone) VALUES($1,$2,'测试班','试用','Asia/Shanghai')",
      [id, ids[4]],
    );
  for (const [id, user, cls, role] of [
    [ids[7], ids[0], ids[5], "teacher"],
    [ids[8], ids[1], ids[5], "student"],
    [ids[9], ids[2], ids[5], "student"],
    [ids[10], ids[3], ids[6], "student"],
  ])
    await db.query(
      "INSERT INTO enrollments(id,user_id,class_id,role) VALUES($1,$2,$3,$4)",
      [id, user, cls, role],
    );
  await db.query(
    'INSERT INTO planets(id,owner_enrollment_id,document) VALUES($1,$2,\'{"metadata":{"name":"小蓝星"}}\')',
    [ids[11], ids[8]],
  );
  for (let i = 0; i < 2; i++)
    await db.query(
      "INSERT INTO showcase_works(id,planet_id,title,storage_key,byte_size,preset_id,request_id,created_at) VALUES($1,$2,'作品',$3,100,'crystal',$4,CASE WHEN $5 THEN now() ELSE now()-interval '8 days' END)",
      [randomUUID(), ids[11], randomUUID(), randomUUID(), i === 0],
    );
  for (let i = 0; i < 3; i++)
    await db.query(
      "INSERT INTO classroom_interactions(id,actor_enrollment_id,planet_id,kind,content,request_id) VALUES($1,$2,$3,'comment','很棒',$4)",
      [randomUUID(), ids[9], ids[11], randomUUID()],
    );
}, 30000);
afterAll(async () => await db?.close());
const clientFactory = () =>
  ({
    connect: async () => {},
    end: async () => {},
    query: (query: string, params: unknown[] = []) => sql.query(query, params),
  }) as unknown as Pick<Client, "connect" | "query" | "end">;
const env: ShowcaseCloudEnvironment = {
  SUPABASE_URL: "https://test.supabase.co",
  SUPABASE_SECRET_KEY: "test-backend-only",
  HYPERDRIVE_WRITER: { connectionString: "test" },
  IMAGES: {
    input: () => ({
      transform: () => ({
        output: async () => {
          throw new Error("invalid decode");
        },
      }),
    }),
  },
};
const request = (resource: string, body: unknown, method = "POST") =>
  new Request(`https://app.test/api/v1/cloud/classes/${ids[5]}/${resource}`, {
    method,
    body: JSON.stringify(body),
  });
describe("cloud showcase and interaction permissions", () => {
  it("blocks a teacher from creating a student planet and keeps one planet for each student", async () => {
    await expect(
      handleShowcaseCloud(
        request("planets", { name: "星球", color: "#123456" }),
        env,
        identity(ids[0]),
        ids[5],
        "planets",
        clientFactory,
      ),
    ).rejects.toMatchObject({ status: 403 });
    const response = await handleShowcaseCloud(
      request("planets", { name: "星球", color: "#123456" }),
      env,
      identity(ids[1]),
      ids[5],
      "planets",
      clientFactory,
    );
    expect(await response.json()).toEqual({ created: false });
  });
  it("counts one reaction on another work, deduplicates retries and rejects self and foreign work targets", async () => {
    const work = (
      await db.query(
        "SELECT id FROM showcase_works WHERE planet_id=$1 LIMIT 1",
        [ids[11]],
      )
    ).rows[0].id;
    const input = {
      planetId: ids[11],
      workId: work,
      kind: "like",
      content: "",
      requestId: randomUUID(),
    };
    await handleShowcaseCloud(
      request("interactions", input),
      env,
      identity(ids[2]),
      ids[5],
      "interactions",
      clientFactory,
    );
    await handleShowcaseCloud(
      request("interactions", input),
      env,
      identity(ids[2]),
      ids[5],
      "interactions",
      clientFactory,
    );
    await handleShowcaseCloud(
      request("interactions", { ...input, requestId: randomUUID() }),
      env,
      identity(ids[2]),
      ids[5],
      "interactions",
      clientFactory,
    );
    expect(
      (
        await db.query(
          "SELECT count(*)::int n FROM classroom_interactions WHERE kind='like'",
        )
      ).rows[0].n,
    ).toBe(1);
    await expect(
      handleShowcaseCloud(
        request("interactions", input),
        env,
        identity(ids[1]),
        ids[5],
        "interactions",
        clientFactory,
      ),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      handleShowcaseCloud(
        request("interactions", { ...input, workId: randomUUID() }),
        env,
        identity(ids[2]),
        ids[5],
        "interactions",
        clientFactory,
      ),
    ).rejects.toMatchObject({ status: 404 });
    await db.query("DELETE FROM classroom_interactions WHERE kind='like'");
  });
  it("rejects complete decode failures and oversized bodies without storing or counting a submission", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    try {
      const bytes = new Uint8Array(
        await readFile("apps/web/public/demo/body-2.png"),
      );
      const url = `https://app.test/api/v1/cloud/classes/${ids[5]}/works?title=test&requestId=${randomUUID()}`;
      await expect(
        handleShowcaseCloud(
          new Request(url, { method: "POST", body: bytes }),
          env,
          identity(ids[1]),
          ids[5],
          "works",
          clientFactory,
        ),
      ).rejects.toMatchObject({ status: 400, code: "IMAGE_DECODE_FAILED" });
      await expect(
        handleShowcaseCloud(
          new Request(url, {
            method: "POST",
            headers: { "Content-Length": "9000000" },
            body: "x",
          }),
          env,
          identity(ids[1]),
          ids[5],
          "works",
          clientFactory,
        ),
      ).rejects.toMatchObject({ status: 413 });
      expect(fetchMock).not.toHaveBeenCalled();
      expect(
        (await db.query("SELECT count(*)::int n FROM showcase_works")).rows[0]
          .n,
      ).toBe(2);
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it("allows only the owner and protects simultaneous element edits with a revision", async () => {
    const work = (
        await db.query(
          "SELECT id FROM showcase_works WHERE planet_id=$1 LIMIT 1",
          [ids[11]],
        )
      ).rows[0].id,
      input = {
        presetId: "portal",
        color: "#123456",
        x: 0.4,
        y: 0.6,
        size: 0.8,
        motion: "still",
        revision: 0,
      };
    await expect(
      handleShowcaseCloud(
        request(`works/${work}/element`, input, "PUT"),
        env,
        identity(ids[2]),
        ids[5],
        `works/${work}/element`,
        clientFactory,
      ),
    ).rejects.toMatchObject({ status: 409 });
    await handleShowcaseCloud(
      request(`works/${work}/element`, input, "PUT"),
      env,
      identity(ids[1]),
      ids[5],
      `works/${work}/element`,
      clientFactory,
    );
    await expect(
      handleShowcaseCloud(
        request(`works/${work}/element`, input, "PUT"),
        env,
        identity(ids[1]),
        ids[5],
        `works/${work}/element`,
        clientFactory,
      ),
    ).rejects.toMatchObject({ status: 409 });
  });
});
describe("teacher classroom statistics", () => {
  it("counts works and interactions independently without multiplied joins or foreign-class students", async () => {
    const overview = await classroomOverview(sql, identity(ids[0]), ids[5]);
    expect(overview.students).toHaveLength(2);
    const owner = overview.students.find((s) => s.enrollment_id === ids[8])!;
    expect(owner).toMatchObject({
      showcase_count: 2,
      weekly_showcase_count: 1,
      received_count: 3,
      sent_count: 0,
      planet_name: "小蓝星",
    });
    expect(
      overview.students.find((s) => s.enrollment_id === ids[9]),
    ).toMatchObject({
      showcase_count: 0,
      sent_count: 3,
      received_count: 0,
      planet_id: null,
    });
  });
  it("rejects student access and teachers from another class", async () => {
    await expect(
      classroomOverview(sql, identity(ids[1]), ids[5]),
    ).rejects.toMatchObject({ status: 403, code: "TEACHER_REQUIRED" });
    await expect(
      classroomOverview(sql, identity(ids[0]), ids[6]),
    ).rejects.toMatchObject({ status: 403, code: "CLASS_FORBIDDEN" });
  });
  it("rechecks revocation rather than trusting a cached role", async () => {
    await db.query("UPDATE enrollments SET status='inactive' WHERE id=$1", [
      ids[7],
    ]);
    await expect(
      classroomOverview(sql, identity(ids[0]), ids[5]),
    ).rejects.toMatchObject({ status: 403 });
    await db.query("UPDATE enrollments SET status='active' WHERE id=$1", [
      ids[7],
    ]);
  });
  it("rejects malformed class identifiers", async () => {
    await expect(
      classroomOverview(sql, identity(ids[0]), "not-a-class"),
    ).rejects.toMatchObject({ status: 400 });
  });
});
describe("expanded growth library", () => {
  it("provides 30 distinct bounded geometries within the shared rendering budget", () => {
    expect(GrowthPresetIds).toHaveLength(30);
    const signatures = new Set<string>();
    for (const id of GrowthPresetIds) {
      const shapes = growthShapes(id, 42);
      expect(shapes.length).toBeGreaterThan(0);
      expect(shapes.length).toBeLessThanOrEqual(GrowthLibrarySpec.maxShapes);
      signatures.add(JSON.stringify(shapes));
      for (const shape of shapes) {
        const values =
          shape.kind === "poly" || shape.kind === "line"
            ? shape.points
            : [shape.x, shape.y];
        expect(
          values.every((v) => Number.isFinite(v) && Math.abs(v) <= 100),
        ).toBe(true);
      }
    }
    expect(signatures.size).toBe(30);
  });
});
