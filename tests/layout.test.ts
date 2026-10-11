import "fake-indexeddb/auto";
import { openDB } from "idb";
import { describe, expect, it } from "vitest";
import { LocalWorkspace } from "../apps/web/src/adapters/local/store";
import { fixturePlanet, fixtureUniverse } from "@colorverse/fixtures";
import { UniverseLayoutService } from "@colorverse/application";
import {
  canMovePlanet,
  CLASSROOM_BOUNDS,
  clampPlanetPosition,
  type LayoutActor,
} from "@colorverse/domain";
const student: LayoutActor = { role: "student", userId: "student-a" },
  teacher: LayoutActor = { role: "teacher", userId: "teacher-a" };
async function setup() {
  const repo = new LocalWorkspace(crypto.randomUUID()),
    docs = [fixturePlanet(0), fixturePlanet(1)],
    universe = fixtureUniverse(docs);
  await repo.importAtomic(docs, universe, new Map(), "seed");
  await repo.assignOwner(docs[0].planetId, student.userId);
  await repo.assignOwner(docs[1].planetId, "student-b");
  return { repo, docs, universe, service: new UniverseLayoutService(repo) };
}
describe("universe layout authorization and persistence", () => {
  it("atomically rejects out-of-area and orbit-crossing moves, including direct teacher calls", async () => {
    const { repo, universe, service } = await setup(),
      entry = universe.entries[0];
    const move = {
      universeId: universe.universeId,
      planetId: entry.planetId,
      expectedPosition: entry.position,
      expectedLayoutRevision: 0,
      position: { x: CLASSROOM_BOUNDS.right, y: 450 },
    };
    const original = await repo.getUniverse();
    await expect(service.move(move, student)).rejects.toMatchObject({
      code: "LAYOUT_OUT_OF_BOUNDS",
    });
    await expect(
      repo.movePlanet({ ...move, position: { x: 999999, y: 450 } }, teacher),
    ).rejects.toMatchObject({ code: "LAYOUT_OUT_OF_BOUNDS" });
    expect(await repo.getUniverse()).toEqual(original);
    const position = clampPlanetPosition(
      entry,
      universe.layout.seed,
      move.position,
    );
    await service.move({ ...move, position }, student);
    expect((await repo.getUniverse()).entries[0].position).toEqual(position);
    expect((await repo.getUniverse()).entries[0].layoutRevision).toBe(1);
    await repo.close();
  });
  it("rejects a motion expansion at an edge without losing the previous path", async () => {
    const { repo, universe } = await setup(),
      entry = universe.entries[0];
    const stationary = {
      version: "1.0.0",
      mode: "stationary",
      trajectory: "circle",
      range: "wide",
      direction: "forward",
    } as const;
    const position = clampPlanetPosition(
      { ...entry, motion: stationary },
      universe.layout.seed,
      { x: CLASSROOM_BOUNDS.right, y: 450 },
    );
    await repo.configurePlanetMotion(
      {
        universeId: universe.universeId,
        planetId: entry.planetId,
        position,
        motion: stationary,
        expectedLayoutRevision: 0,
      },
      student,
    );
    const original = await repo.getUniverse();
    // The right-edge stationary body fits; a wide circular orbit does not.
    await expect(
      repo.configurePlanetMotion(
        {
          universeId: universe.universeId,
          planetId: entry.planetId,
          position,
          motion: { ...stationary, mode: "slow", trajectory: "figure-eight" },
          expectedLayoutRevision: 1,
        },
        teacher,
      ),
    ).rejects.toMatchObject({ code: "LAYOUT_OUT_OF_BOUNDS" });
    expect(await repo.getUniverse()).toEqual(original);
    await repo.close();
  });
  it("preserves imported positions outside the new area until explicitly moved inward", async () => {
    const repo = new LocalWorkspace(crypto.randomUUID()),
      p = fixturePlanet(0),
      u = fixtureUniverse([p]);
    u.entries[0].position = { x: 90000, y: -50000 };
    await repo.importAtomic([p], u, new Map(), "legacy");
    await repo.assignOwner(p.planetId, student.userId);
    expect(await repo.getUniverse()).toEqual(u);
    await repo.saveUniverse(u);
    expect((await repo.getUniverse()).entries[0].position).toEqual(
      u.entries[0].position,
    );
    const current = await repo.getUniverse();
    await repo.movePlanet(
      {
        universeId: u.universeId,
        planetId: p.planetId,
        expectedPosition: u.entries[0].position,
        expectedLayoutRevision: current.entries[0].layoutRevision ?? 0,
        position: { x: 800, y: 450 },
      },
      student,
    );
    expect((await repo.getUniverse()).entries[0].position).toEqual({
      x: 800,
      y: 450,
    });
    expect(await repo.get(p.planetId)).toEqual(p);
    await repo.close();
  });
  it("rejects a boundary-crossing display enlargement without partially updating layout", async () => {
    const { repo, universe } = await setup(),
      entry = universe.entries[0];
    const motion = {
      version: "1.0.0",
      mode: "stationary",
      trajectory: "circle",
      range: "wide",
      direction: "forward",
    } as const;
    const position = clampPlanetPosition(
      { ...entry, motion },
      universe.layout.seed,
      { x: CLASSROOM_BOUNDS.right, y: 450 },
    );
    await repo.configurePlanetMotion(
      {
        universeId: universe.universeId,
        planetId: entry.planetId,
        position,
        motion,
        expectedLayoutRevision: 0,
      },
      teacher,
    );
    const original = await repo.getUniverse(),
      enlarged = structuredClone(original);
    enlarged.entries[0].scale = 1.2;
    await expect(repo.saveUniverse(enlarged)).rejects.toMatchObject({
      code: "LAYOUT_OUT_OF_BOUNDS",
    });
    expect(await repo.getUniverse()).toEqual(original);
    await repo.close();
  });
  it("students can move only their own planet; teachers can move all, including unassigned", () => {
    expect(canMovePlanet(student, "student-a")).toBe(true);
    expect(canMovePlanet(student, "student-b")).toBe(false);
    expect(canMovePlanet(student, null)).toBe(false);
    expect(canMovePlanet(teacher, null)).toBe(true);
    expect(canMovePlanet({ ...teacher, userId: "" }, null)).toBe(false);
  });
  it("checks ownership in both service and atomic storage, never using author names", async () => {
    const { repo, docs, universe, service } = await setup(),
      entry = universe.entries[1];
    const move = {
      universeId: universe.universeId,
      planetId: entry.planetId,
      expectedPosition: entry.position,
      expectedLayoutRevision: 0,
      position: { x: 1500, y: 1600 },
    };
    await expect(service.move(move, student)).rejects.toThrow("学生只能");
    await expect(repo.movePlanet(move, student)).rejects.toThrow("学生只能");
    expect((await repo.getUniverse()).entries[1].position).toEqual(
      entry.position,
    );
    await service.move(move, teacher);
    expect((await repo.getUniverse()).entries[1].position).toEqual(
      move.position,
    );
    expect(await repo.get(docs[1].planetId)).toEqual(docs[1]);
    await repo.close();
  });
  it("rejects stale concurrent moves while keeping unrelated positions intact", async () => {
    const { repo, universe, service } = await setup(),
      e = universe.entries[0];
    const move = {
      universeId: universe.universeId,
      planetId: e.planetId,
      expectedPosition: e.position,
      expectedLayoutRevision: 0,
      position: { x: -2300, y: 1200 },
    };
    const results = await Promise.allSettled([
      service.move(move, student),
      service.move({ ...move, position: { x: -1000, y: 600 } }, student),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
    expect((await repo.getUniverse()).entries[1]).toEqual({
      ...universe.entries[1],
      layoutRevision: 0,
    });
    await repo.close();
  });
  it("rejects invalid coordinates and hidden or missing entries without partial writes", async () => {
    const { repo, universe, service } = await setup(),
      e = universe.entries[0];
    const move = {
      universeId: universe.universeId,
      planetId: e.planetId,
      expectedPosition: e.position,
      expectedLayoutRevision: 0,
      position: { x: NaN, y: 1 },
    };
    await expect(service.move(move, student)).rejects.toThrow("有限坐标");
    await expect(repo.movePlanet(move, student)).rejects.toThrow();
    expect(await repo.getUniverse()).toEqual(universe);
    universe.entries[0].visible = false;
    await repo.saveUniverse(universe);
    await expect(
      service.move({ ...move, position: { x: 1, y: 2 } }, student),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await repo.close();
  });
  it("upgrades the v1 database without losing works/assets and migrates only unchanged demo anchors once", async () => {
    const name = crypto.randomUUID(),
      p = fixturePlanet(0),
      u = fixtureUniverse([p]);
    u.entries[0].position = { x: 990, y: 455 };
    const old = await openDB(name, 1, {
      upgrade(db) {
        for (const s of [
          "planets",
          "revisions",
          "assets",
          "universes",
          "imports",
        ])
          db.createObjectStore(s);
      },
    });
    await old.put("planets", p, p.planetId);
    await old.put("assets", new Blob(["original"]), "original.png");
    await old.put("universes", u, u.universeId);
    old.close();
    const repo = new LocalWorkspace(name);
    expect(await repo.get(p.planetId)).toEqual(p);
    expect(await (await repo.read("original.png")).text()).toBe("original");
    await repo.migrateDemoLayout([
      {
        planetId: p.planetId,
        before: u.entries[0].position,
        after: { x: 500, y: 200 },
      },
    ]);
    expect((await repo.getUniverse()).entries[0].position).toEqual({
      x: 500,
      y: 200,
    });
    await repo.migrateDemoLayout([
      {
        planetId: p.planetId,
        before: { x: 500, y: 200 },
        after: { x: 100, y: 100 },
      },
    ]);
    expect((await repo.getUniverse()).entries[0].position).toEqual({
      x: 500,
      y: 200,
    });
    await repo.close();
    const custom = new LocalWorkspace(crypto.randomUUID());
    u.entries[0].position = { x: 45, y: 50 };
    await custom.importAtomic([p], u, new Map(), "seed");
    await custom.migrateDemoLayout([
      {
        planetId: p.planetId,
        before: { x: 990, y: 455 },
        after: { x: 500, y: 200 },
      },
    ]);
    expect((await custom.getUniverse()).entries[0].position).toEqual({
      x: 45,
      y: 50,
    });
    await custom.close();
  });
});
