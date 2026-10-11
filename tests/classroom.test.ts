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
import {
  GrowthPresetIds,
  GrowthLibrarySpec,
  CloudPlanetDocumentSchema,
} from "@colorverse/contracts";
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
    expect(await response.json()).toEqual({ created: false, id: ids[11] });
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

describe("cloud planet onboarding and personalization", () => {
  it("randomly creates one planet and returns that same planet on retries", async () => {
    try {
      const created = await handleShowcaseCloud(
        request("planets", { random: true }),
        env,
        identity(ids[2]),
        ids[5],
        "planets",
        clientFactory,
      );
      const first = await created.json();
      expect(first.created).toBe(true);
      const row = (
        await db.query("SELECT document FROM planets WHERE id=$1", [first.id])
      ).rows[0];
      expect(
        CloudPlanetDocumentSchema.parse(row.document).skin,
      ).toBeGreaterThanOrEqual(0);
      expect(CloudPlanetDocumentSchema.parse(row.document).skin).toBeLessThan(
        6,
      );
      expect(
        CloudPlanetDocumentSchema.parse(row.document).metadata.name,
      ).toBeTruthy();
      const retry = await handleShowcaseCloud(
        request("planets", { random: true }),
        env,
        identity(ids[2]),
        ids[5],
        "planets",
        clientFactory,
      );
      expect(await retry.json()).toEqual({ created: false, id: first.id });
    } finally {
      await db.query("DELETE FROM planets WHERE owner_enrollment_id=$1", [
        ids[9],
      ]);
    }
  });
  it("only lets the owner edit appearance, preserves media and rejects stale edits", async () => {
    const previous = CloudPlanetDocumentSchema.parse(
      (await db.query("SELECT document FROM planets WHERE id=$1", [ids[11]]))
        .rows[0].document,
    );
    const media = {
      exterior: { id: randomUUID(), key: "server-owned.webp", bytes: 120 },
    };
    try {
      await db.query("UPDATE planets SET document=$1 WHERE id=$2", [
        JSON.stringify({ ...previous, media }),
        ids[11],
      ]);
      const resource = `planets/${ids[11]}/appearance`,
        input = { name: "我的新星球", color: "#abcdef", skin: 4, revision: 0 };
      await expect(
        handleShowcaseCloud(
          request(resource, input, "PUT"),
          env,
          identity(ids[2]),
          ids[5],
          resource,
          clientFactory,
        ),
      ).rejects.toMatchObject({ status: 403 });
      await handleShowcaseCloud(
        request(resource, input, "PUT"),
        env,
        identity(ids[1]),
        ids[5],
        resource,
        clientFactory,
      );
      await expect(
        handleShowcaseCloud(
          request(resource, input, "PUT"),
          env,
          identity(ids[1]),
          ids[5],
          resource,
          clientFactory,
        ),
      ).rejects.toMatchObject({ status: 409 });
      expect(
        (await db.query("SELECT document FROM planets WHERE id=$1", [ids[11]]))
          .rows[0].document,
      ).toMatchObject({
        metadata: { name: input.name },
        skin: 4,
        revision: 1,
        media,
      });
    } finally {
      await db.query("UPDATE planets SET document=$1 WHERE id=$2", [
        JSON.stringify(previous),
        ids[11],
      ]);
    }
  });
  it("keeps planet images private, deduplicates uploads, checks ownership and replaces the old object", async () => {
    const previous = CloudPlanetDocumentSchema.parse(
      (await db.query("SELECT document FROM planets WHERE id=$1", [ids[11]]))
        .rows[0].document,
    );
    const objects = new Map<string, Uint8Array>();
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      if (init.method === "POST") {
        objects.set(url, init.body as Uint8Array);
        return new Response("{}");
      }
      if (init.method === "DELETE") {
        const { prefixes } = JSON.parse(init.body as string);
        for (const key of prefixes) objects.delete(`${url}/${key}`);
        return new Response("{}");
      }
      return new Response(objects.get(url) as BodyInit, {
        headers: { "Content-Type": "image/webp" },
      });
    });
    const imagesEnv = {
      ...env,
      IMAGES: {
        input: () => ({
          transform: () => ({
            output: async () => ({
              response: () => new Response(new Uint8Array([1, 2, 3])),
            }),
          }),
        }),
      },
    };
    const bytes = await readFile("apps/web/public/demo/body-0.png");
    const resource = `planets/${ids[11]}/exterior`,
      requestId = randomUUID();
    const upload = (revision: number, retry = requestId) =>
      new Request(
        `https://app.test/${resource}?requestId=${retry}&revision=${revision}`,
        { method: "POST", body: bytes },
      );
    try {
      await expect(
        handleShowcaseCloud(
          upload(0),
          imagesEnv,
          identity(ids[2]),
          ids[5],
          resource,
          clientFactory,
        ),
      ).rejects.toMatchObject({ status: 403 });
      const saved = await handleShowcaseCloud(
        upload(0),
        imagesEnv,
        identity(ids[1]),
        ids[5],
        resource,
        clientFactory,
      );
      const first = await saved.json();
      const retry = await handleShowcaseCloud(
        upload(0),
        imagesEnv,
        identity(ids[1]),
        ids[5],
        resource,
        clientFactory,
      );
      expect(await retry.json()).toEqual(first);
      expect(objects.size).toBe(1);
      const peerImage = await handleShowcaseCloud(
        new Request(`https://app.test/${resource}`),
        imagesEnv,
        identity(ids[2]),
        ids[5],
        resource,
        clientFactory,
      );
      expect(peerImage.headers.get("Content-Type")).toBe("image/webp");
      expect(new Uint8Array(await peerImage.arrayBuffer())).toEqual(
        new Uint8Array([1, 2, 3]),
      );
      await expect(
        handleShowcaseCloud(
          new Request(`https://app.test/${resource}`),
          imagesEnv,
          identity(ids[3]),
          ids[5],
          resource,
          clientFactory,
        ),
      ).rejects.toMatchObject({ status: 403 });
      await expect(
        handleShowcaseCloud(
          upload(0, randomUUID()),
          imagesEnv,
          identity(ids[1]),
          ids[5],
          resource,
          clientFactory,
        ),
      ).rejects.toMatchObject({ status: 409 });
      await handleShowcaseCloud(
        upload(1, randomUUID()),
        imagesEnv,
        identity(ids[1]),
        ids[5],
        resource,
        clientFactory,
      );
      expect(objects.size).toBe(1);
      const document = CloudPlanetDocumentSchema.parse(
        (await db.query("SELECT document FROM planets WHERE id=$1", [ids[11]]))
          .rows[0].document,
      );
      expect(document.revision).toBe(2);
      expect(document.media.exterior?.id).not.toBe(first.id);
      expect(document.metadata).toEqual(previous.metadata);
    } finally {
      vi.unstubAllGlobals();
      await db.query("UPDATE planets SET document=$1 WHERE id=$2", [
        JSON.stringify(previous),
        ids[11],
      ]);
    }
  });
});

