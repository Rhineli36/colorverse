import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import {
  MotionSchema,
  UniverseSchema,
  LegacyUniverseSchema,
  type PlanetMotion,
} from "@colorverse/contracts";
import { fixturePlanet, fixtureUniverse } from "@colorverse/fixtures";
import {
  DEFAULT_PLANET_MOTION,
  upgradeUniverse,
  planetOrbit,
  orbitPosition,
  orbitBounds,
  overviewCamera,
  nextPlanetPosition,
} from "@colorverse/domain";
import { LocalWorkspace } from "../apps/web/src/adapters/local/store";
import { UniverseLayoutService } from "@colorverse/application";
const student = { role: "student" as const, userId: "a" },
  teacher = { role: "teacher" as const, userId: "t" };
async function setup() {
  const repo = new LocalWorkspace(crypto.randomUUID()),
    planets = [fixturePlanet(0), fixturePlanet(1)],
    u = fixtureUniverse(planets);
  await repo.importAtomic(planets, u, new Map(), "seed");
  await repo.assignOwner(planets[0].planetId, "a");
  await repo.assignOwner(planets[1].planetId, "b");
  return { repo, planets, u, service: new UniverseLayoutService(repo) };
}
describe("versioned planet motion", () => {
  it("frames complete paths for 24 mixed stationary, slow and fast planets", () => {
    const u = upgradeUniverse(fixtureUniverse([fixturePlanet(0)]));
    for (let i = 1; i < 24; i++)
      u.entries.push({
        ...u.entries[0],
        planetId: fixturePlanet(i).planetId,
        position: nextPlanetPosition(u.entries, 42),
        order: i,
      });
    u.entries.forEach((e, i) => {
      e.motion = {
        ...DEFAULT_PLANET_MOTION,
        mode: (["stationary", "slow", "fast"] as const)[i % 3],
        trajectory: (["circle", "ellipse", "figure-eight", "drift"] as const)[
          i % 4
        ],
        range: "wide",
      };
    });
    const viewport = { width: 1440, height: 1000 },
      camera = overviewCamera(u.entries, 42, viewport),
      base = Math.min(viewport.width / 1600, viewport.height / 900);
    for (const e of u.entries) {
      const b = orbitBounds(e, 42),
        x = (p: number) =>
          viewport.width / 2 + (p - 800) * base * camera.zoom + camera.x * base,
        y = (p: number) =>
          viewport.height / 2 +
          (p - 450) * base * camera.zoom +
          camera.y * base;
      expect(x(b.left)).toBeGreaterThanOrEqual(0);
      expect(x(b.right)).toBeLessThanOrEqual(viewport.width);
      expect(y(b.top)).toBeGreaterThanOrEqual(120 - 1e-6);
      expect(y(b.bottom)).toBeLessThanOrEqual(viewport.height - 135 + 1e-6);
    }
  });
  it("rechecks real ownership after an application precheck with stale ownership", async () => {
    const { repo, u } = await setup(),
      e = u.entries[1];
    const staleService = new UniverseLayoutService({
      getPlanetOwner: async () => student.userId,
      movePlanet: repo.movePlanet.bind(repo),
      configurePlanetMotion: repo.configurePlanetMotion.bind(repo),
    });
    await expect(
      staleService.configureMotion(
        {
          universeId: u.universeId,
          planetId: e.planetId,
          position: e.position,
          motion: DEFAULT_PLANET_MOTION,
          expectedLayoutRevision: 0,
        },
        student,
      ),
    ).rejects.toThrow("学生只能");
    expect(await repo.getUniverse()).toEqual(u);
    await repo.close();
  });
  it("migrates layout without moving anchors, modifying input or changing unconfigured legacy paths", () => {
    const old = fixtureUniverse([fixturePlanet(0)]),
      before = structuredClone(old),
      current = upgradeUniverse(old);
    expect(old).toEqual(before);
    expect(current.schemaVersion).toBe("1.1.0");
    expect(current.entries[0].layoutRevision).toBe(0);
    expect(planetOrbit(current.entries[0], 42)).toEqual(
      planetOrbit(old.entries[0], 42),
    );
    expect(upgradeUniverse(current)).toEqual(current);
    expect(UniverseSchema.safeParse(current).success).toBe(true);
    expect(LegacyUniverseSchema.safeParse(current).success).toBe(false);
    expect(
      UniverseSchema.safeParse({ ...current, requiredCapabilities: [] })
        .success,
    ).toBe(false);
    expect(
      UniverseSchema.safeParse({ ...old, entries: current.entries }).success,
    ).toBe(false);
  });
  it("rejects arbitrary paths, speeds, ranges and future versions", () => {
    for (const patch of [
      { trajectory: "custom" },
      { mode: "warp" },
      { range: 1000 },
      { periodSec: 1 },
      { version: "2.0.0" },
    ])
      expect(
        MotionSchema.safeParse({ ...DEFAULT_PLANET_MOTION, ...patch }).success,
      ).toBe(false);
  });
  it("all controlled paths start at the anchor, close, respect bounds and reverse deterministically", () => {
    const e = upgradeUniverse(fixtureUniverse([fixturePlanet(0)])).entries[0];
    for (const trajectory of [
      "circle",
      "ellipse",
      "figure-eight",
      "drift",
    ] as const)
      for (const range of ["compact", "regular", "wide"] as const)
        for (const mode of ["slow", "fast"] as const) {
          e.motion = { ...DEFAULT_PLANET_MOTION, trajectory, range, mode };
          const o = planetOrbit(e, 42),
            b = orbitBounds(e, 42),
            r = 256 * 0.8 * 0.9;
          expect(o.periodSec).toBeGreaterThanOrEqual(mode === "slow" ? 90 : 30);
          expect(o.periodSec).toBeLessThanOrEqual(mode === "slow" ? 190 : 60);
          expect(orbitPosition(o, 0).x).toBeCloseTo(e.position.x);
          expect(orbitPosition(o, 0).y).toBeCloseTo(e.position.y);
          expect(orbitPosition(o, o.periodSec).x).toBeCloseTo(e.position.x);
          expect(orbitPosition(o, o.periodSec).y).toBeCloseTo(e.position.y);
          const reverse = planetOrbit(
            { ...e, motion: { ...e.motion, direction: "reverse" as const } },
            42,
          );
          expect(orbitPosition(reverse, 10).x).toBeCloseTo(
            orbitPosition(o, -10).x,
          );
          for (let i = 0; i < 128; i++) {
            const p = orbitPosition(o, (o.periodSec * i) / 128);
            expect(p.x - r).toBeGreaterThanOrEqual(b.left - 1e-6);
            expect(p.x + r).toBeLessThanOrEqual(b.right + 1e-6);
            expect(p.y - r).toBeGreaterThanOrEqual(b.top - 1e-6);
            expect(p.y + r).toBeLessThanOrEqual(b.bottom + 1e-6);
          }
        }
  });
  it("stationary preserves the selected path and has no position change", () => {
    const e = upgradeUniverse(fixtureUniverse([fixturePlanet(0)])).entries[0];
    e.motion = {
      ...DEFAULT_PLANET_MOTION,
      mode: "stationary",
      trajectory: "figure-eight",
    };
    const o = planetOrbit(e, 42);
    for (const t of [0, 1, 5000])
      expect(orbitPosition(o, t)).toEqual(e.position);
    expect(e.motion.trajectory).toBe("figure-eight");
  });
  it("service and storage enforce ownership, visible membership and immutable artwork", async () => {
    const { repo, u, planets, service } = await setup();
    const change = {
      universeId: u.universeId,
      planetId: planets[1].planetId,
      motion: DEFAULT_PLANET_MOTION,
      position: { x: 5, y: 6 },
      expectedLayoutRevision: 0,
    };
    await expect(service.configureMotion(change, student)).rejects.toThrow(
      "学生只能",
    );
    await expect(repo.configurePlanetMotion(change, student)).rejects.toThrow(
      "学生只能",
    );
    expect(await repo.getUniverse()).toEqual(u);
    await service.configureMotion(change, teacher);
    expect((await repo.getUniverse()).entries[1]).toMatchObject({
      position: change.position,
      motion: change.motion,
      layoutRevision: 1,
    });
    expect(await repo.get(planets[1].planetId)).toEqual(planets[1]);
    await expect(
      repo.configurePlanetMotion(
        {
          ...change,
          motion: {
            ...change.motion,
            range: "unbounded",
          } as unknown as PlanetMotion,
        },
        teacher,
      ),
    ).rejects.toThrow();
    await expect(
      repo.configurePlanetMotion(
        { ...change, planetId: crypto.randomUUID() },
        teacher,
      ),
    ).rejects.toThrow("离开");
    const latest = await repo.getUniverse();
    latest.entries[1].visible = false;
    await repo.saveUniverse(latest);
    await expect(
      service.configureMotion(
        { ...change, expectedLayoutRevision: 1 },
        teacher,
      ),
    ).rejects.toThrow("隐藏");
    await repo.close();
  });
  it("shares revisions across motion and dragging, rejecting concurrent writes and ABA", async () => {
    const { repo, u, service } = await setup(),
      e = u.entries[0],
      base = {
        universeId: u.universeId,
        planetId: e.planetId,
        position: e.position,
        expectedLayoutRevision: 0,
      };
    const results = await Promise.allSettled([
      service.configureMotion(
        { ...base, motion: DEFAULT_PLANET_MOTION },
        student,
      ),
      service.move({ ...base, expectedPosition: e.position }, student),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const current = await repo.getUniverse(),
      motion = { ...DEFAULT_PLANET_MOTION, mode: "stationary" as const };
    await service.configureMotion(
      { ...base, motion, expectedLayoutRevision: 1 },
      student,
    );
    await service.configureMotion(
      { ...base, motion: DEFAULT_PLANET_MOTION, expectedLayoutRevision: 2 },
      student,
    );
    await expect(
      service.configureMotion(
        { ...base, motion, expectedLayoutRevision: 1 },
        student,
      ),
    ).rejects.toThrow("另一个窗口");
    await expect(
      service.move({ ...base, expectedPosition: e.position }, student),
    ).rejects.toThrow("另一个窗口");
    expect((await repo.getUniverse()).entries[1]).toEqual({
      ...u.entries[1],
      layoutRevision: 0,
    });
    expect(current.entries[0].layoutRevision).toBe(1);
    await repo.close();
  });
  it("preserves newer motion during imports and rejects stale full-layout management", async () => {
    const { repo, u, service } = await setup(),
      e = u.entries[0];
    await service.configureMotion(
      {
        universeId: u.universeId,
        planetId: e.planetId,
        position: e.position,
        expectedLayoutRevision: 0,
        motion: { ...DEFAULT_PLANET_MOTION, mode: "fast" },
      },
      student,
    );
    const stale = structuredClone(u);
    stale.entries[0].visible = false;
    await expect(repo.saveUniverse(stale)).rejects.toThrow("另一个窗口");
    const p = fixturePlanet(2);
    u.entries.push({
      planetId: p.planetId,
      visible: true,
      position: { x: 50, y: 20 },
      scale: 1,
      order: 2,
    });
    await repo.importAtomic([p], u, new Map(), "append");
    expect((await repo.getUniverse()).entries[0].motion?.mode).toBe("fast");
    expect((await repo.getUniverse()).entries[2].layoutRevision).toBe(0);
    await expect(
      service.configureMotion(
        {
          universeId: u.universeId,
          planetId: p.planetId,
          position: { x: 0, y: 0 },
          expectedLayoutRevision: 0,
          motion: DEFAULT_PLANET_MOTION,
        },
        student,
      ),
    ).rejects.toThrow("学生只能");
    await service.configureMotion(
      {
        universeId: u.universeId,
        planetId: p.planetId,
        position: { x: 0, y: 0 },
        expectedLayoutRevision: 0,
        motion: DEFAULT_PLANET_MOTION,
      },
      teacher,
    );
    await repo.removeFromUniverse(p.planetId);
    const addedPlanet = fixturePlanet(3);
    u.entries.push({
      planetId: addedPlanet.planetId,
      visible: true,
      position: { x: 70, y: 30 },
      scale: 1,
      order: 3,
    });
    await repo.importAtomic([addedPlanet], u, new Map(), "after-removal");
    expect(
      (await repo.getUniverse()).entries.some((e) => e.planetId === p.planetId),
    ).toBe(false);
    const before = await repo.getUniverse();
    before.entries[0].visible = false;
    await repo.saveUniverse(before);
    const hidden = await repo.getUniverse();
    hidden.entries[0].visible = true;
    await repo.saveUniverse(hidden);
    await expect(
      service.configureMotion(
        {
          universeId: u.universeId,
          planetId: e.planetId,
          position: e.position,
          expectedLayoutRevision: 1,
          motion: DEFAULT_PLANET_MOTION,
        },
        student,
      ),
    ).rejects.toThrow("另一个窗口");
    await repo.close();
  });
});
