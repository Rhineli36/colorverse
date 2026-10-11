import "fake-indexeddb/auto";
import { describe, it, expect } from "vitest";
import { LocalWorkspace } from "../apps/web/src/adapters/local/store";
import { fixturePlanet, fixtureUniverse } from "@colorverse/fixtures";
import { demoBodyRecord } from "../apps/web/src/app/bootstrap";
import manifest from "../apps/web/src/app/demo-assets.json";
import {
  panoramaFrame,
  UNIVERSE_PANORAMA,
} from "../packages/renderer/src/atmosphere-model";
import { zoomAt } from "@colorverse/domain";

describe("one owned planet entry", () => {
  it("creates once across two concurrent windows and retains other planets/layout", async () => {
    const name = crypto.randomUUID(),
      a = new LocalWorkspace(name),
      b = new LocalWorkspace(name),
      original = fixturePlanet(0),
      universe = fixtureUniverse([original]);
    universe.entries[0].visible = false;
    await a.importAtomic([original], universe, new Map(), "seed");
    await a.assignOwner(original.planetId, "another-student");
    const results = await Promise.all([
      a.createOwnedPlanet(fixturePlanet(1), new Map(), "new-student"),
      b.createOwnedPlanet(fixturePlanet(2), new Map(), "new-student"),
    ]);
    expect(results.filter((r) => r.created)).toHaveLength(1);
    expect(results[0].planetId).toBe(results[1].planetId);
    expect(await a.list()).toHaveLength(2);
    expect((await a.getUniverse()).entries[0]).toEqual(universe.entries[0]);
    expect(await a.getPlanetOwner(results[0].planetId)).toBe("new-student");
    expect(await a.getPlanetOwner(original.planetId)).toBe("another-student");
    await a.close();
    await b.close();
  });
  it("does not create a duplicate even if the student's planet is hidden", async () => {
    const repo = new LocalWorkspace(crypto.randomUUID()),
      p = fixturePlanet(0),
      u = fixtureUniverse([p]);
    u.entries[0].visible = false;
    await repo.importAtomic([p], u, new Map(), "seed");
    await repo.assignOwner(p.planetId, "student");
    expect(
      await repo.createOwnedPlanet(fixturePlanet(1), new Map(), "student"),
    ).toEqual({ planetId: p.planetId, created: false });
    expect(await repo.list()).toHaveLength(1);
    await repo.close();
  });
  it("rolls back creation, ownership and layout if an asset path collides", async () => {
    const repo = new LocalWorkspace(crypto.randomUUID()),
      p = fixturePlanet(0),
      u = fixtureUniverse([p]);
    await repo.importAtomic(
      [p],
      u,
      new Map([["collision", new Blob(["original"])]]),
      "seed",
    );
    await expect(
      repo.createOwnedPlanet(
        fixturePlanet(1),
        new Map([
          ["new-file", new Blob(["new"])],
          ["collision", new Blob(["replacement"])],
        ]),
        "student",
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    expect(await repo.getUniverse()).toEqual(u);
    expect(await repo.list()).toHaveLength(1);
    expect(await repo.getOwnership()).toEqual({});
    expect(await (await repo.read("collision")).text()).toBe("original");
    await expect(repo.read("new-file")).rejects.toMatchObject({
      code: "MISSING_ASSET",
    });
    await repo.close();
  });
  it("initializes demo ownership only once and never revives removed demo identities", async () => {
    const repo = new LocalWorkspace(crypto.randomUUID()),
      p = fixturePlanet(0),
      late = fixturePlanet(1);
    await repo.importAtomic([p], fixtureUniverse([p]), new Map(), "seed");
    await repo.initializeDemoOwnership([p.planetId, late.planetId]);
    await repo.importAtomic(
      [late],
      fixtureUniverse([p, late]),
      new Map(),
      "late",
    );
    await repo.initializeDemoOwnership([p.planetId, late.planetId]);
    expect(await repo.getPlanetOwner(p.planetId)).toBe("demo-student-1");
    expect(await repo.getPlanetOwner(late.planetId)).toBeNull();
    await repo.close();
  });
});
describe("versioned default art upgrade", () => {
  it("replaces only the verified demo body reference, retaining edits, originals and history", async () => {
    const repo = new LocalWorkspace(crypto.randomUUID()),
      p = fixturePlanet(0),
      old = p.assetRefs[0],
      replacement = demoBodyRecord(0),
      path = replacement.original.path;
    old.original.sha256 = manifest.bodies[0].previousSha256;
    p.metadata.name = "我的命名";
    p.exterior.scene.layers[0].adjustments.saturation = 0.7;
    p.exterior.scene.layers[0].transform.x = 820;
    await repo.importAtomic(
      [p],
      fixtureUniverse([p]),
      new Map([[old.original.path, new Blob(["old"])]]),
      "seed",
    );
    await repo.assignOwner(p.planetId, "student");
    expect(
      await repo.upgradeDemoBody(
        p.planetId,
        old.assetId,
        old.original.sha256,
        replacement,
        new Map([[path, new Blob(["v2"])]]),
      ),
    ).toBe(true);
    const expected = structuredClone(p);
    const body = expected.exterior.scene.layers[0];
    if ("assetId" in body.source) body.source.assetId = replacement.assetId;
    expected.assetRefs.push(replacement);
    expected.revision++;
    expect(await repo.get(p.planetId)).toEqual(expected);
    expect(await repo.getBaseline(p.planetId)).toEqual(p);
    expect(await repo.getPlanetOwner(p.planetId)).toBe("student");
    expect(await (await repo.read(old.original.path)).text()).toBe("old");
    expect(
      await repo.upgradeDemoBody(
        p.planetId,
        old.assetId,
        old.original.sha256,
        replacement,
        new Map([[path, new Blob(["wrong"])]]),
      ),
    ).toBe(false);
    expect(await (await repo.read(path)).text()).toBe("v2");
    await expect(repo.save(p, 0)).rejects.toMatchObject({
      code: "REVISION_CONFLICT",
    });
    // An intentional reset to an old revision must not be upgraded a second time.
    await repo.save(p, 1);
    expect(
      await repo.upgradeDemoBody(
        p.planetId,
        old.assetId,
        old.original.sha256,
        replacement,
        new Map(),
      ),
    ).toBe(false);
    await repo.close();
  });
  it("skips student uploads, changed asset hashes and non-system artwork", async () => {
    for (const kind of ["upload", "hash", "rights"]) {
      const repo = new LocalWorkspace(crypto.randomUUID()),
        p = fixturePlanet(0),
        old = p.assetRefs[0];
      old.original.sha256 = manifest.bodies[0].previousSha256;
      if (kind === "upload") {
        const upload = structuredClone(old);
        upload.assetId = crypto.randomUUID();
        p.assetRefs.push(upload);
        const body = p.exterior.scene.layers[0];
        if ("assetId" in body.source) body.source.assetId = upload.assetId;
      }
      if (kind === "hash") old.original.sha256 = "f".repeat(64);
      if (kind === "rights") old.rights.license = "student-original";
      await repo.importAtomic([p], fixtureUniverse([p]), new Map(), "seed");
      expect(
        await repo.upgradeDemoBody(
          p.planetId,
          old.assetId,
          manifest.bodies[0].previousSha256,
          demoBodyRecord(0),
          new Map(),
        ),
      ).toBe(false);
      expect(await repo.get(p.planetId)).toEqual(p);
      await repo.close();
    }
  });
});
describe("single panorama camera", () => {
  it("expands the nebula two by two around the existing classroom center", () => {
    const f = panoramaFrame(1, 0, 0);
    expect(f.width).toBe(8000 * 2);
    expect(f.height).toBe(4500 * 2);
    expect(f.x + f.width / 2).toBe(800);
    expect(f.y + f.height / 2).toBe(450);
    // Previously outside the nebula; now lies inside the expanded region.
    expect(f.x).toBeLessThan(-6000);
    expect(f.x + f.width).toBeGreaterThan(7000);
    expect(f.y).toBeLessThan(-3500);
    expect(f.y + f.height).toBeGreaterThan(4000);
  });
  it("never pins image size or panning, including the old cover-floor interval", () => {
    for (const zoom of [0.04, 0.1, 0.2, 0.38, 1, 2])
      for (const x of [-100000, 0, 100000]) {
        const a = panoramaFrame(zoom, x, -x),
          b = panoramaFrame(zoom * 2, x, -x),
          c = panoramaFrame(zoom, x + 50, -x + 30);
        expect(b.width / a.width).toBe(2);
        expect(b.height / a.height).toBe(2);
        expect(c.x - a.x).toBe(50);
        expect(c.y - a.y).toBe(30);
      }
  });
  it("keeps the same off-center image landmark under the mouse when zooming", () => {
    const point = { x: 1800, y: -400 },
      camera = { x: 350, y: -90, zoom: 0.1 },
      next = zoomAt(camera, point, 0.18);
    for (const base of [0.24, 1, 2.15]) {
      const frame = (c: typeof camera) =>
        panoramaFrame(
          base * c.zoom,
          base * (800 * (1 - c.zoom) + c.x),
          base * (450 * (1 - c.zoom) + c.y),
        );
      const a = frame(camera),
        b = frame(next),
        u =
          (point.x - UNIVERSE_PANORAMA.centerX) / UNIVERSE_PANORAMA.width + 0.5,
        v =
          (point.y - UNIVERSE_PANORAMA.centerY) / UNIVERSE_PANORAMA.height +
          0.5;
      expect(a.x + a.width * u).toBeCloseTo(b.x + b.width * u);
      expect(a.y + a.height * v).toBeCloseTo(b.y + b.height * v);
    }
  });
});