describe("student guided tasks", () => {
  const guideRequest = () =>
    new Request(`https://app.test/classes/${ids[5]}/guide`);
  const progress = async (user = ids[1]) =>
    (
      await handleShowcaseCloud(
        guideRequest(),
        env,
        identity(user),
        ids[5],
        "guide",
        clientFactory,
      )
    ).json();
  it("derives tasks from saved cloud facts, excludes received reactions and preserves private image fields", async () => {
    const previous = (
      await db.query("SELECT document FROM planets WHERE id=$1", [ids[11]])
    ).rows[0].document as Record<string, unknown>;
    try {
      const initial = await progress();
      expect(initial.completed).toContain("work");
      expect(initial.completed).not.toContain("comment"); // This student has received comments but has sent none.
      expect(initial.completed).not.toContain("tone");
      expect(initial.hasPeers).toBe(false); // Another enrolled student has no planet yet.
      const media = {
        exterior: {
          id: randomUUID(),
          key: "private-original.webp",
          bytes: 123,
          requestId: randomUUID(),
        },
      };
      await db.query("UPDATE planets SET document=$1 WHERE id=$2", [
        JSON.stringify({ ...previous, media, revision: 0 }),
        ids[11],
      ]);
      const resource = `planets/${ids[11]}/appearance`;
      const update = {
        name: "探索星",
        color: "#123456",
        skin: 1,
        atmosphere: "fireflies",
        summary: "我的色彩灵感来自海面。",
        brightness: 1.2,
        saturation: 0.8,
        practice: "tone",
        revision: 0,
      };
      await handleShowcaseCloud(
        request(resource, update, "PUT"),
        env,
        identity(ids[1]),
        ids[5],
        resource,
        clientFactory,
      );
      expect((await progress()).completed).toEqual(
        expect.arrayContaining([
          "exterior",
          "atmosphere",
          "summary",
          "tone",
          "work",
        ]),
      );
      const saved = (
        await db.query("SELECT document FROM planets WHERE id=$1", [ids[11]])
      ).rows[0].document as Record<string, unknown>;
      expect(saved.media).toEqual(media);
      expect(saved).toMatchObject({
        brightness: 1.2,
        saturation: 0.8,
        guide: { tone: true },
      });
      for (const invalid of [
        { brightness: 10 },
        { saturation: -1 },
        { atmosphere: "invalid" },
        { summary: "x".repeat(1001) },
        { guide: { visited: true } },
      ]) {
        await expect(
          handleShowcaseCloud(
            request(resource, { ...update, revision: 1, ...invalid }, "PUT"),
            env,
            identity(ids[1]),
            ids[5],
            resource,
            clientFactory,
          ),
        ).rejects.toMatchObject({ status: 400 });
      }
      expect(
        (await db.query("SELECT document FROM planets WHERE id=$1", [ids[11]]))
          .rows[0].document,
      ).toEqual(saved);
    } finally {
      await db.query("UPDATE planets SET document=$1 WHERE id=$2", [
        JSON.stringify(previous),
        ids[11],
      ]);
    }
  });
  it("records only a verified peer visit, keeps it across reads and does not bump image revision", async () => {
    const peerPlanet = randomUUID();
    const otherPrevious = (
      await db.query("SELECT document FROM planets WHERE id=$1", [ids[11]])
    ).rows[0].document as Record<string, unknown>;
    try {
      await expect(progress(ids[0])).rejects.toMatchObject({ status: 403 });
      await expect(
        handleShowcaseCloud(
          guideRequest(),
          env,
          identity(ids[3]),
          ids[5],
          "guide",
          clientFactory,
        ),
      ).rejects.toMatchObject({ status: 403 });
      await expect(
        handleShowcaseCloud(
          request("guide", { planetId: ids[11] }),
          env,
          identity(ids[1]),
          ids[5],
          "guide",
          clientFactory,
        ),
      ).rejects.toMatchObject({ status: 404 });
      await expect(
        handleShowcaseCloud(
          request("guide", { planetId: randomUUID() }),
          env,
          identity(ids[1]),
          ids[5],
          "guide",
          clientFactory,
        ),
      ).rejects.toMatchObject({ status: 404 });
      await expect(
        handleShowcaseCloud(
          request("guide", { planetId: ids[11] }),
          env,
          identity(ids[2]),
          ids[5],
          "guide",
          clientFactory,
        ),
      ).rejects.toMatchObject({ status: 409 });
      await db.query(
        "INSERT INTO planets(id,owner_enrollment_id,document) VALUES($1,$2,$3)",
        [
          peerPlanet,
          ids[9],
          JSON.stringify({ metadata: { name: "同学星球" } }),
        ],
      );
      expect((await progress()).hasPeers).toBe(true);
      for (let i = 0; i < 2; i++)
        await handleShowcaseCloud(
          request("guide", { planetId: peerPlanet }),
          env,
          identity(ids[1]),
          ids[5],
          "guide",
          clientFactory,
        );
      expect((await progress()).completed).toContain("visit");
      expect(
        (await db.query("SELECT document FROM planets WHERE id=$1", [ids[11]]))
          .rows[0].document as Record<string, unknown>,
      ).toMatchObject({ revision: otherPrevious.revision });
      const interaction = {
        planetId: peerPlanet,
        workId: null,
        kind: "emoji",
        content: "✨",
        requestId: randomUUID(),
      };
      await handleShowcaseCloud(
        request("interactions", interaction),
        env,
        identity(ids[1]),
        ids[5],
        "interactions",
        clientFactory,
      );
      expect((await progress()).completed).toContain("reaction");
      await handleShowcaseCloud(
        request("interactions", {
          ...interaction,
          kind: "comment",
          content: "冷暖对比很有意思！",
          requestId: randomUUID(),
        }),
        env,
        identity(ids[1]),
        ids[5],
        "interactions",
        clientFactory,
      );
      expect((await progress()).completed).toEqual(
        expect.arrayContaining(["visit", "reaction", "comment"]),
      );
    } finally {
      await db.query("DELETE FROM classroom_interactions WHERE planet_id=$1", [
        peerPlanet,
      ]);
      await db.query("DELETE FROM planets WHERE id=$1", [peerPlanet]);
      await db.query("UPDATE planets SET document=$1 WHERE id=$2", [
        JSON.stringify(otherPrevious),
        ids[11],
      ]);
    }
  });
});
