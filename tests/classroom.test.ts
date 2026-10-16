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
import { ShowcaseReviewResponse } from "@colorverse/contracts";
import { showcaseReview } from "../apps/worker/src/showcase-review";
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
  await db.exec(
    await readFile("apps/api/migrations/004-showcase-withdrawal.sql", "utf8"),
  );
  await db.exec(
    await readFile("apps/api/migrations/005-showcase-reviews.sql", "utf8"),
  );
  await db.exec(
    await readFile("apps/api/migrations/006-learning-context.sql", "utf8"),
  );
  await db.exec(
    await readFile("apps/api/migrations/007-custom-assignments.sql", "utf8"),
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
  it("provides 38 distinct bounded geometries within the shared rendering budget", () => {
    expect(GrowthPresetIds).toHaveLength(38);
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
    expect(signatures.size).toBe(38);
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
        input = {
          name: "我的新星球",
          color: "#abcdef",
          skin: 4,
          halo: "ring",
          motion: {
            version: "1.0.0",
            mode: "fast",
            trajectory: "figure-eight",
            range: "wide",
            direction: "reverse",
          },
          revision: 0,
        };
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
        halo: "ring",
        motion: input.motion,
        revision: 1,
        media,
      });
      await handleShowcaseCloud(
        request(
          resource,
          {
            ...input,
            halo: undefined,
            motion: undefined,
            revision: 1,
            summary: "新介绍",
          },
          "PUT",
        ),
        env,
        identity(ids[1]),
        ids[5],
        resource,
        clientFactory,
      );
      expect(
        (await db.query("SELECT document FROM planets WHERE id=$1", [ids[11]]))
          .rows[0].document,
      ).toMatchObject({
        halo: "ring",
        motion: input.motion,
        media,
        revision: 2,
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

describe("reversible cloud work management", () => {
  const call = (
    resource: string,
    user: string,
    body?: unknown,
    method = "GET",
    cls = ids[5],
  ) =>
    handleShowcaseCloud(
      body === undefined
        ? new Request(`https://app.test/${resource}`, { method })
        : request(resource, body, method),
      env,
      identity(user),
      cls,
      resource.split("?")[0],
      clientFactory,
    );
  const gallery = async (user: string) =>
    (await (await call("planets", user)).json()).planets.find(
      (p: { id: string }) => p.id === ids[11],
    );
  async function isolated(
    run: (work: string, comment: string, like: string) => Promise<void>,
  ) {
    const work = randomUUID(),
      comment = randomUUID(),
      like = randomUUID();
    await db.query(
      "INSERT INTO showcase_works(id,planet_id,title,storage_key,byte_size,preset_id,request_id) VALUES($1,$2,'管理验证',$3,100,'paper-crane',$4)",
      [work, ids[11], randomUUID(), randomUUID()],
    );
    for (const [id, kind] of [
      [comment, "comment"],
      [like, "like"],
    ])
      await db.query(
        "INSERT INTO classroom_interactions(id,actor_enrollment_id,planet_id,work_id,kind,content,request_id) VALUES($1,$2,$3,$4,$5,'测试互动',$6)",
        [id, ids[9], ids[11], work, kind, randomUUID()],
      );
    try {
      await run(work, comment, like);
    } finally {
      vi.unstubAllGlobals();
      await db.query("DELETE FROM classroom_interactions WHERE work_id=$1", [
        work,
      ]);
      await db.query("DELETE FROM showcase_works WHERE id=$1", [work]);
    }
  }
  it("withdraws work and its element together, retains files/reactions, restricts private reads and restores original counts", async () =>
    isolated(async (work) => {
      const initial = await classroomOverview(sql, identity(ids[0]), ids[5]);
      const originalStats = (await gallery(ids[1])).stats;
      expect(
        originalStats.likes + originalStats.emojis + originalStats.comments,
      ).toBe(
        Number(
          initial.students.find((s) => s.enrollment_id === ids[8])!
            .received_count,
        ),
      );
      const initialGuide = (await (await call("guide", ids[1])).json())
        .completed;
      expect(
        (await gallery(ids[1])).works.find(
          (w: { id: string }) => w.id === work,
        ),
      ).toMatchObject({ withdrawn: false, canRestore: true });
      const own = () =>
        initial.students.find((s) => s.enrollment_id === ids[8]);
      await call(
        `works/${work}/visibility`,
        ids[1],
        { withdrawn: true, revision: 0 },
        "PUT",
      );
      expect(
        (await gallery(ids[2])).works.some(
          (w: { id: string }) => w.id === work,
        ),
      ).toBe(false);
      expect(
        (await gallery(ids[1])).works.find(
          (w: { id: string }) => w.id === work,
        ),
      ).toMatchObject({ withdrawn: true, canRestore: true, revision: 1 });
      expect(
        (await gallery(ids[0])).works.some(
          (w: { id: string }) => w.id === work,
        ),
      ).toBe(true);
      const hiddenStats = (await gallery(ids[2])).stats;
      expect(
        hiddenStats.likes + hiddenStats.emojis + hiddenStats.comments,
      ).toBe(
        originalStats.likes + originalStats.emojis + originalStats.comments - 2,
      );
      const withdrawn = (
        await classroomOverview(sql, identity(ids[0]), ids[5])
      ).students.find((s) => s.enrollment_id === ids[8]);
      expect(withdrawn!.showcase_count).toBe(Number(own()?.showcase_count) - 1);
      expect(withdrawn!.received_count).toBe(Number(own()?.received_count) - 2);
      expect((await (await call("guide", ids[1])).json()).completed).toEqual(
        initialGuide,
      );
      expect(
        (
          await db.query(
            "SELECT element_edited FROM showcase_works WHERE id=$1",
            [work],
          )
        ).rows[0].element_edited,
      ).toBe(false);
      const fetchMock = vi.fn(
        async () => new Response(new Uint8Array([1, 2, 3])),
      );
      vi.stubGlobal("fetch", fetchMock);
      for (const resource of ["image", "original"])
        await expect(
          call(`works/${work}/${resource}`, ids[2]),
        ).rejects.toMatchObject({ status: 404 });
      expect(fetchMock).not.toHaveBeenCalled();
      expect((await call(`works/${work}/image`, ids[1])).status).toBe(200);
      expect(
        (
          await db.query(
            "SELECT count(*)::int n FROM classroom_interactions WHERE work_id=$1",
            [work],
          )
        ).rows[0].n,
      ).toBe(2);
      await expect(
        call(
          `works/${work}/visibility`,
          ids[1],
          { withdrawn: false, revision: 0 },
          "PUT",
        ),
      ).rejects.toMatchObject({ status: 409 });
      await call(
        `works/${work}/visibility`,
        ids[1],
        { withdrawn: false, revision: 1 },
        "PUT",
      );
      const restored = (
        await classroomOverview(sql, identity(ids[0]), ids[5])
      ).students.find((s) => s.enrollment_id === ids[8]);
      expect(restored!.showcase_count).toBe(own()?.showcase_count);
      expect(restored!.received_count).toBe(own()?.received_count);
      expect(
        (await gallery(ids[2])).works.some(
          (w: { id: string }) => w.id === work,
        ),
      ).toBe(true);
      expect((await (await call("guide", ids[1])).json()).completed).toEqual(
        initialGuide,
      );
      expect(
        (
          await db.query(
            "SELECT element_edited FROM showcase_works WHERE id=$1",
            [work],
          )
        ).rows[0].element_edited,
      ).toBe(false);
    }));
  it("prevents peers and foreign classes from changing visibility and reserves teacher withdrawal recovery for staff", async () =>
    isolated(async (work) => {
      await expect(
        call(
          `works/${work}/visibility`,
          ids[2],
          { withdrawn: true, revision: 0 },
          "PUT",
        ),
      ).rejects.toMatchObject({ status: 409 });
      await expect(
        call(
          `works/${work}/visibility`,
          ids[3],
          { withdrawn: true, revision: 0 },
          "PUT",
          ids[6],
        ),
      ).rejects.toMatchObject({ status: 409 });
      await call(
        `works/${work}/visibility`,
        ids[0],
        { withdrawn: true, revision: 0 },
        "PUT",
      );
      expect(
        (await gallery(ids[1])).works.find((w: { id: string }) => w.id === work)
          .canRestore,
      ).toBe(false);
      await expect(
        call(
          `works/${work}/visibility`,
          ids[1],
          { withdrawn: false, revision: 1 },
          "PUT",
        ),
      ).rejects.toMatchObject({ status: 409 });
      await expect(
        call(
          `works/${work}/element`,
          ids[1],
          {
            presetId: "dream-kite",
            color: "#123456",
            x: 0.5,
            y: 0.5,
            size: 0.6,
            motion: "float",
            revision: 1,
          },
          "PUT",
        ),
      ).rejects.toMatchObject({ status: 409 });
      await expect(
        call(
          "interactions",
          ids[2],
          {
            planetId: ids[11],
            workId: work,
            kind: "comment",
            content: "不可评论已撤下作品",
            requestId: randomUUID(),
          },
          "POST",
        ),
      ).rejects.toMatchObject({ status: 404 });
      await call(
        `works/${work}/visibility`,
        ids[0],
        { withdrawn: false, revision: 1 },
        "PUT",
      );
    }));
  it("keeps an old own reaction cancellable beyond the 200-entry recent message window", async () =>
    isolated(async (work, _comment, like) => {
      await db.query(
        "UPDATE classroom_interactions SET created_at=now()-interval '10 days' WHERE id=$1",
        [like],
      );
      for (let i = 0; i < 205; i++)
        await db.query(
          "INSERT INTO classroom_interactions(id,actor_enrollment_id,planet_id,work_id,kind,content,request_id) VALUES($1,$2,$3,$4,'comment','窗口验证',$5)",
          [randomUUID(), ids[9], ids[11], work, randomUUID()],
        );
      const own = (
        await (await call(`interactions?planetId=${ids[11]}`, ids[2])).json()
      ).interactions;
      expect(own.some((i: { id: string }) => i.id === like)).toBe(true);
      expect(own.length).toBe(201);
      const peer = (
        await (await call(`interactions?planetId=${ids[11]}`, ids[1])).json()
      ).interactions;
      expect(peer.some((i: { id: string }) => i.id === like)).toBe(false);
      await call(`interactions/${like}`, ids[2], {}, "DELETE");
    }));
  it("only allows authors to withdraw reactions, and authors or verified class staff to remove comments", async () =>
    isolated(async (work, comment, like) => {
      const entries = (
        await (await call(`interactions?planetId=${ids[11]}`, ids[2])).json()
      ).interactions;
      expect(entries.find((i: { id: string }) => i.id === like)).toMatchObject({
        own: true,
        can_remove: true,
      });
      await expect(
        call(`interactions/${comment}`, ids[1], undefined, "DELETE"),
      ).rejects.toMatchObject({ status: 404 });
      await expect(
        call(`interactions/${comment}`, ids[3], undefined, "DELETE", ids[6]),
      ).rejects.toMatchObject({ status: 404 });
      await expect(
        call(`interactions/${like}`, ids[0], undefined, "DELETE"),
      ).rejects.toMatchObject({ status: 404 });
      await call(`interactions/${like}`, ids[2], {}, "DELETE");
      await call(
        "interactions",
        ids[2],
        {
          planetId: ids[11],
          workId: work,
          kind: "like",
          content: "",
          requestId: randomUUID(),
        },
        "POST",
      );
      expect(
        (
          await db.query(
            "SELECT count(*)::int n FROM classroom_interactions WHERE work_id=$1 AND kind='like'",
            [work],
          )
        ).rows[0].n,
      ).toBe(1);
      await call(`interactions/${comment}`, ids[0], {}, "DELETE");
      expect(
        (
          await db.query(
            "SELECT count(*)::int n FROM classroom_interactions WHERE id=$1",
            [comment],
          )
        ).rows[0].n,
      ).toBe(0);
    }));
});

describe("cloud teacher showcase reviews", () => {
  const work = async () => {
    const id = randomUUID();
    await db.query(
      "INSERT INTO showcase_works(id,planet_id,title,storage_key,byte_size,preset_id,request_id) VALUES($1,$2,'点评验证',$3,100,'crystal',$4)",
      [id, ids[11], randomUUID(), randomUUID()],
    );
    return id;
  };
  const call = (id: string, user = ids[0], body?: unknown, cls = ids[5]) =>
    handleShowcaseCloud(
      body === undefined
        ? new Request("https://app.test/review")
        : request("review", body),
      env,
      identity(user),
      cls,
      `works/${id}/review`,
      clientFactory,
    );
  const input = () => ({
    score: 88.5,
    comment: "冷暖对比清晰，建议保留更多留白。",
    revision: 0,
    requestId: randomUUID(),
  });
  it("only verified class staff can score; owners and peer students can read but not write", async () => {
    const id = await work();
    for (const student of [ids[1], ids[2]])
      await expect(call(id, student, input())).rejects.toMatchObject({
        status: 403,
        code: "TEACHER_REQUIRED",
      });
    await expect(call(id, ids[3], undefined, ids[6])).rejects.toMatchObject({
      status: 404,
    });
    await call(id, ids[0], input());
    const result = ShowcaseReviewResponse.parse(
      await (await call(id, ids[2])).json(),
    );
    expect(result.review).toMatchObject({
      source: "teacher",
      score: 88.5,
      revision: 1,
    });
    await db.query("UPDATE enrollments SET status='inactive' WHERE id=$1", [
      ids[7],
    ]);
    try {
      await expect(call(id, ids[0], input())).rejects.toMatchObject({
        status: 403,
      });
    } finally {
      await db.query("UPDATE enrollments SET status='active' WHERE id=$1", [
        ids[7],
      ]);
    }
  });
  it("rejects invalid scores, empty reviews, forged source and roles without writing", async () => {
    const id = await work();
    for (const patch of [
      { score: -1 },
      { score: 101 },
      { score: "90" },
      { score: null, comment: "  " },
      { source: "demo" },
      { role: "teacher" },
      { comment: "字".repeat(2001) },
      { revision: -1 },
    ])
      await expect(
        call(id, ids[0], { ...input(), ...patch }),
      ).rejects.toMatchObject({ status: 400 });
    expect(
      (
        await db.query(
          "SELECT count(*)::int n FROM showcase_reviews WHERE work_id=$1",
          [id],
        )
      ).rows[0].n,
    ).toBe(0);
  });
  it("idempotent retries create one version; changed request content and stale versions conflict", async () => {
    const id = await work(),
      body = input();
    const first = await (await call(id, ids[0], body)).json();
    expect(await (await call(id, ids[0], body)).json()).toEqual(first);
    await expect(
      call(id, ids[0], { ...body, score: 90 }),
    ).rejects.toMatchObject({ status: 409, code: "REQUEST_CONFLICT" });
    await expect(
      call(id, ids[0], { ...body, requestId: randomUUID() }),
    ).rejects.toMatchObject({ status: 409, code: "REVIEW_CONFLICT" });
    await call(id, ids[0], {
      ...body,
      score: 92,
      revision: 1,
      requestId: randomUUID(),
    });
    expect(
      (
        await db.query(
          "SELECT count(*)::int n FROM showcase_reviews WHERE work_id=$1",
          [id],
        )
      ).rows[0].n,
    ).toBe(2);
    for (const statement of [
      "UPDATE showcase_reviews SET score=1 WHERE work_id=$1",
      "DELETE FROM showcase_reviews WHERE work_id=$1",
    ])
      await expect(db.query(statement, [id])).rejects.toThrow("immutable");
    expect((await (await call(id, ids[1])).json()).review.score).toBe(92);
  });
  it("supports score-only and comment-only feedback including zero points", async () => {
    const id = await work();
    await call(id, ids[0], { ...input(), score: 0, comment: "" });
    expect((await (await call(id)).json()).review.score).toBe(0);
    await call(id, ids[0], {
      ...input(),
      score: null,
      comment: "  建议调整层次。  ",
      revision: 1,
    });
    expect((await (await call(id)).json()).review).toMatchObject({
      score: null,
      comment: "建议调整层次。",
    });
  });
  it("excludes demo suggestions and old versions from confirmed averages and retains feedback on withdrawal", async () => {
    const id = await work();
    await db.query(
      "INSERT INTO showcase_reviews(id,work_id,reviewer_enrollment_id,revision,base_revision,score,comment,source,request_id) VALUES($1,$2,$3,1,0,95,'演示建议','demo',$4)",
      [randomUUID(), id, ids[7], randomUUID()],
    );
    const before = (
      await classroomOverview(sql, identity(ids[0]), ids[5])
    ).students.find((s) => s.enrollment_id === ids[8])!;
    expect(before.suggested_review_count).toBe(1);
    await call(id, ids[0], { ...input(), score: 90, revision: 1 });
    const after = (
      await classroomOverview(sql, identity(ids[0]), ids[5])
    ).students.find((s) => s.enrollment_id === ids[8])!;
    expect(after.suggested_review_count).toBe(0);
    expect(after.reviewed_showcase_count).toBe(
      Number(before.reviewed_showcase_count) + 1,
    );
    await db.query(
      "UPDATE showcase_works SET withdrawn_at=now(),withdrawn_by=$1 WHERE id=$2",
      [ids[7], id],
    );
    await expect(call(id, ids[2])).rejects.toMatchObject({ status: 404 });
    expect((await (await call(id, ids[1])).json()).review.score).toBe(90);
    await expect(
      call(id, ids[0], { ...input(), revision: 2 }),
    ).rejects.toMatchObject({ status: 409, code: "WORK_WITHDRAWN" });
    const hidden = (
      await classroomOverview(sql, identity(ids[0]), ids[5])
    ).students.find((s) => s.enrollment_id === ids[8])!;
    expect(hidden.reviewed_showcase_count).toBe(before.reviewed_showcase_count);
    expect(hidden.average_showcase_score).toBe(before.average_showcase_score);
    await db.query(
      "UPDATE showcase_works SET withdrawn_at=NULL,withdrawn_by=NULL WHERE id=$1",
      [id],
    );
    expect((await (await call(id)).json()).review.revision).toBe(2);
  });
  it("works with SELECT/INSERT review privileges and cannot mutate review history", async () => {
    const id = await work(),
      role = `test_review_${randomUUID().replaceAll("-", "")}`;
    await db.exec(
      `CREATE ROLE ${role}; GRANT USAGE ON SCHEMA ${schema} TO ${role}; GRANT SELECT ON users,enrollments,planets TO ${role}; GRANT SELECT,UPDATE ON showcase_works TO ${role}; GRANT SELECT,INSERT ON showcase_reviews TO ${role}`,
    );
    try {
      await db.transaction(async (tx) => {
        await tx.exec(`SET LOCAL ROLE ${role}`);
        const limited = {
          query: (q: string, params: unknown[]) =>
            tx.query(q.replaceAll("colorverse.", `${schema}.`), params),
        };
        const saved = await showcaseReview(
          limited,
          { id: ids[7], role: "teacher" },
          ids[5],
          id,
          "POST",
          input(),
        );
        expect(saved.review).toMatchObject({ score: 88.5, source: "teacher" });
      });
      await expect(
        db.transaction(async (tx) => {
          await tx.exec(`SET LOCAL ROLE ${role}`);
          await tx.query(
            "UPDATE showcase_reviews SET score=1 WHERE work_id=$1",
            [id],
          );
        }),
      ).rejects.toThrow(/permission denied/i);
    } finally {
      await db.exec(`DROP OWNED BY ${role}; DROP ROLE ${role}`);
    }
  });
});

describe("cloud learning templates and evidence-based feedback", () => {
  it("persists task association and intent, restricts editing and peer visibility, preserves real grading", async () => {
    const call = async (
      resource: string,
      body: unknown,
      user = ids[0],
      method = "PUT",
      cls = ids[5],
    ) =>
      handleShowcaseCloud(
        request(resource, body, method),
        env,
        identity(user),
        cls,
        resource,
        clientFactory,
      );
    const setting = {
      taskId: "T01",
      published: true,
      requireExplanation: true,
      allowPeerReview: true,
      showIntentToPeers: false,
      revision: 0,
    };
    await expect(call("learning-tasks", setting, ids[1])).rejects.toMatchObject(
      { status: 403 },
    );
    await expect(call("learning-tasks", setting, ids[3])).rejects.toMatchObject(
      { status: 403 },
    );
    expect(
      (await (await call("learning-tasks", setting)).json()).tasks[0],
    ).toMatchObject({ revision: 1, published: true });
    await expect(call("learning-tasks", setting)).rejects.toMatchObject({
      status: 409,
    });
    const bytes = await readFile("apps/web/public/demo/body-0.png");
    const stored = vi.fn(async () => new Response("{}"));
    vi.stubGlobal("fetch", stored);
    const imageEnv = {
      ...env,
      IMAGES: {
        input: () => ({
          transform: () => ({
            output: async () => ({ response: () => new Response(bytes) }),
          }),
        }),
      },
    };
    const group = randomUUID();
    const learning = {
      taskId: "T01",
      comparisonGroupId: group,
      variantLabel: "宁静版",
      intendedMoods: ["宁静"],
      customMood: "",
      paletteColors: ["#789abc"],
      colorRationale: "蓝灰大面积与小面积暖色对照",
    };
    const upload = async (
      learning: unknown,
      user = ids[1],
      req = randomUUID(),
    ) => {
      const form = new FormData();
      form.set("image", new Blob([bytes], { type: "image/png" }), "demo.png");
      form.set(
        "metadata",
        JSON.stringify({
          title: "教学测试",
          description: "隔离测试",
          learning,
        }),
      );
      return handleShowcaseCloud(
        new Request(`https://app.test/works?requestId=${req}`, {
          method: "POST",
          body: form,
        }),
        imageEnv,
        identity(user),
        ids[5],
        "works",
        clientFactory,
      );
    };
    let workId = "";
    try {
      await expect(
        upload({ ...learning, colorRationale: "" }),
      ).rejects.toMatchObject({ status: 400 });
      expect(stored).not.toHaveBeenCalled();
      const req = randomUUID(),
        saved = await (await upload(learning, ids[1], req)).json();
      workId = saved.id;
      expect(saved.created).toBe(true);
      expect((await (await upload(learning, ids[1], req)).json()).created).toBe(
        false,
      );
      const gallery = async (user: string) =>
        await (
          await handleShowcaseCloud(
            new Request("https://app.test/planets"),
            env,
            identity(user),
            ids[5],
            "planets",
            clientFactory,
          )
        ).json();
      const mine = (await gallery(ids[1])).planets
        .find((p: { id: string }) => p.id === ids[11])
        .works.find((w: { id: string }) => w.id === workId);
      expect(mine.learning).toMatchObject(learning);
      expect(GrowthPresetIds).toContain(mine.presetId);
      const peer = (await gallery(ids[2])).planets
        .find((p: { id: string }) => p.id === ids[11])
        .works.find((w: { id: string }) => w.id === workId);
      expect(peer.learning).toMatchObject({
        intentHidden: true,
        colorRationale: "",
        intendedMoods: [],
        paletteColors: [],
      });
      const teacher = (await gallery(ids[0])).planets
        .find((p: { id: string }) => p.id === ids[11])
        .works.find((w: { id: string }) => w.id === workId);
      expect(teacher.learning.colorRationale).toBe(learning.colorRationale);
      const observation = {
        perceivedMoods: ["宁静"],
        customMood: "",
        visualEvidence: "大面积蓝灰，边缘明度低",
        suggestion: "暖色点缀可以再集中",
      };
      const feedback = {
        planetId: ids[11],
        workId,
        kind: "comment",
        content: "教学观察反馈",
        observation,
        requestId: randomUUID(),
      };
      await call("interactions", feedback, ids[2], "POST");
      await call("interactions", feedback, ids[2], "POST");
      await expect(
        call(
          "interactions",
          { ...feedback, requestId: randomUUID() },
          ids[1],
          "POST",
        ),
      ).rejects.toMatchObject({ status: 403 });
      const comments = (
        await (
          await handleShowcaseCloud(
            new Request(`https://app.test/interactions?planetId=${ids[11]}`),
            env,
            identity(ids[1]),
            ids[5],
            "interactions",
            clientFactory,
          )
        ).json()
      ).interactions.filter((i: { work_id: string }) => i.work_id === workId);
      expect(comments).toHaveLength(1);
      expect(comments[0].learning_feedback).toEqual(observation);
      const resource = `works/${workId}/review`,
        review = {
          score: 86,
          comment: "色彩依据清楚，可以继续比较点缀色位置",
          revision: 0,
          requestId: randomUUID(),
        };
      await expect(
        call(resource, review, ids[2], "POST"),
      ).rejects.toMatchObject({ status: 403 });
      await call(resource, review, ids[0], "POST");
      const result = await (
        await handleShowcaseCloud(
          new Request(`https://app.test/${resource}`),
          env,
          identity(ids[1]),
          ids[5],
          resource,
          clientFactory,
        )
      ).json();
      expect(result.review).toMatchObject({
        score: 86,
        comment: review.comment,
        source: "teacher",
      });
      await db.query(
        "INSERT INTO planets(id,owner_enrollment_id,document) VALUES($1,$2,$3)",
        [ids[14], ids[9], JSON.stringify({ metadata: { name: "组权限测试" } })],
      );
      await expect(upload(learning, ids[2])).rejects.toMatchObject({
        status: 403,
      });
    } finally {
      // This entire isolated test database is closed by afterAll; immutable reviews stay intact.
      await db.query("DELETE FROM planets WHERE id=$1", [ids[14]]);
      await db.query("DELETE FROM learning_task_settings", []);
      vi.unstubAllGlobals();
    }
  });
});

describe("teacher-authored assignments", () => {
  it("persists custom text and private images, rejects student creation, deduplicates retries and binds submissions", async () => {
    const bytes = await readFile("apps/web/public/assignments/two-moods.webp");
    const req = randomUUID();
    const definition = {
      title: "自定义 · 颜色日记",
      description: "保留生活中的一种颜色。",
      steps: ["观察颜色", "记录心情"],
      deliverables: "一张图与说明",
      inspiration: "色彩的奥秘",
      exampleObservation: "比较明暗",
    };
    const body = () => {
      const form = new FormData();
      form.set("metadata", JSON.stringify({ requestId: req, definition }));
      form.set(
        "image",
        new Blob([bytes], { type: "image/webp" }),
        "example.webp",
      );
      return new Request("https://app.test", { method: "POST", body: form });
    };
    await expect(
      handleShowcaseCloud(
        body(),
        env,
        identity(ids[1]),
        ids[5],
        "learning-tasks",
        clientFactory,
      ),
    ).rejects.toMatchObject({ status: 403 });
    const stored = vi.fn(
      async () =>
        new Response(bytes, { headers: { "Content-Type": "image/webp" } }),
    );
    vi.stubGlobal("fetch", stored);
    const imageEnv = {
      ...env,
      IMAGES: {
        input: () => ({
          transform: () => ({
            output: async () => ({ response: () => new Response(bytes) }),
          }),
        }),
      },
    };
    try {
      const first = await handleShowcaseCloud(
        body(),
        imageEnv,
        identity(ids[0]),
        ids[5],
        "learning-tasks",
        clientFactory,
      );
      expect(first.status).toBe(201);
      const result = await first.json();
      const id = result.taskId;
      expect(
        result.tasks.find((t: { taskId: string }) => t.taskId === id)
          .definition,
      ).toMatchObject({
        ...definition,
        image: `private:classes/${ids[5]}/learning-tasks/${id}/image`,
      });
      expect(
        (
          await handleShowcaseCloud(
            body(),
            imageEnv,
            identity(ids[0]),
            ids[5],
            "learning-tasks",
            clientFactory,
          )
        ).status,
      ).toBe(200);
      expect(stored).toHaveBeenCalledTimes(1);
      const requestImage = () =>
        new Request("https://app.test", { method: "GET" });
      expect(
        (
          await handleShowcaseCloud(
            requestImage(),
            imageEnv,
            identity(ids[1]),
            ids[5],
            `learning-tasks/${id}/image`,
            clientFactory,
          )
        ).status,
      ).toBe(200);
      await expect(
        handleShowcaseCloud(
          requestImage(),
          imageEnv,
          identity(ids[3]),
          ids[5],
          `learning-tasks/${id}/image`,
          clientFactory,
        ),
      ).rejects.toMatchObject({ status: 403 });
      const { classroomNotifications } =
        await import("../apps/worker/src/notifications");
      const incoming = await classroomNotifications(
        sql,
        { id: ids[8] },
        ids[5],
      );
      expect(
        incoming.notifications.find((n) => n.taskId === id)?.assignment?.title,
      ).toBe(definition.title);
      const { validateWorkLearning } =
        await import("../apps/worker/src/learning");
      const learning = await validateWorkLearning(
        sql,
        { id: ids[8], role: "student" },
        ids[5],
        { taskId: id, customMood: "期待", colorRationale: "明亮的黄色" },
      );
      expect(learning?.taskId).toBe(id);
      expect(learning?.taskTitle).toBe(definition.title);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
